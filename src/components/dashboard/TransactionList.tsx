
'use client';

import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency, cn } from '@/lib/utils';
import { Pencil, Trash2, Info, RotateCcw, ShoppingBag } from 'lucide-react'; // Added RotateCcw for Restore, ShoppingBag for sale detail
import type { Transaction, SaleDetail } from '@/types/transaction'; // Import the updated type
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"; // Import Popover
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog'; // Import Dialog for sale detail


interface TransactionListProps {
  transactions: Transaction[];
  showUserName?: boolean; // Prop to control showing the user name column
  isAdminView?: boolean; // Prop to indicate if viewed by admin
  onEdit?: (transaction: Transaction) => void; // Callback for editing
  onCancel?: (transaction: Transaction) => void; // Callback for cancelling
  onRestore?: (transaction: Transaction) => void; // Callback for restoring
}

// Helper function to convert Firestore Timestamp or Date to Date
const getDate = (timestamp: Transaction['timestamp']): Date => {
  if (!timestamp) return new Date(); // Should not happen normally
  if (timestamp instanceof Date) {
    return timestamp;
  }
  // Check if it's a Firestore Timestamp-like object before calling toDate()
  return timestamp && typeof timestamp === 'object' && 'toDate' in timestamp && typeof timestamp.toDate === 'function'
    ? timestamp.toDate()
    : new Date();
};


