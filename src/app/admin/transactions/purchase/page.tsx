
import React from 'react';
import PurchaseForm from '@/components/admin/transactions/PurchaseForm'; // Component for the purchase form
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

// Page for Registering a New Purchase
export default function RegisterPurchasePage() {
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
                <CardTitle className="text-2xl">Registrar Nueva Compra de Mercadería</CardTitle>
                <CardDescription>
                    Selecciona un proveedor, agrega productos, cantidades y precios de costo.
                </CardDescription>
            </CardHeader>
            <CardContent>
                 <PurchaseForm />
            </CardContent>
        </Card>
    </div>
  );
}
