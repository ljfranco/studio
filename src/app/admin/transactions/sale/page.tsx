
import React from 'react';
// Removed SaleForm import - Assuming it's used elsewhere, likely in a dialog
// import SaleForm from '@/components/admin/transactions/SaleForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

// Page for Registering a New Sale - This might become obsolete or just a placeholder
// if the sale registration is handled via dialogs. Keep for now.
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
                    {/* Updated description - Sale registration might be initiated elsewhere */}
                    Inicia una nueva venta seleccionando un cliente y agregando productos.
                    (La funcionalidad principal podría estar en un diálogo).
                </CardDescription>
            </CardHeader>
            <CardContent>
                {/* Removed <SaleForm /> - It's likely used within a dialog now. */}
                {/* You could add a button here to open the Sale Dialog if needed */}
                 <p className="text-center text-muted-foreground">
                    Utiliza la opción "Ingresar Venta" en el panel de administración o
                    desde la vista de detalle de un usuario para iniciar una venta.
                 </p>
            </CardContent>
        </Card>
    </div>
  );
}
