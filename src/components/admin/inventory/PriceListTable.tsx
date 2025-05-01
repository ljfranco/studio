
'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore'; // Removed doc, updateDoc
import { useFirebase } from '@/context/FirebaseContext';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
// Removed Input import
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Ban, Pencil, Percent, Info } from 'lucide-react'; // Removed Save, X icons
import { formatCurrency, cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { Product } from '@/types/product';
import type { Distributor } from '@/types/distributor';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import EditPriceDialog from './EditPriceDialog'; // Import the new dialog component

// Fetch products function (re-used)
const fetchProducts = async (db: any): Promise<Product[]> => {
  const productsCol = collection(db, 'products');
  const snapshot = await getDocs(productsCol);
  return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Product));
};

// Fetch distributors function
const fetchDistributors = async (db: any): Promise<Distributor[]> => {
  const distributorsCol = collection(db, 'distributors');
  const snapshot = await getDocs(distributorsCol);
  return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Distributor));
};

const PriceListTable: React.FC = () => {
  const { db } = useFirebase();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false); // State for modal
  const [selectedProductForEdit, setSelectedProductForEdit] = useState<Product | null>(null); // State for product to edit

  // Fetch products
  const { data: products = [], isLoading: isLoadingProducts, error: errorProducts } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => fetchProducts(db),
  });

  // Fetch distributors
  const { data: distributors = [], isLoading: isLoadingDistributors, error: errorDistributors } = useQuery<Distributor[]>({
    queryKey: ['distributors'],
    queryFn: () => fetchDistributors(db),
  });

  const isLoading = isLoadingProducts || isLoadingDistributors;
  const error = errorProducts || errorDistributors;

  // Calculate lowest purchase price and identify the distributor (unchanged)
  const lowestPrices = useMemo(() => {
    const prices: Record<string, { price: number; distributorId: string | null }> = {};
    products.forEach(product => {
      let lowest = Infinity;
      let lowestDistributorId: string | null = null;
      if (product.purchasePrices) {
        for (const distributorId in product.purchasePrices) {
          if (product.purchasePrices[distributorId] < lowest) {
            lowest = product.purchasePrices[distributorId];
            lowestDistributorId = distributorId;
          }
        }
      }
      prices[product.id] = { price: lowest === Infinity ? 0 : lowest, distributorId: lowestDistributorId };
    });
    return prices;
  }, [products]);

  // Calculate suggested selling price based on last purchase price and margin
  const calculateSuggestedPrice = (product: Product): number | null => {
    if (product.lastPurchasePrice === undefined || product.lastPurchasePrice === null || product.margin === undefined || product.margin === null) {
      return null; // Not enough info
    }
    const marginMultiplier = 1 + (product.margin / 100);
    return product.lastPurchasePrice * marginMultiplier;
  };


   // --- Open Edit Modal ---
   const handleEditClick = (product: Product) => {
        setSelectedProductForEdit(product);
        setIsEditDialogOpen(true);
   };

   const handleCloseModal = () => {
        setIsEditDialogOpen(false);
        setSelectedProductForEdit(null);
   };


  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return <p className="text-center text-destructive">Error al cargar datos: {errorMessage}</p>;
  }


  return (
    <TooltipProvider>
        <Card>
        <CardHeader>
            <CardTitle>Lista de Precios</CardTitle>
            <CardDescription>Comparativa de precios de venta y compra por distribuidor.</CardDescription>
        </CardHeader>
        <CardContent>
            {isLoading ? (
            <div className="flex justify-center items-center h-40"><LoadingSpinner /></div>
            ) : products.length === 0 ? (
            <p className="text-center text-muted-foreground">No hay productos para mostrar precios.</p>
            ) : (
            <div className="overflow-x-auto">
                <Table>
                <TableHeader>
                    <TableRow>
                    {/* Sticky Product Column */}
                    <TableHead className="sticky left-0 bg-background z-10 min-w-[150px]">Producto</TableHead>
                    {/* Sticky Actions Column - Minimal Width */}
                    <TableHead className="text-center sticky left-[150px] bg-background z-10 px-1 w-auto"></TableHead> {/* Removed title, adjusted padding */}
                    <TableHead className="text-right min-w-[120px]">Últ. P. Compra</TableHead>
                    <TableHead className="text-right min-w-[100px]">Margen (%)</TableHead>
                    <TableHead className="text-right min-w-[120px]">P. Venta Sug.</TableHead>
                    <TableHead className="text-right min-w-[120px]">P. Venta</TableHead>
                    {distributors.map(dist => (
                        <TableHead key={dist.id} className="text-right min-w-[120px]">
                        {dist.name}
                        </TableHead>
                    ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {products.map((product) => {
                        const suggestedPrice = calculateSuggestedPrice(product);
                        return (
                            <TableRow key={product.id}>
                                {/* Product Name (Sticky Left 0) */}
                                <TableCell className="font-medium sticky left-0 bg-background z-10">
                                    <div className="flex flex-col">
                                        <span>{product.name}</span>
                                        <span className="text-xs text-muted-foreground font-mono">{product.id}</span>
                                    </div>
                                </TableCell>

                                 {/* Actions Cell (Sticky Left 150px - Minimal Width) */}
                                <TableCell className="text-center sticky left-[150px] bg-background z-10 px-1"> {/* Adjusted padding */}
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8" // Fixed size for icon button
                                                onClick={() => handleEditClick(product)}
                                                title={`Editar precios de ${product.name}`}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Editar Precios y Margen</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TableCell>

                                {/* Last Purchase Price */}
                                <TableCell className="text-right text-muted-foreground">
                                    {formatCurrency(product.lastPurchasePrice ?? 0)}
                                </TableCell>

                                {/* Margin */}
                                <TableCell className="text-right">
                                    {`${product.margin ?? 0}%`}
                                </TableCell>

                                {/* Suggested Selling Price */}
                                <TableCell className="text-right text-blue-600">
                                    {suggestedPrice !== null ? formatCurrency(suggestedPrice) : <Ban className="h-4 w-4 mx-auto text-muted-foreground" title="N/A"/>}
                                </TableCell>


                                {/* Selling Price */}
                                <TableCell className="text-right">
                                    {formatCurrency(product.sellingPrice ?? 0)}
                                </TableCell>

                                {/* Distributor Purchase Prices */}
                                {distributors.map(dist => {
                                const purchasePrice = product.purchasePrices?.[dist.id];
                                const isLowest = lowestPrices[product.id]?.distributorId === dist.id && lowestPrices[product.id]?.price > 0;

                                return (
                                    <TableCell key={dist.id} className={cn("text-right", isLowest && "font-bold text-green-600")}>
                                            {purchasePrice !== undefined && purchasePrice !== null ? formatCurrency(purchasePrice) : <Ban className="h-4 w-4 mx-auto text-muted-foreground" title="Sin precio"/>}
                                    </TableCell>
                                );
                                })}
                            </TableRow>
                        )
                    })}
                </TableBody>
                </Table>
            </div>
            )}
        </CardContent>
        {/* Render the EditPriceDialog */}
        {selectedProductForEdit && (
            <EditPriceDialog
                isOpen={isEditDialogOpen}
                onClose={handleCloseModal}
                product={selectedProductForEdit}
                distributors={distributors}
            />
        )}
        </Card>
    </TooltipProvider>
  );
};

export default PriceListTable;
