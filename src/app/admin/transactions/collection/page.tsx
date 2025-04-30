
import React from 'react';
import CollectionForm from '@/components/admin/transactions/CollectionForm'; // Component for the collection form
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

// Page for Registering a New Collection/Payment
export default function RegisterCollectionPage() {
  return (
    <div className="space-y-4">
       {/* Back Button */}
        <Link href="/admin/transactions" passHref>
            <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver a Transacciones
            </Button>
        </Link>

        <Card className="shadow-md">
            <CardHeader>
                <CardTitle className="text-2xl">Registrar Nueva Cobranza</CardTitle>
                <CardDescription>
                    Selecciona un cliente e ingresa el monto del pago recibido.
                </CardDescription>
            </CardHeader>
            <CardContent>
                 <CollectionForm />
            </CardContent>
        </Card>
    </div>
  );
}
