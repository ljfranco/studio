'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/context/AuthContext';
import { useFirebase } from '@/context/FirebaseContext';
import { collection, addDoc, serverTimestamp, doc, runTransaction, Timestamp, getDoc, setDoc } from 'firebase/firestore'; // Added Timestamp
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
import type { Transaction } from '@/types/transaction'; // Import type if needed elsewhere, but not strictly necessary here

// Make description optional and allow empty string
const transactionSchema = z.object({
  description: z.string().max(100, { message: 'La descripción no puede exceder los 100 caracteres.' }).optional(),
  amount: z.preprocess(
    (val) => Number(String(val).replace(/[^0-9.-]+/g, "")), // Clean input before validation
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
  onSuccessCallback?: () => void; // Optional callback on success
}

const AddTransactionDialog: React.FC<AddTransactionDialogProps> = ({
  isOpen,
  onClose,
  type,
  targetUserId,
  isAdminAction = false,
  onSuccessCallback
}) => {
  const { user } = useAuth(); // Get current logged-in user (could be admin or regular user)
  const { db } = useFirebase();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      description: '',
      amount: '' as any, // Initialize with empty string to avoid uncontrolled input warning
    },
  });

  // Reset form when dialog opens or type changes
  useEffect(() => {
    if (isOpen) {
      form.reset({ description: '', amount: '' as any }); // Reset with empty string
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

    // Set default description if empty
    const description = values.description?.trim() || (type === 'purchase' ? 'Compra' : 'Pago');
    const amount = values.amount; // Amount is always positive from input
    // The effect on balance depends on the type, but balanceAfter will be calculated later.

    try {
      // Use Firestore transaction (although less critical for adding new, still good practice)
      const transactionsColRef = collection(db, 'transactions');
      const newTransactionRef = doc(transactionsColRef); // Generate a new ref first

      await runTransaction(db, async (transaction) => {
         const userDocRef = doc(db, 'users', finalTargetUserId);
         const userDoc = await transaction.get(userDocRef);

         if (!userDoc.exists()) {
             // Option 1: Create user if not exists (as before)
            // const initialUserData = { /* ... */ };
            // transaction.set(userDocRef, initialUserData);

            // Option 2: Throw error if admin tries to add to non-existent user
             if (isAdminAction) {
                throw new Error(`El usuario con ID ${finalTargetUserId} no existe.`);
             }
             // Handle regular user case if needed (maybe create user doc here?)
             // For now, let's assume admin must ensure user exists or handle creation elsewhere
             else {
                 // This case shouldn't happen if users are created on signup
                 console.warn(`User document missing for non-admin action by ${user?.uid}`);
                 throw new Error("Error interno al procesar la transacción.");
             }
         }

         // Add transaction record - balanceAfter will be set during recalculation
         transaction.set(newTransactionRef, {
            userId: finalTargetUserId,
            type: type,
            description: description,
            amount: amount, // Store the absolute amount
            balanceAfter: 0, // Placeholder, will be updated by recalculation
            timestamp: Timestamp.now(), // Use Firestore Timestamp
            addedBy: user?.uid,
            addedByName: user?.displayName || user?.email,
            isAdminAction: isAdminAction,
            isCancelled: false, // Initialize cancellation/modification fields
            isModified: false,
        });
      });


      toast({
        title: '¡Éxito!',
        description: `Se ${type === 'purchase' ? 'agregó la compra' : 'registró el pago'} correctamente. Recalculando saldo...`,
      });
      onSuccessCallback?.(); // Trigger recalculation
      onClose(); // Close the dialog on success
    } catch (error) {
      console.error("Error adding transaction:", error);
      toast({
        title: 'Error',
        description: `No se pudo ${type === 'purchase' ? 'agregar la compra' : 'registrar el pago'}. Intenta de nuevo. Error: ${error instanceof Error ? error.message : String(error)}`,
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
                  <FormLabel>Descripción (Opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={type === 'purchase' ? 'Ej: Pan, Leche... (Predeterminado: Compra)' : 'Ej: Pago quincena... (Predeterminado: Pago)'}
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
                    <Input type="number" placeholder="0.00" {...field} step="0.01" value={field.value ?? ''}/>
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
