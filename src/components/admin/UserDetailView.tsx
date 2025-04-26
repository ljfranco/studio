'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useFirebase } from '@/context/FirebaseContext';
import { doc, getDoc, collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import TransactionList from '@/components/dashboard/TransactionList'; // Re-use TransactionList
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PlusCircle, DollarSign, ArrowLeft } from 'lucide-react'; // Added ArrowLeft
import AddTransactionDialog from '@/components/dashboard/AddTransactionDialog'; // Re-use AddTransactionDialog
import Link from 'next/link'; // Import Link for back navigation

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
  const [userData, setUserData] = useState<UserData | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isAddPurchaseOpen, setIsAddPurchaseOpen] = useState(false);
  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);


  useEffect(() => {
    if (!adminUser || role !== 'admin' || !userId) {
      setLoadingData(false);
      return;
    }

    setLoadingData(true);
    let unsubscribeUser: () => void;
    let unsubscribeTransactions: () => void;

    // Fetch specific user data
    const userDocRef = doc(db, 'users', userId);
    unsubscribeUser = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
            setUserData(docSnap.data() as UserData);
        } else {
            console.warn(`User document not found for ID: ${userId}`);
            setUserData(null); // Handle case where user might be deleted
        }
         // setLoadingData(false); // Moved loading update
    }, (error) => {
        console.error("Error fetching user data:", error);
        setUserData(null);
        setLoadingData(false);
    });


    // Fetch transactions for this specific user
    const transactionsColRef = collection(db, 'transactions');
    const q = query(transactionsColRef, where('userId', '==', userId), orderBy('timestamp', 'desc'));

    unsubscribeTransactions = onSnapshot(q, (querySnapshot) => {
        const fetchedTransactions = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate() : new Date()
        }));
        setTransactions(fetchedTransactions);
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
      <Link href="/admin" passHref>
        <Button variant="outline" className="mb-4">
           <ArrowLeft className="mr-2 h-4 w-4" /> Volver al listado
        </Button>
      </Link>

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
          <TransactionList transactions={transactions} showUserName={false} />
        </CardContent>
      </Card>

       {/* Re-use the dialog, passing the specific userId */}
      <AddTransactionDialog
        isOpen={isAddPurchaseOpen}
        onClose={() => setIsAddPurchaseOpen(false)}
        type="purchase"
        targetUserId={userId} // Pass the target user ID
        isAdminAction={true} // Indicate this is an admin action
      />
      <AddTransactionDialog
        isOpen={isAddPaymentOpen}
        onClose={() => setIsAddPaymentOpen(false)}
        type="payment"
        targetUserId={userId} // Pass the target user ID
        isAdminAction={true} // Indicate this is an admin action
      />
    </div>
  );
};

export default UserDetailView;
