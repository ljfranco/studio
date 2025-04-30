
import React from 'react';
import DailySalesList from '@/components/admin/transactions/DailySalesList'; // Import the new component
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

// Page for viewing and managing today's sales
export default function DailySalesPage() {
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
          <CardTitle className="text-2xl">Ventas del Día</CardTitle>
          <CardDescription>
            Visualiza, modifica o cancela las ventas realizadas hoy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DailySalesList />
        </CardContent>
      </Card>
    </div>
  );
}
