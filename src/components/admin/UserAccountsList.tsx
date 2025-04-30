
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useFirebase } from '@/context/FirebaseContext';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';
import { Eye, ArrowLeft } from 'lucide-react'; // Added ArrowLeft
import { Button } from '@/components/ui/button';

interface UserAccount {
    id: string;
    name: string;
    balance: number;
    role?: string; // Ensure role is included
}

const UserAccountsList: React.FC = () => {
    const { user, loading: authLoading, role } = useAuth();
    const { db } = useFirebase();
    const [accounts, setAccounts] = useState<UserAccount[]>([]);
    const [loadingData, setLoadingData] = useState(true);

    useEffect(() => {
        if (!user || role !== 'admin') {
            setLoadingData(false);
            return;
        }

        setLoadingData(true);
        const usersColRef = collection(db, 'users');
        const q = query(usersColRef, orderBy('name')); // Order by name

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const fetchedAccounts = querySnapshot.docs
                .map(doc => ({
                    id: doc.id,
                    name: doc.data().name || 'N/A',
                    balance: doc.data().balance ?? 0,
                    role: doc.data().role // Get role to filter
                }))
                .filter(account => account.role !== 'admin'); // Filter out admin users

            setAccounts(fetchedAccounts);
            setLoadingData(false);
        }, (error) => {
            console.error("Error fetching user accounts:", error);
            setAccounts([]);
            setLoadingData(false);
        });

        return () => unsubscribe();
    }, [user, role, db]);

    if (authLoading || loadingData) {
        return <div className="flex justify-center items-center h-[calc(100vh-10rem)]"><LoadingSpinner size="lg" /></div>;
    }

    if (!user || role !== 'admin') {
        return <p className="text-center text-destructive">Acceso denegado.</p>;
    }

    return (
        <div className="space-y-4"> {/* Added a container div */}
             <Link href="/admin" passHref>
                 <Button variant="outline">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Volver al Panel
                 </Button>
             </Link>

            <Card className="shadow-md">
                <CardHeader>
                    <CardTitle className="text-2xl">Estados de Cuenta</CardTitle>
                    <CardDescription>Selecciona un usuario para ver su estado de cuenta detallado.</CardDescription>
                </CardHeader>
                <CardContent>
                    {accounts.length === 0 && !loadingData ? (
                        <p className="text-center text-muted-foreground">No hay usuarios registrados.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nombre</TableHead>
                                    <TableHead className="text-right">Saldo</TableHead>
                                    <TableHead className="text-center">Ver Cuenta</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {accounts.map((account) => (
                                    <TableRow key={account.id}>
                                        <TableCell className="font-medium">{account.name}</TableCell>
                                        <TableCell className={`text-right font-semibold ${account.balance < 0 ? 'text-destructive' : 'text-primary'}`}>
                                            {formatCurrency(account.balance)}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Link href={`/admin/user/${account.id}`} passHref>
                                                <Button variant="ghost" size="icon" aria-label={`Ver ${account.name}`}>
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default UserAccountsList;
