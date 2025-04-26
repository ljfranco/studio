'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useFirebase } from '@/context/FirebaseContext';
import { collection, query, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link'; // Import Link for navigation
import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';


interface UserAccount {
    id: string;
    name: string;
    email: string;
    balance: number;
}

const AdminDashboard: React.FC = () => {
    const { user, loading: authLoading, role } = useAuth();
    const { db } = useFirebase();
    const [accounts, setAccounts] = useState<UserAccount[]>([]);
    const [loadingData, setLoadingData] = useState(true);

    useEffect(() => {
        if (!user || role !== 'admin') {
            setLoadingData(false);
            return; // Only admins should access this
        }

        setLoadingData(true);
        const usersColRef = collection(db, 'users');
        // Optionally order by name or another field
        const q = query(usersColRef, orderBy('name'));

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const fetchedAccounts = querySnapshot.docs.map(doc => ({
                id: doc.id,
                name: doc.data().name || 'N/A',
                email: doc.data().email || 'N/A',
                balance: doc.data().balance ?? 0,
            }));
            setAccounts(fetchedAccounts);
            setLoadingData(false);
        }, (error) => {
            console.error("Error fetching user accounts:", error);
            setAccounts([]);
            setLoadingData(false);
        });

        return () => unsubscribe(); // Clean up listener
    }, [user, role, db]);

    if (authLoading || loadingData) {
        return <div className="flex justify-center items-center h-[calc(100vh-10rem)]"><LoadingSpinner size="lg" /></div>;
    }

    if (!user || role !== 'admin') {
        // Redirect or show an error message if not an admin
        return <p className="text-center text-destructive">Acceso denegado. Debes ser administrador.</p>;
    }

    return (
        <div className="space-y-6">
            <Card className="shadow-md">
                <CardHeader>
                    <CardTitle className="text-2xl">Cuentas de Usuarios</CardTitle>
                    <CardDescription>Administra y visualiza las cuentas de todos los usuarios.</CardDescription>
                </CardHeader>
                <CardContent>
                    {accounts.length === 0 && !loadingData ? (
                         <p className="text-center text-muted-foreground">No hay usuarios registrados.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nombre</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead className="text-right">Saldo</TableHead>
                                    <TableHead className="text-center">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {accounts.map((account) => (
                                    <TableRow key={account.id}>
                                        <TableCell className="font-medium">{account.name}</TableCell>
                                        <TableCell>{account.email}</TableCell>
                                        <TableCell className={`text-right font-semibold ${account.balance < 0 ? 'text-destructive' : 'text-primary'}`}>
                                            {formatCurrency(account.balance)}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Link href={`/admin/user/${account.id}`} passHref>
                                                <Button variant="ghost" size="icon" aria-label={`Ver ${account.name}`}>
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                            {/* Add more actions like Edit or Delete if needed */}
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

export default AdminDashboard;

