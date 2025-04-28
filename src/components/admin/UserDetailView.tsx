'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useFirebase } from '@/context/FirebaseContext';
import { doc, getDoc, collection, query, where, orderBy, onSnapshot, runTransaction, Timestamp, writeBatch, getDocs } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import TransactionList from '@/components/dashboard/TransactionList'; // Re-use TransactionList
import EditTransactionDialog from './EditTransactionDialog'; // Import Edit Dialog
import CancelTransactionDialog from './CancelTransactionDialog'; // Import Cancel Dialog
import RestoreTransactionDialog from './RestoreTransactionDialog'; // Import Restore Dialog
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PlusCircle, DollarSign, ArrowLeft, RefreshCw } from 'lucide-react'; // Added Icons
import AddTransactionDialog from '@/components/dashboard/AddTransactionDialog'; // Re-use AddTransactionDialog
import Link from 'next/link'; // Import Link for back navigation
import { useToast } from '@/hooks/use-toast';
import type { Transaction } from '@/types/transaction'; // Import the updated type


interface UserDetailViewProps {
  userId: string;
}

interface UserData {
    name: string;
    email: string;
    balance: number;
}

const UserDetailView: React.FC<UserDetailViewProps> = ({ userId }) => {
  const { user: adminUser, loading: authLoading, role } = useAuth();
  const { db } = useFirebase();
  const { toast } = useToast();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isAddPurchaseOpen, setIsAddPurchaseOpen] = useState(false);
  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isRestoreDialogOpen, setIsRestoreDialogOpen] = useState(false); // State for restore dialog
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);


  // Fetch Data Effect
  useEffect(() => {
    if (!adminUser || role !== 'admin' || !userId) {
      setLoadingData(false);
      return;
    }

    setLoadingData(true);
    let unsubscribeUser: () => void;
    let unsubscribeTransactions: () => void;

    // Fetch specific user data with real-time updates
    const userDocRef = doc(db, 'users', userId);
    unsubscribeUser = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setUserData(docSnap.data() as UserData);
      } else {
        console.warn(`User document not found for ID: ${userId}`);
        setUserData(null);
      }
    }, (error) => {
      console.error("Error fetching user data:", error);
      setUserData(null);
      setLoadingData(false); // Stop loading on error
    });

    // Fetch transactions for this specific user with real-time updates
    const transactionsColRef = collection(db, 'transactions');
    const q = query(transactionsColRef, where('userId', '==', userId), orderBy('timestamp', 'asc')); // Order ASC for recalculation

    unsubscribeTransactions = onSnapshot(q, (querySnapshot) => {
      const fetchedTransactions = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp // Keep as Timestamp or Date
      })) as Transaction[];
      setTransactions(fetchedTransactions.sort((a, b) => { // Sort DESC for display
          const dateA = a.timestamp instanceof Timestamp ? a.timestamp.toDate() : a.timestamp;
          const dateB = b.timestamp instanceof Timestamp ? b.timestamp.toDate() : b.timestamp;
          return dateB.getTime() - dateA.getTime();
      }));
      setLoadingData(false); // Set loading false after transactions are fetched
    }, (error) => {
      console.error("Error fetching user transactions:", error);
      setTransactions([]);
      setLoadingData(false);
    });

    return () => {
      if (unsubscribeUser) unsubscribeUser();
      if (unsubscribeTransactions) unsubscribeTransactions();
    };
  }, [adminUser, role, db, userId]);


  // --- Recalculate Balance Logic ---
   const recalculateBalance = useCallback(async () => {
        if (!userId || !db || !adminUser || role !== 'admin') return;

        setIsRecalculating(true);
        console.log(`Recalculating balance for user: ${userId}`);

        try {
            // Fetch all transactions ordered chronologically
            const transactionsColRef = collection(db, 'transactions');
            const q = query(transactionsColRef, where('userId', '==', userId), orderBy('timestamp', 'asc'));
            const querySnapshot = await getDocs(q); // Use getDocs for one-time fetch during recalculation

            let currentBalance = 0;
            const batch = writeBatch(db); // Use a batch for efficient updates

            querySnapshot.forEach((docSnap) => {
                const transaction = { id: docSnap.id, ...docSnap.data() } as Transaction;
                let transactionAmount = 0;

                // Only include non-cancelled transactions in balance calculation
                if (!transaction.isCancelled) {
                     // Original amount stored is always positive
                    transactionAmount = transaction.type === 'purchase' ? -transaction.amount : transaction.amount;
                }

                currentBalance += transactionAmount;

                // Update the balanceAfter field in the transaction document if it changed
                if (transaction.balanceAfter !== currentBalance) {
                   console.log(`Updating transaction ${transaction.id}: Old BalanceAfter ${transaction.balanceAfter}, New BalanceAfter ${currentBalance}`);
                   batch.update(docSnap.ref, { balanceAfter: currentBalance });
                } else {
                  console.log(`Transaction ${transaction.id} BalanceAfter is correct: ${currentBalance}`);
                }
            });

             // Get the user document reference
            const userDocRef = doc(db, 'users', userId);

            // Update the user's final balance
            console.log(`Final calculated balance: ${currentBalance}. Updating user document.`);
            batch.update(userDocRef, { balance: currentBalance });


            // Commit the batch updates
            await batch.commit();

            toast({
                title: "Éxito",
                description: "Saldo y movimientos recalculados correctamente.",
            });
            console.log("Recalculation complete.");

        } catch (error) {
            console.error("Error recalculating balance:", error);
            toast({
                title: "Error",
                description: `No se pudo recalcular el saldo. ${error instanceof Error ? error.message : String(error)}`,
                variant: "destructive",
            });
        } finally {
            setIsRecalculating(false);
            console.log("Recalculation finished (finally block).");
        }
    }, [userId, db, toast, adminUser, role]);

  // --- Action Handlers ---
  const handleEdit = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setIsEditDialogOpen(true);
  };

  const handleCancel = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setIsCancelDialogOpen(true);
  };

   const handleRestore = (transaction: Transaction) => {
    if (!transaction.isCancelled) return; // Should not happen if button is shown correctly
    setSelectedTransaction(transaction);
    setIsRestoreDialogOpen(true);
  };


  const handleDialogClose = () => {
    setIsEditDialogOpen(false);
    setIsCancelDialogOpen(false);
    setIsRestoreDialogOpen(false); // Close restore dialog as well
    setSelectedTransaction(null);
    // Recalculation is now handled by the onSuccessCallback in the dialogs
  };

  // --- Render Logic ---
  if (authLoading || loadingData) {
    return <div className="flex justify-center items-center h-[calc(100vh-10rem)]"><LoadingSpinner size="lg" /></div>;
  }

  if (!adminUser || role !== 'admin') {
    return <p className="text-center text-destructive">Acceso denegado.</p>;
  }

  if (!userData) {
     return (
        <div className="text-center space-y-4">
             <p className="text-destructive">No se encontró el usuario.</p>
             <Link href="/admin" passHref>
                 <Button variant="outline">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Volver al listado
                 </Button>
             </Link>
        </div>
     );
  }

  return (
    <div className="space-y-6">
        <div className="flex justify-between items-center mb-4">
            <Link href="/admin" passHref>
                <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" /> Volver al listado
                </Button>
            </Link>
             <Button onClick={recalculateBalance} variant="outline" disabled={isRecalculating}>
                {isRecalculating ? <LoadingSpinner size="sm" className="mr-2" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Recalcular Saldo
             </Button>
        </div>


      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-2xl">Cuenta de {userData.name}</CardTitle>
          <CardDescription>Email: {userData.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className={`text-3xl font-bold ${userData.balance < 0 ? 'text-destructive' : 'text-primary'}`}>
             Saldo: {formatCurrency(userData.balance)}
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-4">
        <Button onClick={() => setIsAddPurchaseOpen(true)} className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground">
          <PlusCircle className="mr-2 h-4 w-4" /> Agregar Compra (Admin)
        </Button>
        <Button onClick={() => setIsAddPaymentOpen(true)} className="flex-1">
          <DollarSign className="mr-2 h-4 w-4" /> Registrar Pago (Admin)
        </Button>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Historial de Movimientos</CardTitle>
          <CardDescription>Últimas compras y pagos de {userData.name}.</CardDescription>
        </CardHeader>
        <CardContent>
          <TransactionList
             transactions={transactions}
             showUserName={false}
             isAdminView={true} // Enable admin actions
             onEdit={handleEdit}
             onCancel={handleCancel}
             onRestore={handleRestore} // Pass restore handler
          />
        </CardContent>
      </Card>

       {/* Dialogs */}
       <AddTransactionDialog
            isOpen={isAddPurchaseOpen}
            onClose={() => { setIsAddPurchaseOpen(false); }}
            type="purchase"
            targetUserId={userId}
            isAdminAction={true}
            onSuccessCallback={recalculateBalance} // Recalculate after adding
       />
       <AddTransactionDialog
            isOpen={isAddPaymentOpen}
            onClose={() => { setIsAddPaymentOpen(false);}}
            type="payment"
            targetUserId={userId}
            isAdminAction={true}
            onSuccessCallback={recalculateBalance} // Recalculate after adding
       />

       {selectedTransaction && (
        <>
            <EditTransactionDialog
                isOpen={isEditDialogOpen}
                onClose={handleDialogClose}
                transaction={selectedTransaction}
                adminUser={adminUser}
                onSuccessCallback={recalculateBalance} // Pass recalculateBalance here
            />
            <CancelTransactionDialog
                isOpen={isCancelDialogOpen}
                onClose={handleDialogClose}
                transaction={selectedTransaction}
                adminUser={adminUser}
                onSuccessCallback={recalculateBalance} // Pass recalculateBalance here
            />
            <RestoreTransactionDialog
                isOpen={isRestoreDialogOpen}
                onClose={handleDialogClose}
                transaction={selectedTransaction}
                adminUser={adminUser}
                onSuccessCallback={recalculateBalance} // Pass recalculateBalance here
            />
        </>
       )}
    </div>
  );
};

export default UserDetailView;
