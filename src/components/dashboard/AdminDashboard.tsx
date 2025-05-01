'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Users, ListChecks, Package, FileText, LineChart, Receipt } from 'lucide-react'; // Added Receipt icon
import { LoadingSpinner } from '@/components/ui/loading-spinner';

const AdminDashboard: React.FC = () => {
    const { user, loading: authLoading, role } = useAuth();

    if (authLoading) {
        return <div className="flex justify-center items-center h-[calc(100vh-10rem)]"><LoadingSpinner size="lg" /></div>;
    }

    if (!user || role !== 'admin') {
        return <p className="text-center text-destructive">Acceso denegado. Debes ser administrador.</p>;
    }

    // Define admin sections
    const adminSections = [
        { title: 'Gestionar Usuarios', href: '/admin/users', icon: Users, description: 'Administrar roles y datos de usuarios.' },
        { title: 'Estados de Cuenta', href: '/admin/accounts', icon: ListChecks, description: 'Ver y gestionar saldos de clientes.' },
        { title: 'Inventario Productos', href: '/admin/inventory', icon: Package, description: 'Gestionar stock y precios.' },
        { title: 'Registrar Transacciones', href: '/admin/transactions', icon: FileText, description: 'Ingresar ventas, compras o cobros.' },
        { title: 'Detalle de Ventas', href: '/admin/sales-detail', icon: Receipt, description: 'Ver resumen de ventas por fecha.' }, // Updated Title and href
        // Future sections can be added here
        // { title: 'Reportes', href: '/admin/reports', icon: LineChart, description: 'Ver reportes de ventas y stock.' },
    ];

    return (
        <div className="space-y-6">
            <Card className="shadow-md">
                <CardHeader>
                    <CardTitle className="text-2xl">Panel de Administración</CardTitle>
                    <CardDescription>Selecciona una sección para administrar.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {adminSections.map((section) => (
                            <Link href={section.href} key={section.href} passHref className="block hover:no-underline">
                                <Card className="hover:shadow-lg hover:border-primary transition-all duration-200 h-full flex flex-col">
                                    <CardHeader className="flex-row items-center space-x-4 pb-2">
                                        <section.icon className="h-6 w-6 text-primary" />
                                        <CardTitle className="text-lg">{section.title}</CardTitle>
                                    </CardHeader>
                                    <CardContent className="pt-2 flex-grow">
                                        <p className="text-sm text-muted-foreground">{section.description}</p>
                                    </CardContent>
                                </Card>
                            </Link>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default AdminDashboard;
