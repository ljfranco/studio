
import React from 'react';
import SaleForm from '@/components/admin/transactions/SaleForm'; // Re-add SaleForm import
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

// Page for Registering a New Sale
export default function RegisterSalePage() {
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
                <CardTitle className="text-2xl">Registrar Nueva Venta</CardTitle>
                <CardDescription>
                    Selecciona un cliente y agrega productos a la venta.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {/* Render the SaleForm component directly */}
                 <SaleForm />
            </CardContent>
        </Card>
    </div>
  );
}
