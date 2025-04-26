'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/context/AuthContext';
import { useFirebase } from '@/context/FirebaseContext';
import { collection, addDoc, serverTimestamp, doc, runTransaction, getDoc } from 'firebase/firestore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea'; // Use Textarea for description
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const transactionSchema = z.object({
  description: z.string().min(3, { message: 'La descripción debe tener al menos 3 caracteres.' }).max(100, { message: 'La descripción no puede exceder los 100 caracteres.' }),
  amount: z.preprocess(
    (val) => Number(String(val).replace(/[^0-9.-]+/g,"")), // Clean input before validation
    z.number().positive({ message: 'El monto debe ser un número positivo.' })
  ),
});

type TransactionFormValues = z.infer<typeof transactionSchema>;

interface AddTransactionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'purchase' | 'payment';
  targetUserId?: string; // Optional: For admin adding transaction to a specific user
  isAdminAction?: boolean; // Optional: Flag if action is by admin
}

const AddTransactionDialog: React.FC<AddTransactionDialogProps> = ({
    isOpen,
    onClose,
    type,
    targetUserId,
    isAdminAction = false
 }) => {
  const { user } = useAuth(); // Get current logged-in user (could be admin or regular user)
  const { db } = useFirebase();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      description: '',
      amount: 0,
    },
  });

   // Reset form when dialog opens or type changes
   useEffect(() => {
    if (isOpen) {
      form.reset({ description: '', amount: 0 });
    }
  }, [isOpen, form]);

  const onSubmit = async (values: TransactionFormValues) => {
    setIsLoading(true);

    // Determine the target user ID
    const finalTargetUserId = isAdminAction && targetUserId ? targetUserId : user?.uid;

    if (!finalTargetUserId) {
      toast({
        title: 'Error',
        description: 'No se pudo identificar al usuario.',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    const amount = values.amount;
    const transactionAmount = type === 'purchase' ? amount : -amount; // Payments decrease balance

    try {
       // Use Firestore transaction to ensure atomicity
       await runTransaction(db, async (transaction) => {
            const userDocRef = doc(db, 'users', finalTargetUserId);
            const userDoc = await transaction.get(userDocRef);

            if (!userDoc.exists()) {
                throw new Error("User document does not exist!");
            }

            const currentBalance = userDoc.data()?.balance ?? 0;
            const newBalance = currentBalance + transactionAmount;

            // 1. Update user's balance
            transaction.update(userDocRef, { balance: newBalance });

            // 2. Add transaction record
            const transactionsColRef = collection(db, 'transactions');
            await transaction.set(doc(transactionsColRef), { // Use transaction.set with a new doc ref
                 userId: finalTargetUserId,
                 type: type,
                 description: values.description,
                 amount: amount, // Store the absolute amount
                 balanceAfter: newBalance, // Store balance after transaction for history
                 timestamp: serverTimestamp(),
                 addedBy: user?.uid, // Record who added the transaction (could be admin or the user themselves)
                 addedByName: user?.displayName || user?.email, // Optional: store name/email of adder
                 isAdminAction: isAdminAction, // Flag if added by admin
            });
       });


      toast({
        title: '¡Éxito!',
        description: `Se ${type === 'purchase' ? 'agregó la compra' : 'registró el pago'} correctamente.`,
      });
      onClose(); // Close the dialog on success
    } catch (error) {
      console.error("Error adding transaction:", error);
      toast({
        title: 'Error',
        description: `No se pudo ${type === 'purchase' ? 'agregar la compra' : 'registrar el pago'}. Intenta de nuevo.`,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const dialogTitle = type === 'purchase' ? 'Agregar Nueva Compra' : 'Registrar Nuevo Pago';
  const dialogDescription = type === 'purchase'
    ? 'Ingresa los detalles de la compra realizada.'
    : 'Ingresa los detalles del pago realizado.';
   const amountLabel = type === 'purchase' ? 'Monto de la Compra' : 'Monto del Pago';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
            {isAdminAction && targetUserId && (
                <p className="text-sm text-muted-foreground pt-2">Estás registrando esto para otro usuario.</p>
            )}
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={type === 'purchase' ? 'Ej: Pan, Leche...' : 'Ej: Pago quincena...'}
                      {...field}
                      rows={3}
                     />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{amountLabel}</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="0.00" {...field} step="0.01" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <DialogFooter>
               <DialogClose asChild>
                   <Button type="button" variant="outline" disabled={isLoading}>
                     Cancelar
                   </Button>
               </DialogClose>
               <Button type="submit" disabled={isLoading} className="bg-primary hover:bg-primary/90">
                 {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Guardar'}
               </Button>
             </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AddTransactionDialog;
