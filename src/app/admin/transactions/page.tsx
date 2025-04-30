
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

// Placeholder page for Transaction Registration
export default function AdminTransactionsPage() {
  return (
     <div className="space-y-4">
        <Link href="/admin" passHref>
            <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver al Panel
            </Button>
        </Link>
        <Card>
            <CardHeader>
                <CardTitle>Registrar Transacciones</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">Esta sección está en desarrollo. Aquí podrás registrar ventas, compras y cobros.</p>
                {/* Add transaction registration components here later */}
            </CardContent>
        </Card>
     </div>
  );
}
