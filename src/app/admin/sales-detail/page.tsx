
import React from 'react';
import SalesDetailReport from '@/components/admin/transactions/SalesDetailReport'; // Import the renamed component
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

// Page for viewing the sales detail report
export default function SalesDetailPage() {
  return (
    <div className="space-y-4">
      {/* Back Button */}
      <Link href="/admin" passHref>
        <Button variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver al Panel
        </Button>
      </Link>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-2xl">Detalle de Ventas</CardTitle>
          <CardDescription>
            Filtra y visualiza las ventas realizadas en un período específico, agrupadas por cliente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SalesDetailReport />
        </CardContent>
      </Card>
    </div>
  );
}
