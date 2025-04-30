
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

// Placeholder page for User Management
export default function AdminUsersPage() {
  return (
    <div className="space-y-4">
        <Link href="/admin" passHref>
            <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver al Panel
            </Button>
        </Link>
        <Card>
            <CardHeader>
                <CardTitle>Gestionar Usuarios</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">Esta sección está en desarrollo. Aquí podrás gestionar los roles y datos de los usuarios.</p>
                {/* Add user management components here later */}
            </CardContent>
        </Card>
    </div>
    );
}
