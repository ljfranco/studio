
'use client';

import React, { useState } from 'react';
import { useFirebase } from '@/context/FirebaseContext';
import { doc, runTransaction, Timestamp, collection, getDoc, writeBatch } from 'firebase/firestore'; // Added collection, getDoc, writeBatch
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
} from "@/components/ui/alert-dialog"; // Use AlertDialog for confirmation
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; // Use Input for reason
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import type { Transaction, SaleDetail } from '@/types/transaction'; // Import SaleDetail
import type { Product } from '@/types/product'; // Import Product type

interface CancelTransactionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction;
  adminUser: User | null; // Admin performing the action
  onSuccessCallback?: () => void; // Optional: Callback after successful cancellation
}

const CancelTransactionDialog: React.FC<CancelTransactionDialogProps> = ({
  isOpen,
  onClose,
  transaction,
  adminUser,
  onSuccessCallback
}) => {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [cancellationReason, setCancellationReason] = useState(''); // State for reason

  const handleCancelConfirm = async () => {
    if (!adminUser) {
      toast({ title: 'Error', description: 'Usuario administrador no válido.', variant: 'destructive' });
      return;
    }
    if (transaction.isCancelled) {
       toast({ title: 'Info', description: 'Esta transacción ya está cancelada.', variant: 'default' });
       onClose();
       return;
    }

    setIsLoading(true);

    try {
        const transactionDocRef = doc(db, 'transactions', transaction.id);
        const isSaleTransaction = transaction.saleDetails && transaction.saleDetails.length > 0;

        await runTransaction(db, async (dbTransaction) => {
            // 1. Read the transaction again inside the transaction
            const freshDoc = await dbTransaction.get(transactionDocRef);
            if (!freshDoc.exists()) {
                throw new Error("La transacción ya no existe.");
            }
            const freshTransactionData = freshDoc.data() as Transaction;

            // 2. If it's a sale, read products and prepare stock updates
            const productUpdates: { ref: any, newQuantity: number }[] = [];
            if (isSaleTransaction && freshTransactionData.saleDetails) {
                console.log("Cancelling a sale transaction. Restoring stock...");
                for (const item of freshTransactionData.saleDetails) {
                    const productRef = doc(db, 'products', item.productId);
                    const productDoc = await dbTransaction.get(productRef);
                    if (!productDoc.exists()) {
                        // If product doesn't exist, we can't restore stock, but cancellation might still proceed. Log a warning.
                        console.warn(`Product ${item.productId} not found during sale cancellation stock restoration.`);
                        // Optionally throw an error if stock restoration is critical:
                        // throw new Error(`Producto ${item.productId} no encontrado al intentar restaurar stock.`);
                    } else {
                        const currentQuantity = productDoc.data()?.quantity ?? 0;
                        const newQuantity = currentQuantity + item.quantity;
                        productUpdates.push({ ref: productRef, newQuantity });
                         console.log(`Product ${item.productId}: Current Qty ${currentQuantity}, Restoring ${item.quantity}, New Qty ${newQuantity}`);
                    }
                }
            }

            // 3. Update the transaction document to mark as cancelled
            dbTransaction.update(transactionDocRef, {
                isCancelled: true,
                cancelledAt: Timestamp.now(),
                cancelledBy: adminUser.uid,
                cancelledByName: adminUser.displayName || adminUser.email || 'Admin',
                cancellationReason: cancellationReason.trim() || null, // Add reason, store null if empty
                // BalanceAfter will be updated by the recalculateBalance function

                // Clear restoration fields if they exist
                isRestored: false,
                restoredAt: null,
                restoredBy: null,
                restoredByName: null,
            });

            // 4. Apply product stock updates (if any)
            productUpdates.forEach(update => {
                 dbTransaction.update(update.ref, { quantity: update.newQuantity });
            });
      });

      // Stock updated within the transaction

      toast({
        title: '¡Éxito!',
        description: `Transacción ${isSaleTransaction ? 'de venta ' : ''}cancelada correctamente.${isSaleTransaction ? ' Stock restaurado.' : ''}`,
      });
      setCancellationReason(''); // Reset reason field
      console.log("[Dialog] Calling onSuccessCallback (recalculateBalance)...");
      onSuccessCallback?.(); // Trigger recalculation BEFORE closing
      onClose(); // Close the dialog on success
    } catch (error) {
      console.error("Error cancelling transaction:", error);
      toast({
        title: 'Error',
        description: `No se pudo cancelar la transacción. ${error instanceof Error ? error.message : String(error)}`,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

   // Reset reason when dialog opens
   React.useEffect(() => {
    if (isOpen) {
      setCancellationReason('');
    }
  }, [isOpen]);


  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => {if (!open) {setCancellationReason(''); onClose();}}}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Confirmar Cancelación?</AlertDialogTitle>
          <AlertDialogDescription>
            Estás a punto de cancelar la transacción "{transaction.description}" por {transaction.amount}.
            Esta acción marcará la transacción como cancelada y recalculará el saldo. La transacción permanecerá visible en el historial pero tachada.
             {transaction.saleDetails && transaction.saleDetails.length > 0 && (
                <span className="block mt-1 font-semibold text-orange-600">Esta es una venta. Se restaurará el stock de los productos involucrados.</span>
             )}
             {transaction.isModified && <span className="block mt-1 text-xs text-orange-600">Nota: Esta transacción fue modificada previamente.</span>}
          </AlertDialogDescription>
        </AlertDialogHeader>
         <div className="space-y-2">
              <Label htmlFor="cancellationReason">Razón (Opcional)</Label>
              <Input
                id="cancellationReason"
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Ej: Error de registro, Duplicado..."
                disabled={isLoading}
                maxLength={100} // Add character limit if needed
              />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={isLoading}>Volver</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCancelConfirm}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
           >
             {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Sí, Cancelar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default CancelTransactionDialog;

