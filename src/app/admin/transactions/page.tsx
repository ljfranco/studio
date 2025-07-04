
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft, ShoppingCart, Banknote, Truck, CalendarDays } from 'lucide-react'; // Import icons, added CalendarDays

// Page for Transaction Registration Options
export default function AdminTransactionsPage() {
  return (
     <div className="space-y-6">
        {/* Back Button */}
        <Link href="/admin">
            <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver al Panel
            </Button>
        </Link>

        {/* Main Card */}
        <Card className="shadow-md">
            <CardHeader>
                <CardTitle className="text-2xl">Registrar y Gestionar Transacciones</CardTitle>
                <CardDescription>Selecciona el tipo de transacción que deseas registrar o gestionar.</CardDescription>
            </CardHeader>
            <CardContent>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4"> {/* Changed grid layout to 2 cols */}
                    {/* Option 1: Ingresar Venta */}
                     <Link href="/admin/transactions/sale" className="block hover:no-underline">
                         <Card className="hover:shadow-lg hover:border-primary transition-all duration-200 h-full flex flex-col text-center">
                            <CardHeader className="items-center pb-2">
                                 <ShoppingCart className="h-8 w-8 text-primary mb-2" />
                                <CardTitle className="text-lg">Ingresar Venta</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-2 flex-grow">
                                <p className="text-sm text-muted-foreground">Registra una venta de productos a un cliente.</p>
                            </CardContent>
                        </Card>
                    </Link>

                    {/* Option 2: Ingresar Cobranza */}
                    <Link href="/admin/transactions/collection" className="block hover:no-underline">
                        <Card className="hover:shadow-lg hover:border-primary transition-all duration-200 h-full flex flex-col text-center">
                            <CardHeader className="items-center pb-2">
                                 <Banknote className="h-8 w-8 text-primary mb-2" />
                                <CardTitle className="text-lg">Ingresar Cobranza</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-2 flex-grow">
                                <p className="text-sm text-muted-foreground">Registra un pago recibido de un cliente.</p>
                            </CardContent>
                        </Card>
                    </Link>

                    {/* Option 3: Ingresar Compra (de Mercadería) */}
                     <Link href="/admin/transactions/purchase" className="block hover:no-underline">
                         <Card className="hover:shadow-lg hover:border-primary transition-all duration-200 h-full flex flex-col text-center">
                            <CardHeader className="items-center pb-2">
                                 <Truck className="h-8 w-8 text-primary mb-2" />
                                <CardTitle className="text-lg">Ingresar Compra</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-2 flex-grow">
                                <p className="text-sm text-muted-foreground">Registra el ingreso de mercadería y actualiza el stock.</p>
                            </CardContent>
                        </Card>
                    </Link>

                    {/* Option 4: Ventas del Día */}
                     <Link href="/admin/transactions/daily-sales" className="block hover:no-underline">
                         <Card className="hover:shadow-lg hover:border-primary transition-all duration-200 h-full flex flex-col text-center">
                            <CardHeader className="items-center pb-2">
                                 <CalendarDays className="h-8 w-8 text-primary mb-2" />
                                <CardTitle className="text-lg">Ventas del Día</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-2 flex-grow">
                                <p className="text-sm text-muted-foreground">Ver, editar o cancelar las ventas realizadas hoy.</p>
                            </CardContent>
                        </Card>
                    </Link>
                 </div>
                 {/* <p className="text-center text-muted-foreground mt-6 text-xs">(Funcionalidad en desarrollo para Compra)</p> */}
            </CardContent>
        </Card>
     </div>
  );
}
