'use client';

import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency, cn } from '@/lib/utils';
import { Pencil, Trash2, Info } from 'lucide-react';
import type { Transaction } from '@/types/transaction'; // Import the updated type
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TransactionListProps {
  transactions: Transaction[];
  showUserName?: boolean; // Prop to control showing the user name column
  isAdminView?: boolean; // Prop to indicate if viewed by admin
  onEdit?: (transaction: Transaction) => void; // Callback for editing
  onCancel?: (transaction: Transaction) => void; // Callback for cancelling
}

// Helper function to convert Firestore Timestamp or Date to Date
const getDate = (timestamp: Transaction['timestamp']): Date => {
  if (timestamp instanceof Date) {
    return timestamp;
  }
  return timestamp?.toDate ? timestamp.toDate() : new Date();
};

const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  showUserName = false,
  isAdminView = false,
  onEdit,
  onCancel
}) => {
  if (transactions.length === 0) {
    return <p className="text-center text-muted-foreground">No hay movimientos registrados.</p>;
  }

  return (
    <TooltipProvider>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              {showUserName && <TableHead>Usuario</TableHead>}
              <TableHead>Tipo</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead className="text-right">Saldo Post.</TableHead>
              {isAdminView && <TableHead className="text-center">Info</TableHead>}
              {isAdminView && <TableHead className="text-center">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((transaction) => {
              const isPurchase = transaction.type === 'purchase';
              // Balance reflects the state *after* this transaction
              const formattedBalanceAfter = formatCurrency(transaction.balanceAfter);
              const transactionDate = getDate(transaction.timestamp);
              const modifiedDate = transaction.modifiedAt ? getDate(transaction.modifiedAt) : null;
              const cancelledDate = transaction.cancelledAt ? getDate(transaction.cancelledAt) : null;

              // Determine text color based on transaction type if not cancelled
              const amountColor = transaction.isCancelled
                  ? 'text-muted-foreground'
                  : isPurchase
                  ? 'text-destructive'
                  : 'text-green-600'; // Use green for payments

              const amountPrefix = transaction.isCancelled ? '' : (isPurchase ? '-' : '+');
              const formattedAmount = `${amountPrefix}${formatCurrency(transaction.amount)}`;


              return (
                <TableRow key={transaction.id} className={cn(transaction.isCancelled && "opacity-60")}>
                  <TableCell className={cn("whitespace-nowrap", transaction.isCancelled && "line-through")}>
                    {format(transactionDate, 'dd MMM yyyy, HH:mm', { locale: es })}
                  </TableCell>
                  {showUserName && <TableCell className={cn(transaction.isCancelled && "line-through")}>{transaction.addedByName || transaction.addedBy || 'N/A'}</TableCell>}
                  <TableCell>
                    <Badge variant={transaction.isCancelled ? 'outline' : (isPurchase ? 'destructive' : 'default')} className={cn("capitalize", transaction.isCancelled && "border-dashed")}>
                      {transaction.isCancelled ? 'Cancelado' : (isPurchase ? 'Compra' : 'Pago')}
                    </Badge>
                  </TableCell>
                  <TableCell className={cn(transaction.isCancelled && "line-through")}>{transaction.description}</TableCell>
                  <TableCell className={cn(`text-right font-medium ${amountColor}`, transaction.isCancelled && "line-through")}>
                    {formattedAmount}
                  </TableCell>
                   <TableCell className={cn("text-right", transaction.balanceAfter < 0 ? 'text-destructive' : 'text-primary', transaction.isCancelled && "line-through")}>
                    {formattedBalanceAfter}
                  </TableCell>
                  {isAdminView && (
                    <TableCell className="text-center">
                      {(transaction.isModified || transaction.isCancelled) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                             <Info className="h-4 w-4 text-muted-foreground inline-block" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">
                              {transaction.isCancelled && cancelledDate && (
                                <>Cancelado {formatDistanceToNow(cancelledDate, { locale: es, addSuffix: true })} por {transaction.cancelledByName || 'Admin'}<br/></>
                              )}
                               {transaction.isModified && modifiedDate && (
                                <>Modificado {formatDistanceToNow(modifiedDate, { locale: es, addSuffix: true })} por {transaction.modifiedByName || 'Admin'}<br/></>
                              )}
                              {transaction.modificationReason && (
                                <>Razón: {transaction.modificationReason}<br/></>
                              )}
                                {transaction.isModified && transaction.originalData && (
                                    <>Original: {transaction.originalData.type === 'purchase' ? '-' : '+'}${formatCurrency(transaction.originalData.amount)} ({transaction.originalData.description})</>
                                )}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                  )}
                  {isAdminView && (
                    <TableCell className="text-center space-x-1">
                      {!transaction.isCancelled ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onEdit?.(transaction)}
                            aria-label={`Editar ${transaction.description}`}
                            className="h-7 w-7"
                            disabled={!onEdit}
                          >
                            <Pencil className="h-4 w-4" />
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
                          <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
};

export default TransactionList;
