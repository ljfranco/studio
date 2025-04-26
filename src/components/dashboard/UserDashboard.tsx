'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useFirebase } from '@/context/FirebaseContext';
import { doc, getDoc, collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, DollarSign } from 'lucide-react';
import TransactionList from './TransactionList';
import AddTransactionDialog from './AddTransactionDialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { formatCurrency } from '@/lib/utils'; // Import formatting utility

const UserDashboard: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { db } = useFirebase();
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isAddPurchaseOpen, setIsAddPurchaseOpen] = useState(false);
  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);

  useEffect(() => {
    if (!user) {
        setLoadingData(false);
        return;
    };

    setLoadingData(true);
    let unsubscribeUser: () => void;
    let unsubscribeTransactions: () => void;

    // Subscribe to user document for balance updates
    const userDocRef = doc(db, 'users', user.uid);
    unsubscribeUser = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setBalance(docSnap.data().balance ?? 0);
      } else {
        console.warn("User document not found for balance.");
        setBalance(0); // Default to 0 if document doesn't exist
      }
      // Consider data loaded once balance is fetched (or attempted)
       // setLoadingData(false); // Moved loading state update lower
    }, (error) => {
        console.error("Error fetching user balance:", error);
        setBalance(0); // Default on error
        setLoadingData(false);
    });


    // Subscribe to transactions collection
    const transactionsColRef = collection(db, 'transactions');
    const q = query(transactionsColRef, where('userId', '==', user.uid), orderBy('timestamp', 'desc'));

    unsubscribeTransactions = onSnapshot(q, (querySnapshot) => {
      const fetchedTransactions = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Convert Firestore Timestamp to Date object
        timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate() : new Date()
      }));
      setTransactions(fetchedTransactions);
       setLoadingData(false); // Set loading false after transactions are fetched
    }, (error) => {
        console.error("Error fetching transactions:", error);
        setTransactions([]); // Clear transactions on error
        setLoadingData(false);
    });


    return () => {
        if (unsubscribeUser) unsubscribeUser();
        if (unsubscribeTransactions) unsubscribeTransactions();
    };
  }, [user, db]);

  if (authLoading || loadingData) {
    return <div className="flex justify-center items-center h-[calc(100vh-10rem)]"><LoadingSpinner size="lg" /></div>;
  }

  if (!user) {
     // This case should ideally be handled by the AuthProvider redirecting or showing AuthPage
    return <p className="text-center text-muted-foreground">Por favor, inicia sesión para ver tu cuenta.</p>;
  }

  return (
    <div className="space-y-6">
       <Card className="shadow-md">
            <CardHeader>
                <CardTitle className="text-2xl">Tu Saldo Actual</CardTitle>
                <CardDescription>Resumen de tu cuenta con el almacén.</CardDescription>
            </CardHeader>
            <CardContent>
                <p className={`text-3xl font-bold ${balance !== null && balance < 0 ? 'text-destructive' : 'text-primary'}`}>
                {balance !== null ? formatCurrency(balance) : <LoadingSpinner size="sm" />}
                </p>
            </CardContent>
       </Card>

      <div className="flex flex-col sm:flex-row gap-4">
        <Button onClick={() => setIsAddPurchaseOpen(true)} className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground">
          <PlusCircle className="mr-2 h-4 w-4" /> Agregar Compra
        </Button>
        <Button onClick={() => setIsAddPaymentOpen(true)} className="flex-1">
          <DollarSign className="mr-2 h-4 w-4" /> Registrar Pago
        </Button>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Historial de Movimientos</CardTitle>
           <CardDescription>Tus últimas compras y pagos.</CardDescription>
        </CardHeader>
        <CardContent>
          <TransactionList transactions={transactions} />
        </CardContent>
      </Card>

      <AddTransactionDialog
        isOpen={isAddPurchaseOpen}
        onClose={() => setIsAddPurchaseOpen(false)}
        type="purchase"
      />
      <AddTransactionDialog
        isOpen={isAddPaymentOpen}
        onClose={() => setIsAddPaymentOpen(false)}
        type="payment"
      />
    </div>
  );
};

export default UserDashboard;
