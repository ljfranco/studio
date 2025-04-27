'use client';

import React, { useState } from 'react';
import { useFirebase } from '@/context/FirebaseContext';
import { doc, runTransaction, Timestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import type { Transaction } from '@/types/transaction';
import { formatCurrency } from '@/lib/utils';

interface RestoreTransactionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction;
  adminUser: User | null;
  onSuccessCallback?: () => void;
}

const RestoreTransactionDialog: React.FC<RestoreTransactionDialogProps> = ({
  isOpen,
  onClose,
  transaction,
  adminUser,
  onSuccessCallback
}) => {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleRestoreConfirm = async () => {
    if (!adminUser) {
      toast({ title: 'Error', description: 'Usuario administrador no válido.', variant: 'destructive' });
      return;
    }
    if (!transaction.isCancelled) {
       toast({ title: 'Info', description: 'Esta transacción no está cancelada.', variant: 'default' });
       onClose();
       return;
    }

    setIsLoading(true);

    try {
        const transactionDocRef = doc(db, 'transactions', transaction.id);

        await runTransaction(db, async (dbTransaction) => {
            const freshDoc = await dbTransaction.get(transactionDocRef);
            if (!freshDoc.exists()) {
                throw new Error("La transacción ya no existe.");
            }

            // Update the transaction document to mark as restored (un-cancelled)
            dbTransaction.update(transactionDocRef, {
                isCancelled: false,
                cancelledAt: null,
                cancelledBy: null,
                cancelledByName: null,
                cancellationReason: null, // Clear reason
                // Add restoration info
                isRestored: true, // Mark as restored at least once
                restoredAt: Timestamp.now(),
                restoredBy: adminUser.uid,
                restoredByName: adminUser.displayName || adminUser.email || 'Admin',
                // BalanceAfter will be updated by the recalculateBalance function
            });
      });

      toast({
        title: '¡Éxito!',
        description: 'Transacción restaurada correctamente.',
      });
      onSuccessCallback?.(); // Trigger recalculation
      onClose(); // Close the dialog on success
    } catch (error) {
      console.error("Error restoring transaction:", error);
      toast({
        title: 'Error',
        description: `No se pudo restaurar la transacción. ${error instanceof Error ? error.message : String(error)}`,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Restaurar Transacción?</AlertDialogTitle>
          <AlertDialogDescription>
            Estás a punto de restaurar la transacción cancelada "{transaction.description}" por {formatCurrency(transaction.amount)}.
            Esta acción la volverá a incluir en el cálculo del saldo.
            ¿Estás seguro?
             {transaction.cancelledAt && (
                <span className="block mt-1 text-xs text-muted-foreground">Cancelado el: {getDate(transaction.cancelledAt).toLocaleString('es-ES')}</span>
            )}
             {transaction.cancellationReason && (
                <span className="block mt-1 text-xs text-muted-foreground">Razón cancelación: {transaction.cancellationReason}</span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={isLoading}>Volver</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleRestoreConfirm}
            disabled={isLoading}
            className="bg-green-600 text-white hover:bg-green-700" // Use green for restore
           >
             {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Sí, Restaurar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

// Helper function to convert Firestore Timestamp or Date to Date
const getDate = (timestamp: Transaction['timestamp']): Date => {
    if (!timestamp) return new Date(); // Should not happen if cancelledAt exists
    if (timestamp instanceof Date) {
      return timestamp;
    }
    return timestamp?.toDate ? timestamp.toDate() : new Date();
  };


export default RestoreTransactionDialog;
