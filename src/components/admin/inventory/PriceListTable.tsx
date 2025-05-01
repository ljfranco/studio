
'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
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
import { Input } from '@/components/ui/input'; // For inline editing
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Save, X, Ban, Pencil, Percent, Info } from 'lucide-react'; // Icons for edit controls // Added Pencil, Percent, Info
import { formatCurrency, cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { Product } from '@/types/product';
import type { Distributor } from '@/types/distributor';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"; // Import Tooltip

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
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({}); // Store temporary edit values { [fieldKey]: value }
  const [isSaving, setIsSaving] = useState(false);

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


   // --- Inline Editing ---
   const startEditing = (product: Product) => {
        setEditingRowId(product.id);
        const initialValues: Record<string, string> = {
            sellingPrice: String(product.sellingPrice ?? ''),
            margin: String(product.margin ?? ''), // Add margin to initial values
        };
        distributors.forEach(dist => {
             initialValues[`purchase_${dist.id}`] = String(product.purchasePrices?.[dist.id] ?? '');
        });
        setEditValues(initialValues);
   };

   const handleInputChange = (fieldKey: string, value: string) => {
        setEditValues(prev => ({ ...prev, [fieldKey]: value }));
   };

   const cancelEditing = () => {
        setEditingRowId(null);
        setEditValues({});
   };

   const saveChanges = async () => {
    if (!editingRowId) return;
    setIsSaving(true);

    const productDocRef = doc(db, 'products', editingRowId);
    const updates: Partial<Product> = {};
    const purchasePriceUpdates: Record<string, number> = {};
    let marginValueToSet: number | null | undefined = undefined; // To handle null/undefined correctly

    try {
      // Validate and prepare selling price update
      const sellingPriceStr = editValues['sellingPrice'];
      const sellingPriceNum = parseFloat(sellingPriceStr?.replace(/[^0-9.]+/g, ''));
      if (sellingPriceStr !== undefined && !isNaN(sellingPriceNum) && sellingPriceNum >= 0) {
        updates.sellingPrice = sellingPriceNum;
      } else if (sellingPriceStr !== undefined) {
        throw new Error(`Precio de venta inválido: "${sellingPriceStr}"`);
      }

      // Validate and prepare margin update
      const marginStr = editValues['margin'];
      if (marginStr !== undefined) {
          if (marginStr.trim() === '') {
              marginValueToSet = null; // Set to null if user cleared it
          } else {
              const marginNum = parseFloat(marginStr.replace(/[^0-9.]+/g, ''));
              if (!isNaN(marginNum) && marginNum >= 0) {
                  marginValueToSet = marginNum; // Set to the number if valid
              } else {
                  throw new Error(`Margen inválido: "${marginStr}"`);
              }
          }
      } // If marginStr is undefined, marginValueToSet remains undefined

      // Prepare purchase price updates (unchanged logic)
      distributors.forEach(dist => {
        const purchaseKey = `purchase_${dist.id}`;
        const purchasePriceStr = editValues[purchaseKey];
        if (purchasePriceStr !== undefined && purchasePriceStr.trim() !== '') {
             const purchasePriceNum = parseFloat(purchasePriceStr.replace(/[^0-9.]+/g, ''));
             if (!isNaN(purchasePriceNum) && purchasePriceNum >= 0) {
                 purchasePriceUpdates[dist.id] = purchasePriceNum;
             } else {
                 throw new Error(`Precio de compra inválido para ${dist.name}: "${purchasePriceStr}"`);
             }
        }
      });

      // --- Prepare Firestore update payload ---
      const firestoreUpdatePayload: Record<string, any> = {};
       if (updates.sellingPrice !== undefined) {
            firestoreUpdatePayload.sellingPrice = updates.sellingPrice;
       }
       // Only include margin in the update if it was actually changed
       if (marginValueToSet !== undefined) {
           firestoreUpdatePayload.margin = marginValueToSet;
       }


       // Add purchase prices using dot notation
       for (const distId in purchasePriceUpdates) {
           firestoreUpdatePayload[`purchasePrices.${distId}`] = purchasePriceUpdates[distId];
       }

       // Only update if there are changes
        if (Object.keys(firestoreUpdatePayload).length > 0) {
             await updateDoc(productDocRef, firestoreUpdatePayload);
        }


      toast({ title: 'Éxito', description: 'Precios actualizados correctamente.' });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['distributors'] });
      cancelEditing(); // Exit edit mode
    } catch (error) {
      console.error("Error updating prices:", error);
      toast({ title: 'Error', description: `No se pudo actualizar los precios. ${error instanceof Error ? error.message : ''}`, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
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
                    {/* Sticky Actions Column - Adjusted left position */}
                    <TableHead className="text-center sticky left-[150px] bg-background z-10 min-w-[100px]">Acciones</TableHead>
                    <TableHead className="text-right min-w-[120px]">Últ. P. Compra</TableHead>
                    <TableHead className="text-right min-w-[100px]">Margen (%)</TableHead>
                    <TableHead className="text-right min-w-[120px]">P. Venta Sug.</TableHead>
                    <TableHead className="text-right min-w-[120px]">P. Venta</TableHead>
                    {distributors.map(dist => (
                        <TableHead key={dist.id} className="text-right min-w-[120px]">
                        {dist.name}
                        </TableHead>
                    ))}
                    {/* Removed original sticky right Actions column header */}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {products.map((product) => {
                        const suggestedPrice = calculateSuggestedPrice(product);
                        const isEditingThisRow = editingRowId === product.id;
                        return (
                            <TableRow key={product.id} className={cn(isEditingThisRow && "bg-muted/50")}>
                                {/* Product Name (Sticky Left 0) */}
                                <TableCell className="font-medium sticky left-0 bg-background z-10"> {/* Changed bg-inherit to bg-background */}
                                    <div className="flex flex-col">
                                        <span>{product.name}</span>
                                        <span className="text-xs text-muted-foreground font-mono">{product.id}</span>
                                    </div>
                                </TableCell>

                                 {/* Actions Cell (Sticky Left 150px) */}
                                <TableCell className="text-center sticky left-[150px] bg-background z-10"> {/* Changed bg-inherit to bg-background */}
                                    {isEditingThisRow ? (
                                        <div className="flex items-center justify-center space-x-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-green-600 hover:text-green-700"
                                                onClick={saveChanges}
                                                disabled={isSaving}
                                                title="Guardar Cambios"
                                            >
                                                {isSaving ? <LoadingSpinner size="sm"/> : <Save className="h-4 w-4" />}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-destructive hover:text-destructive/90"
                                                onClick={cancelEditing}
                                                disabled={isSaving}
                                                title="Cancelar Edición"
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={() => startEditing(product)}
                                                    title={`Editar precios de ${product.name}`}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Editar Precios y Margen</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    )}
                                </TableCell>

                                {/* Last Purchase Price */}
                                <TableCell className="text-right text-muted-foreground">
                                    {formatCurrency(product.lastPurchasePrice ?? 0)}
                                </TableCell>

                                {/* Margin */}
                                <TableCell className="text-right">
                                    {isEditingThisRow ? (
                                         <Input
                                            type="text"
                                            value={editValues['margin'] ?? ''}
                                            onChange={(e) => handleInputChange('margin', e.target.value)}
                                            className="h-8 text-right w-20"
                                            disabled={isSaving}
                                            placeholder="%"
                                        />
                                    ) : (
                                        `${product.margin ?? 0}%`
                                    )}
                                </TableCell>

                                {/* Suggested Selling Price */}
                                <TableCell className="text-right text-blue-600">
                                    {suggestedPrice !== null ? formatCurrency(suggestedPrice) : <Ban className="h-4 w-4 mx-auto text-muted-foreground" title="N/A"/>}
                                </TableCell>


                                {/* Selling Price */}
                                <TableCell className="text-right">
                                {isEditingThisRow ? (
                                    <Input
                                        type="text"
                                        value={editValues['sellingPrice'] ?? ''}
                                        onChange={(e) => handleInputChange('sellingPrice', e.target.value)}
                                        className="h-8 text-right"
                                        disabled={isSaving}
                                        placeholder="0.00"
                                    />
                                ) : (
                                    formatCurrency(product.sellingPrice ?? 0)
                                )}
                                </TableCell>

                                {/* Distributor Purchase Prices */}
                                {distributors.map(dist => {
                                const purchasePrice = product.purchasePrices?.[dist.id];
                                const isLowest = lowestPrices[product.id]?.distributorId === dist.id && lowestPrices[product.id]?.price > 0;

                                return (
                                    <TableCell key={dist.id} className={cn("text-right", isLowest && !isEditingThisRow && "font-bold text-green-600")}>
                                    {isEditingThisRow ? (
                                        <Input
                                            type="text"
                                            value={editValues[`purchase_${dist.id}`] ?? ''}
                                            onChange={(e) => handleInputChange(`purchase_${dist.id}`, e.target.value)}
                                            className={cn("h-8 text-right", isLowest && "border-green-600 focus-visible:ring-green-500")}
                                            disabled={isSaving}
                                            placeholder="0.00"
                                        />
                                    ) : (
                                            purchasePrice !== undefined && purchasePrice !== null ? formatCurrency(purchasePrice) : <Ban className="h-4 w-4 mx-auto text-muted-foreground" title="Sin precio"/>
                                    )}
                                    </TableCell>
                                );
                                })}
                                 {/* Removed original sticky right Actions Cell */}
                            </TableRow>
                        )
                    })}
                </TableBody>
                </Table>
            </div>
            )}
        </CardContent>
        </Card>
    </TooltipProvider>
  );
};

export default PriceListTable;
