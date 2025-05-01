
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
import { Ban, Pencil, Percent, Info, FileDown } from 'lucide-react'; // Removed Save, X icons, Added FileDown
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
import * as XLSX from 'xlsx'; // Import xlsx library
import jsPDF from 'jspdf'; // Import jsPDF
import 'jspdf-autotable'; // Import autoTable plugin
import type { UserOptions } from 'jspdf-autotable'; // Import UserOptions type

// Extend jsPDF interface to include autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: UserOptions) => jsPDF;
  }
}

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


   // --- Export Functions ---
   const handleExportExcel = () => {
    const dataToExport = products.map(product => {
        const suggestedPrice = calculateSuggestedPrice(product);
        const baseData: any = {
            'Código': product.id,
            'Producto': product.name,
            'Ult. P. Compra': product.lastPurchasePrice ?? 0,
            'Margen (%)': product.margin ?? 0,
            'P. Venta Sug.': suggestedPrice ?? 0,
            'P. Venta': product.sellingPrice ?? 0,
        };
        // Add distributor prices
        distributors.forEach(dist => {
            baseData[dist.name] = product.purchasePrices?.[dist.id] ?? 0;
        });
        return baseData;
    });

    // Format numbers as numbers in Excel
    const formattedData = dataToExport.map(row => {
        const newRow = { ...row };
        Object.keys(newRow).forEach(key => {
            if (typeof newRow[key] === 'string' && !isNaN(parseFloat(newRow[key]))) {
                 // Check if it's a price or percentage
                if (key.includes('P. Venta') || key.includes('P. Compra') || distributors.some(d => d.name === key)) {
                    newRow[key] = parseFloat(newRow[key]); // Format as number (currency)
                } else if (key.includes('Margen (%)')) {
                     newRow[key] = parseFloat(newRow[key]); // Format as number (percentage)
                }
            }
        });
        return newRow;
    });


    const worksheet = XLSX.utils.json_to_sheet(formattedData);

     // Define column widths (optional, adjust as needed)
     const columnWidths = [
        { wch: 15 }, // Código
        { wch: 30 }, // Producto
        { wch: 15 }, // Ult. P. Compra
        { wch: 12 }, // Margen (%)
        { wch: 15 }, // P. Venta Sug.
        { wch: 15 }, // P. Venta
        // Distributor columns (auto-width might be okay, or set specific widths)
        ...distributors.map(() => ({ wch: 15 }))
    ];
    worksheet['!cols'] = columnWidths;

    // Apply number formatting (optional but recommended)
    // Get the range of the sheet
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let R = range.s.r + 1; R <= range.e.r; ++R) { // Start from row 1 (skip header)
        // Apply currency format to relevant columns (adjust indices based on your data structure)
        const currencyCols = [2, 4, 5]; // Indices for Ult. P. Compra, P. Venta Sug., P. Venta
        distributors.forEach((_, i) => currencyCols.push(6 + i)); // Add distributor columns

        currencyCols.forEach(C => {
             const cell_address = { c: C, r: R };
             const cell_ref = XLSX.utils.encode_cell(cell_address);
             if (worksheet[cell_ref]) {
                 worksheet[cell_ref].t = 'n'; // Set type to number
                 worksheet[cell_ref].z = '$#,##0.00'; // Currency format
             }
        });

        // Apply percentage format to Margin column (index 3)
         const marginCellRef = XLSX.utils.encode_cell({ c: 3, r: R });
         if (worksheet[marginCellRef]) {
             worksheet[marginCellRef].t = 'n';
             worksheet[marginCellRef].z = '0.0"%"'; // Percentage format
         }
    }


    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'ListaPrecios');
    XLSX.writeFile(workbook, `ListaPrecios_${new Date().toISOString().split('T')[0]}.xlsx`);
   };

   const handleExportPDF = () => {
     const doc = new jsPDF({ orientation: 'landscape' });
     const tableColumn = [
        "Código", "Producto", "Últ. Compra", "Margen", "Sugerido", "Venta",
        ...distributors.map(d => d.name) // Add distributor names as headers
     ];
     const tableRows: (string | number)[][] = [];

     products.forEach(product => {
        const suggestedPrice = calculateSuggestedPrice(product);
        const productData = [
            product.id,
            product.name,
            formatCurrency(product.lastPurchasePrice ?? 0),
            `${product.margin ?? 0}%`,
            suggestedPrice !== null ? formatCurrency(suggestedPrice) : 'N/A',
            formatCurrency(product.sellingPrice ?? 0),
            ...distributors.map(dist => formatCurrency(product.purchasePrices?.[dist.id] ?? 0))
        ];
        tableRows.push(productData);
     });

     doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 20, // Start table below title
        theme: 'grid', // 'striped', 'grid', 'plain'
        styles: { fontSize: 8, cellPadding: 2 }, // Adjust font size and padding
        headStyles: { fillColor: [0, 150, 136], textColor: 255, fontStyle: 'bold', halign: 'center' }, // Teal header
        columnStyles: {
            0: { cellWidth: 25 }, // Código
            1: { cellWidth: 45 }, // Producto
            2: { halign: 'right', cellWidth: 20 }, // Últ. Compra
            3: { halign: 'right', cellWidth: 15 }, // Margen
            4: { halign: 'right', cellWidth: 20 }, // Sugerido
            5: { halign: 'right', cellWidth: 20 }, // Venta
            // Auto width for distributors might work, or set fixed widths
            // Example: ...distributors.map(() => ({ halign: 'right', cellWidth: 20 }))
        },
        didDrawPage: (data) => {
             // Header
             doc.setFontSize(18);
             doc.setTextColor(40);
             doc.text("Lista de Precios", data.settings.margin.left, 15);
             // Footer
             const pageCount = doc.internal.getNumberOfPages();
             doc.setFontSize(10);
             doc.text(`Página ${data.pageNumber} de ${pageCount}`, data.settings.margin.left, doc.internal.pageSize.height - 10);
        }
     });

     doc.save(`ListaPrecios_${new Date().toISOString().split('T')[0]}.pdf`);
   };
   // --- End Export Functions ---


  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return <p className="text-center text-destructive">Error al cargar datos: {errorMessage}</p>;
  }


  return (
    <TooltipProvider>
        <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
            <div>
                 <CardTitle>Lista de Precios</CardTitle>
                 <CardDescription>Comparativa de precios de venta y compra por distribuidor.</CardDescription>
            </div>
             {/* Export Buttons */}
             <div className="flex gap-2">
                <Button variant="outline" onClick={handleExportExcel} disabled={products.length === 0 || isLoading}>
                    <FileDown className="mr-2 h-4 w-4" /> Excel (.xlsx)
                </Button>
                <Button variant="outline" onClick={handleExportPDF} disabled={products.length === 0 || isLoading}>
                     <FileDown className="mr-2 h-4 w-4" /> PDF
                </Button>
             </div>
        </CardHeader>
        <CardContent>
            {isLoading ? (
            <div className="flex justify-center items-center h-40"><LoadingSpinner /></div>
            ) : products.length === 0 ? (
            <p className="text-center text-muted-foreground">No hay productos para mostrar precios.</p>
            ) : (
            <div className="overflow-x-auto border rounded-md"> {/* Added border and rounded */}
                <Table className="min-w-full"> {/* Ensure table takes minimum full width */}
                <TableHeader>
                    <TableRow>
                    {/* Sticky Product Column */}
                    <TableHead className="sticky left-0 bg-card z-20 min-w-[150px] border-r">Producto</TableHead> {/* Use bg-card */}
                    {/* Sticky Actions Column - Minimal Width */}
                    <TableHead className="text-center sticky left-[150px] bg-card z-20 px-1 w-auto border-r"></TableHead> {/* Use bg-card */}
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
                            <TableRow key={product.id} className="hover:bg-muted/50">
                                {/* Product Name (Sticky Left 0) */}
                                <TableCell className="font-medium sticky left-0 bg-card z-10 border-r"> {/* Use bg-card */}
                                    <div className="flex flex-col">
                                        <span>{product.name}</span>
                                        <span className="text-xs text-muted-foreground font-mono">{product.id}</span>
                                    </div>
                                </TableCell>

                                 {/* Actions Cell (Sticky Left 150px - Minimal Width) */}
                                <TableCell className="text-center sticky left-[150px] bg-card z-10 px-1 border-r"> {/* Use bg-card */}
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
