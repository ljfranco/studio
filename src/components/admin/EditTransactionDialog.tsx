'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useFirebase } from '@/context/FirebaseContext';
import { doc, runTransaction, Timestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';
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
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
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
import type { Transaction } from '@/types/transaction'; // Import the updated type

// Schema for editing transaction
const editTransactionSchema = z.object({
  description: z.string().max(100, { message: 'La descripción no puede exceder los 100 caracteres.' }).optional(),
  amount: z.preprocess(
    (val) => Number(String(val).replace(/[^0-9.-]+/g, "")),
    z.number().positive({ message: 'El monto debe ser un número positivo.' })
  ),
  type: z.enum(['purchase', 'payment'], { required_error: 'Debes seleccionar un tipo.' }),
  modificationReason: z.string().max(150, { message: 'La razón no puede exceder los 150 caracteres.' }).optional(),
});

type EditTransactionFormValues = z.infer<typeof editTransactionSchema>;

interface EditTransactionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction;
  adminUser: User | null; // Admin performing the action
  onSuccessCallback?: () => void; // Optional: Callback after successful edit
}

const EditTransactionDialog: React.FC<EditTransactionDialogProps> = ({
  isOpen,
  onClose,
  transaction,
  adminUser,
  onSuccessCallback
}) => {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<EditTransactionFormValues>({
    resolver: zodResolver(editTransactionSchema),
    defaultValues: {
      description: transaction.description || '',
      amount: transaction.amount || 0,
      type: transaction.type || 'purchase',
      modificationReason: '',
    },
  });

   // Reset form when dialog opens or transaction changes
  useEffect(() => {
    if (isOpen && transaction) {
        form.reset({
            description: transaction.description || '',
            amount: transaction.amount || 0,
            type: transaction.type || 'purchase',
            modificationReason: '', // Reset reason each time
        });
    }
  }, [isOpen, transaction, form]);

  const onSubmit = async (values: EditTransactionFormValues) => {
    if (!adminUser) {
        toast({ title: 'Error', description: 'Usuario administrador no válido.', variant: 'destructive' });
        return;
    }
    setIsLoading(true);

    const description = values.description?.trim() || (values.type === 'purchase' ? 'Compra' : 'Pago');
    const amount = values.amount;
    const type = values.type;
    const modificationReason = values.modificationReason?.trim();

    // Check if anything actually changed
    if (
        description === transaction.description &&
        amount === transaction.amount &&
        type === transaction.type
    ) {
        toast({ title: 'Sin Cambios', description: 'No se realizaron modificaciones.', variant: 'default' });
        setIsLoading(false);
        onClose();
        return;
    }


    try {
        const transactionDocRef = doc(db, 'transactions', transaction.id);

        // Store original data before modifying (excluding modification/cancellation fields)
        const originalData = {
            userId: transaction.userId,
            type: transaction.type,
            description: transaction.description,
            amount: transaction.amount,
            balanceAfter: transaction.balanceAfter, // Store the *old* balanceAfter
            timestamp: transaction.timestamp,
            addedBy: transaction.addedBy,
            addedByName: transaction.addedByName,
            isAdminAction: transaction.isAdminAction,
        };


        await runTransaction(db, async (dbTransaction) => {
           // Read the transaction again inside the transaction to ensure we have the latest data (optional but safer)
            const freshDoc = await dbTransaction.get(transactionDocRef);
            if (!freshDoc.exists()) {
                throw new Error("La transacción ya no existe.");
            }

            // Update the transaction document
             dbTransaction.update(transactionDocRef, {
                description: description,
                amount: amount,
                type: type,
                isModified: true,
                modifiedAt: Timestamp.now(),
                modifiedBy: adminUser.uid,
                modifiedByName: adminUser.displayName || adminUser.email || 'Admin',
                modificationReason: modificationReason || null, // Store null if empty
                originalData: originalData, // Store the original data snapshot
                // BalanceAfter will be updated by the recalculateBalance function
            });
        });


      toast({
        title: '¡Éxito!',
        description: 'Transacción modificada correctamente.',
      });
      onClose(); // Close the dialog on success
      onSuccessCallback?.(); // Trigger recalculation after closing
    } catch (error) {
      console.error("Error editing transaction:", error);
      toast({
        title: 'Error',
        description: `No se pudo modificar la transacción. ${error instanceof Error ? error.message : String(error)}`,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Movimiento</DialogTitle>
          <DialogDescription>Modifica los detalles de la transacción seleccionada.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                <FormItem className="space-y-3">
                    <FormLabel>Tipo de Movimiento</FormLabel>
                    <FormControl>
                    <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="flex space-x-4"
                    >
                        <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                            <RadioGroupItem value="purchase" />
                        </FormControl>
                        <FormLabel className="font-normal">Compra</FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                            <RadioGroupItem value="payment" />
                        </FormControl>
                        <FormLabel className="font-normal">Pago</FormLabel>
                        </FormItem>
                    </RadioGroup>
                    </FormControl>
                    <FormMessage />
                </FormItem>
                )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción (Opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                       placeholder={form.getValues('type') === 'purchase' ? 'Ej: Pan, Leche... (Predeterminado: Compra)' : 'Ej: Pago quincena... (Predeterminado: Pago)'}
                       {...field}
                       rows={2}
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
                  <FormLabel>Monto</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="0.00" {...field} step="0.01" value={field.value ?? ''}/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="modificationReason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Razón de Modificación (Opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                       placeholder="Ej: Corrección de monto..."
                       {...field}
                       rows={2}
                    />
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
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Guardar Cambios'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default EditTransactionDialog;
