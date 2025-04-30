
import React from 'react';
import DailyBalanceReport from '@/components/admin/transactions/DailyBalanceReport'; // Import the new component
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

// Page for viewing the daily balance report
export default function DailyBalancePage() {
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
          <CardTitle className="text-2xl">Balance del Día</CardTitle>
          <CardDescription>
            Detalle de ventas del día agrupadas por cliente y totales.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DailyBalanceReport />
        </CardContent>
      </Card>
    </div>
  );
}
