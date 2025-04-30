
'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Package, List } from 'lucide-react'; // Added icons
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import ProductTable from '@/components/admin/inventory/ProductTable'; // Component for product inventory
import PriceListTable from '@/components/admin/inventory/PriceListTable'; // Component for price list view
import DistributorManagement from '@/components/admin/inventory/DistributorManagement'; // Component for distributor management


export default function AdminInventoryPage() {
  return (
     <div className="space-y-4">
        {/* Back Button */}
        <Link href="/admin" passHref>
            <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver al Panel
            </Button>
        </Link>

        {/* Main Card with Tabs */}
        <Card className="shadow-md">
            <CardHeader>
                <CardTitle className="text-2xl">Gestión de Inventario y Precios</CardTitle>
                <CardDescription>Administra tus productos, stock, precios de venta y costos de distribuidores.</CardDescription>
            </CardHeader>
            <CardContent>
                 <Tabs defaultValue="inventory" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-secondary mb-6">
                        <TabsTrigger value="inventory">
                             <Package className="mr-2 h-4 w-4" /> Inventario
                        </TabsTrigger>
                        <TabsTrigger value="pricelist">
                             <List className="mr-2 h-4 w-4" /> Lista de Precios
                        </TabsTrigger>
                    </TabsList>

                    {/* Inventory Tab Content */}
                    <TabsContent value="inventory">
                        <ProductTable />
                    </TabsContent>

                    {/* Price List Tab Content */}
                    <TabsContent value="pricelist" className="space-y-6">
                         <PriceListTable />
                         <DistributorManagement /> {/* Add Distributor Management section */}
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
     </div>
  );
}

