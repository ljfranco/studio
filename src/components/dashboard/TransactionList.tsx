'use client';

import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale'; // Import Spanish locale
import { formatCurrency } from '@/lib/utils'; // Import formatting utility

interface Transaction {
  id: string;
  type: 'purchase' | 'payment';
  description: string;
  amount: number;
  timestamp: Date; // Expect Date object now
  userName?: string; // Optional user name for admin view
}

interface TransactionListProps {
  transactions: Transaction[];
   showUserName?: boolean; // Prop to control showing the user name column
}

const TransactionList: React.FC<TransactionListProps> = ({ transactions, showUserName = false }) => {
  if (transactions.length === 0) {
    return <p className="text-center text-muted-foreground">No hay movimientos registrados.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
             {showUserName && <TableHead>Usuario</TableHead>}
            <TableHead>Tipo</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead className="text-right">Monto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((transaction) => (
            <TableRow key={transaction.id}>
              <TableCell className="whitespace-nowrap">
                {format(transaction.timestamp, 'dd MMM yyyy, HH:mm', { locale: es })}
              </TableCell>
               {showUserName && <TableCell>{transaction.userName || 'N/A'}</TableCell>}
              <TableCell>
                <Badge variant={transaction.type === 'purchase' ? 'destructive' : 'default'} className="capitalize">
                  {transaction.type === 'purchase' ? 'Compra' : 'Pago'}
                </Badge>
              </TableCell>
              <TableCell>{transaction.description}</TableCell>
              <TableCell className={`text-right font-medium ${transaction.type === 'purchase' ? 'text-destructive' : 'text-green-600'}`}>
                {formatCurrency(transaction.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default TransactionList;