const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  showUserName = false,
  isAdminView = false,
  onEdit,
  onCancel,
  onRestore
}) => {
  const [saleDetailOpen, setSaleDetailOpen] = React.useState(false);
  const [selectedSale, setSelectedSale] = React.useState<Transaction | null>(null);


  const openSaleDetail = (transaction: Transaction) => {
    if (transaction.saleDetails && transaction.saleDetails.length > 0) {
      setSelectedSale(transaction);
      setSaleDetailOpen(true);
    }
  }

  if (transactions.length === 0) {
    return <p className="text-center text-muted-foreground">No hay movimientos registrados.</p>;
  }


  return (
      <>
        <div className="overflow-x-auto">
            <Table>
            <TableHeader>
                <TableRow>
                <TableHead>Fecha</TableHead>
                {showUserName && <TableHead>Usuario</TableHead>}
                <TableHead>Tipo</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                {/* Optional: Add column for Sale Detail icon */}
                <TableHead className="text-center w-auto px-1">Detalle</TableHead>
                {isAdminView && <TableHead className="text-center w-auto px-1">Info</TableHead>}
                {isAdminView && <TableHead className="text-center w-auto px-1">Acciones</TableHead>}
                </TableRow>
            </TableHeader>
            <TableBody>
                {transactions.map((transaction) => {
                const isPurchase = transaction.type === 'purchase';
                const transactionDate = getDate(transaction.timestamp);
                const formattedDate = transactionDate ? format(transactionDate, 'dd MMM yyyy', { locale: es }) : 'Fecha inválida';
                const formattedTime = transactionDate ? format(transactionDate, 'HH:mm', { locale: es }) : '--:--';
                const modifiedDate = transaction.modifiedAt ? getDate(transaction.modifiedAt) : null;
                const cancelledDate = transaction.cancelledAt ? getDate(transaction.cancelledAt) : null;
                const restoredDate = transaction.restoredAt ? getDate(transaction.restoredAt) : null;


                // Determine text color based on transaction type if not cancelled
                const amountColor = transaction.isCancelled
                    ? 'text-muted-foreground'
                    : isPurchase
                    ? 'text-destructive'
                    : 'text-green-600'; // Use green for payments

                const amountPrefix = transaction.isCancelled ? '' : (isPurchase ? '-' : '+');
                const formattedAmount = `${amountPrefix}${formatCurrency(transaction.amount)}`;
                const hasSaleDetails = !!transaction.saleDetails && transaction.saleDetails.length > 0;


                return (
                    <TableRow key={transaction.id} className={cn(transaction.isCancelled && "opacity-60")}>
                    <TableCell className={cn("whitespace-nowrap text-xs", transaction.isCancelled && "line-through")}>
                        <div className="flex flex-col">
                            <span>{formattedDate}</span>
                            <span className="text-muted-foreground">{formattedTime}</span>
                        </div>
                    </TableCell>
                    {showUserName && <TableCell className={cn(transaction.isCancelled && "line-through")}>{transaction.addedByName || transaction.addedBy || 'N/A'}</TableCell>}
                    <TableCell>
                        <Badge variant={transaction.isCancelled ? 'outline' : (isPurchase ? 'destructive' : 'default')} className={cn("capitalize", transaction.isCancelled && "border-dashed")}>
                        {transaction.isCancelled ? 'Cancelado' : (isPurchase ? (hasSaleDetails ? 'Venta' : 'Compra') : 'Pago')}
                        </Badge>
                    </TableCell>
                    <TableCell className={cn(transaction.isCancelled && "line-through")}>{transaction.description}</TableCell>
                    <TableCell className={cn(`text-right font-medium ${amountColor}`, transaction.isCancelled && "line-through")}>
                        {formattedAmount}
                    </TableCell>
                     {/* Sale Detail Icon/Button */}
                     <TableCell className="text-center w-auto px-1">
                        {hasSaleDetails && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openSaleDetail(transaction)} title="Ver Detalle de Venta">
                                <ShoppingBag className="h-4 w-4 text-primary" />
                            </Button>
                        )}
                     </TableCell>
                    {/* Admin Info Popover */}
                    {isAdminView && (
                        <TableCell className="text-center w-auto px-1">
                        {(transaction.isModified || transaction.isCancelled || transaction.isRestored) && ( // Check for restored as well
                            <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary">
                                    <Info className="h-4 w-4" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto max-w-xs p-2 text-xs" side="top" align="center">
                                {transaction.isRestored && restoredDate && (
                                    <>Restaurado {formatDistanceToNow(restoredDate, { locale: es, addSuffix: true })} por {transaction.restoredByName || 'Admin'}<br/></>
                                )}
                                {transaction.isCancelled && cancelledDate && (
                                    <>Cancelado {formatDistanceToNow(cancelledDate, { locale: es, addSuffix: true })} por {transaction.cancelledByName || 'Admin'}<br/></>
                                )}
                                {transaction.cancellationReason && (
                                    <>Razón canc.: {transaction.cancellationReason}<br/></>
                                )}
                                {transaction.isModified && modifiedDate && (
                                    <>Modificado {formatDistanceToNow(modifiedDate, { locale: es, addSuffix: true })} por {transaction.modifiedByName || 'Admin'}<br/></>
                                )}
                                {transaction.modificationReason && (
                                    <>Razón mod.: {transaction.modificationReason}<br/></>
                                )}
                                {transaction.isModified && transaction.originalData && (
                                    <>Original: {transaction.originalData.type === 'purchase' ? '-' : '+'}{formatCurrency(transaction.originalData.amount)} ({transaction.originalData.description})</>
                                )}
                            </PopoverContent>
                            </Popover>
                        )}
                        </TableCell>
                    )}
                    {/* Admin Actions */}
                    {isAdminView && (
                        <TableCell className="text-center w-auto px-1 space-x-0 sm:space-x-1"> {/* Adjust padding and spacing */}
                        {!transaction.isCancelled ? (
                            <>
                            {/* Prevent editing sales directly, maybe only cancellation */}
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onEdit?.(transaction)}
                                aria-label={`Editar ${transaction.description}`}
                                className="h-7 w-7"
                                disabled={!onEdit || hasSaleDetails} // Disable edit for sales for now
                                title={hasSaleDetails ? "No se puede editar una venta (cancelar para revertir)" : `Editar ${transaction.description}`}
                            >
                                <Pencil className={cn("h-4 w-4", hasSaleDetails && "text-muted-foreground")}/>
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onCancel?.(transaction)}
                                aria-label={`Cancelar ${transaction.description}`}
                                className="h-7 w-7 text-destructive hover:text-destructive/90"
                                disabled={!onCancel}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                            </>
                        ) : (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onRestore?.(transaction)}
                                aria-label={`Restaurar ${transaction.description}`}
                                className="h-7 w-7 text-green-600 hover:text-green-700"
                                disabled={!onRestore}
                            >
                                <RotateCcw className="h-4 w-4" /> {/* Restore Icon */}
                            </Button>
                        )}
                        </TableCell>
                    )}
                    </TableRow>
                );
                })}
            </TableBody>
            </Table>
        </div>

         {/* Sale Detail Dialog */}
         <Dialog open={saleDetailOpen} onOpenChange={setSaleDetailOpen}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Detalle de Venta</DialogTitle>
                    {selectedSale && <DialogDescription>Venta realizada el {getDate(selectedSale.timestamp) ? format(getDate(selectedSale.timestamp), 'dd/MM/yyyy HH:mm', { locale: es }) : ''}. Total: {formatCurrency(selectedSale.amount)}</DialogDescription>}
                </DialogHeader>
                {selectedSale?.saleDetails && (
                    <div className="max-h-[60vh] overflow-y-auto mt-4">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Producto</TableHead>
                                    <TableHead className="text-center">Cant.</TableHead>
                                    <TableHead className="text-right">P. Unit.</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {selectedSale.saleDetails.map((item) => (
                                    <TableRow key={item.productId}>
                                        <TableCell>{item.productName} <span className='text-xs text-muted-foreground'>({item.productId})</span></TableCell>
                                        <TableCell className="text-center">{item.quantity}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(item.totalPrice)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
                 <DialogClose asChild>
                    <Button type="button" variant="outline" className="mt-4">Cerrar</Button>
                </DialogClose>
            </DialogContent>
        </Dialog>
      </>
  );
};

export default TransactionList;

