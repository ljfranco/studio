
'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/context/AuthContext';
import { useFirebase } from '@/context/FirebaseContext';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { collection, getDocs, doc, runTransaction, Timestamp, writeBatch, query, where, orderBy, getDoc, setDoc, addDoc } from 'firebase/firestore'; // Added addDoc
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import { DollarSign, User, Loader2 } from 'lucide-react';
import type { User as AuthUser } from 'firebase/auth';
import type { UserData } from '@/types/user';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

// Schema for collection form validation
const collectionSchema = z.object({
  userId: z.string().min(1, { message: 'Debes seleccionar un cliente.' }),
  amount: z.preprocess(
    (val) => Number(String(val).replace(/[^0-9.]+/g, "")), // Clean input
    z.number().positive({ message: 'El monto debe ser un número positivo.' })
  ),
  description: z.string().max(100, { message: 'La descripción no puede exceder los 100 caracteres.' }).optional(),
});

type CollectionFormValues = z.infer<typeof collectionSchema>;

// --- Fetching Function (excluding admin and generic) ---
const fetchUsersForCollection = async (db: any): Promise<UserData[]> => {
    const usersCol = collection(db, 'users');
    // Fetch users that are not admin and not the generic user
    const q = query(usersCol, where('role', '!=', 'admin'), where('isGeneric', '!=', true), orderBy('name'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserData));
};

// --- Recalculate Balance Logic (Copied & adapted from UserDetailView) ---
const recalculateBalance = async (userId: string, db: any, adminUser: AuthUser | null, role: string | null, toast: (options: any) => void): Promise<void> => {
    if (!userId || !db || !adminUser || role !== 'admin') return;
    console.log(`Recalculating balance for user: ${userId}`);

    try {
        const transactionsColRef = collection(db, 'transactions');
        const q = query(transactionsColRef, where('userId', '==', userId), orderBy('timestamp', 'asc'));
        const querySnapshot = await getDocs(q);

        let currentBalance = 0;
        const batch = writeBatch(db);

        querySnapshot.forEach((docSnap) => {
            const transaction = { id: docSnap.id, ...docSnap.data() } as any; // Use 'any' for simplicity here
            let transactionAmount = 0;

            if (!transaction.isCancelled) {
                transactionAmount = transaction.type === 'purchase' ? -transaction.amount : transaction.amount;
            }
            currentBalance += transactionAmount;

            if (transaction.balanceAfter !== currentBalance) {
                batch.update(docSnap.ref, { balanceAfter: currentBalance });
            }
        });

        const userDocRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists() && userSnap.data().balance !== currentBalance) {
            batch.update(userDocRef, { balance: currentBalance });
        } else if (!userSnap.exists()) {
            console.warn(`User document ${userId} not found during balance update.`);
        }

        await batch.commit();
        toast({ title: "Éxito", description: "Saldo recalculado correctamente." });
        console.log("Recalculation complete.");
    } catch (error) {
        console.error("Error recalculating balance:", error);
        toast({
            title: "Error",
            description: `No se pudo recalcular el saldo. ${error instanceof Error ? error.message : String(error)}`,
            variant: "destructive",
        });
    }
};


// --- Component ---
const CollectionForm: React.FC = () => {
    const { db } = useFirebase();
    const { user: adminUser, role } = useAuth(); // Admin performing the action
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<CollectionFormValues>({
        resolver: zodResolver(collectionSchema),
        defaultValues: {
            userId: '',
            amount: '' as any, // Initialize with empty string
            description: '',
        },
    });

    // --- Data Fetching ---
    const { data: users = [], isLoading: isLoadingUsers, error: errorUsers } = useQuery<UserData[]>({
        queryKey: ['collectionUsers'], // Distinct query key
        queryFn: () => fetchUsersForCollection(db),
        staleTime: 1000 * 60 * 5, // Cache users for 5 minutes
    });

    // --- Mutation for adding collection ---
    const addCollectionMutation = useMutation({
        mutationFn: async (values: CollectionFormValues) => {
            if (!adminUser) throw new Error("Usuario administrador no válido.");

            const description = values.description?.trim() || 'Pago'; // Default description
            const amount = values.amount;
            const userId = values.userId;

            // Create transaction document
            const transactionsColRef = collection(db, 'transactions');
            await addDoc(transactionsColRef, {
                userId: userId,
                type: 'payment',
                description: description,
                amount: amount,
                balanceAfter: 0, // Placeholder, will be updated by recalculation
                timestamp: Timestamp.now(),
                addedBy: adminUser.uid,
                addedByName: adminUser.displayName || adminUser.email,
                isAdminAction: true,
                isCancelled: false,
                isModified: false,
            });

            return userId; // Return userId for recalculation
        },
        onSuccess: (userId) => {
            toast({
                title: '¡Éxito!',
                description: `Cobranza registrada correctamente para ${users.find(u => u.id === userId)?.name}. Recalculando saldo...`,
            });
            // Trigger balance recalculation for the specific user
            recalculateBalance(userId, db, adminUser, role, toast);

            queryClient.invalidateQueries({ queryKey: ['transactions', userId] });
            queryClient.invalidateQueries({ queryKey: ['userBalance', userId] });
            queryClient.invalidateQueries({ queryKey: ['collectionUsers'] }); // Refetch users in case needed elsewhere

            form.reset(); // Reset form after successful submission
        },
        onError: (error) => {
            console.error("Error adding collection:", error);
            toast({
                title: 'Error al Registrar Cobranza',
                description: `No se pudo completar la operación. ${error instanceof Error ? error.message : String(error)}`,
                variant: 'destructive',
            });
        },
        onSettled: () => {
            setIsSubmitting(false);
        },
    });


    // --- Form Submission Handler ---
    const onSubmit = (values: CollectionFormValues) => {
        setIsSubmitting(true);
        addCollectionMutation.mutate(values);
    };


    // --- Render Logic ---
    if (errorUsers) return <p className="text-center text-destructive">Error al cargar clientes: {errorUsers instanceof Error ? errorUsers.message : 'Error desconocido'}</p>;
    if (isLoadingUsers) return <div className="flex justify-center p-4"><LoadingSpinner /></div>;

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Customer Selection */}
                <FormField
                    control={form.control}
                    name="userId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Cliente</FormLabel>
                            <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                                disabled={isSubmitting}
                            >
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecciona un cliente..." />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {users.map((user) => (
                                        <SelectItem key={user.id} value={user.id} disabled={!user.isEnabled}>
                                            {user.name} {!user.isEnabled ? '(Deshabilitado)' : ''}
                                        </SelectItem>
                                    ))}
                                    {users.length === 0 && (
                                        <div className="p-4 text-sm text-muted-foreground">No hay clientes disponibles.</div>
                                    )}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                 {/* Amount */}
                 <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Monto de la Cobranza</FormLabel>
                            <FormControl>
                                <Input type="number" placeholder="0.00" {...field} step="0.01" value={field.value ?? ''} disabled={isSubmitting} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                 {/* Optional Description */}
                 <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Descripción (Opcional)</FormLabel>
                            <FormControl>
                                <Input placeholder="Ej: Pago semanal, Adelanto... (Predeterminado: Pago)" {...field} disabled={isSubmitting} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />


                 {/* Submit Button */}
                <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={isSubmitting || users.length === 0} size="lg">
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />}
                        Confirmar Cobranza
                    </Button>
                </div>
            </form>
        </Form>
    );
};

export default CollectionForm;
