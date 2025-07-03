
'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';
import { useFirebase } from '@/context/FirebaseContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Ban, Pencil, Percent, Info, FileDown, Search, ScanLine } from 'lucide-react';
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
import EditPriceDialog from './EditPriceDialog';
import ProductDetailDialog from './ProductDetailDialog'; // Import ProductDetailDialog
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { autoTable, type UserOptions } from 'jspdf-autotable';
import FullScreenScanner from '@/components/scanner/FullScreenScanner';
import { useIsMobile } from '@/hooks/use-mobile'; // Import useIsMobile

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: UserOptions) => jsPDF;
  }
}

const fetchProducts = async (db: any): Promise<Product[]> => {
  const productsCol = collection(db, 'products');
  const snapshot = await getDocs(productsCol);
  return snapshot.docs
    .map(doc => ({ ...doc.data(), id: doc.id } as Product))
    .sort((a, b) => a.name.localeCompare(b.name));
};

const fetchDistributors = async (db: any): Promise<Distributor[]> => {
  const distributorsCol = collection(db, 'distributors');
  const snapshot = await getDocs(distributorsCol);
  return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Distributor)).sort((a, b) => a.name.localeCompare(b.name));
};

const PriceListTable: React.FC = () => {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedProductForEdit, setSelectedProductForEdit] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isProductDetailOpen, setIsProductDetailOpen] = useState(false); // Nuevo estado para el modal de detalle
  const [selectedProductForDetail, setSelectedProductForDetail] = useState<Product | null>(null); // Producto para el modal de detalle

  const { data: products = [], isLoading: isLoadingProducts, error: errorProducts } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => fetchProducts(db),
  });

  const { data: distributors = [], isLoading: isLoadingDistributors, error: errorDistributors } = useQuery<Distributor[]>({
    queryKey: ['distributors'],
    queryFn: () => fetchDistributors(db),
  });

  const isLoading = isLoadingProducts || isLoadingDistributors;
  const error = errorProducts || errorDistributors;

  const filteredProducts = useMemo(() => {
    if (!searchTerm) {
      return products;
    }
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return products.filter(product =>
      product.name.toLowerCase().includes(lowerCaseSearchTerm) ||
      product.id.toLowerCase().includes(lowerCaseSearchTerm)
    );
  }, [products, searchTerm]);

  const isBarcodeDetectorSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  const handleScanSuccess = (scannedId: string) => {
    console.log("Barcode detected:", scannedId);
    setSearchTerm(scannedId);
    setIsScannerOpen(false);
    toast({ title: "Código Detectado", description: scannedId });
  };

  const toggleScan = () => {
    if (!isBarcodeDetectorSupported) {
      toast({ title: "No Soportado", description: "El escáner no es compatible.", variant: "destructive" });
      return;
    }
    setIsScannerOpen(prev => !prev);
  };

  const isMobile = useIsMobile();

  const renderPriceListCard = (product: Product) => {
    const suggestedPrice = calculateSuggestedPrice(product);
    const lowestPriceInfo = lowestPrices[product.id];
    const lowestDistributor = lowestPriceInfo?.distributorId ? distributors.find(d => d.id === lowestPriceInfo.distributorId)?.name : 'N/A';

    return (
      <Card key={product.id} className="mb-4 shadow-sm cursor-pointer" onClick={() => handleOpenProductDetail(product)}>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-lg">{product.name}</CardTitle>
              <CardDescription className="text-sm text-muted-foreground">Código: {product.id}</CardDescription>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-primary">{formatCurrency(product.sellingPrice ?? 0)}</p>
              <p className="text-xs text-muted-foreground">Margen: {product.margin ?? 0}%</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="grid grid-cols-2 gap-2 text-sm mb-3">
            <div>
              <p className="text-muted-foreground">Últ. P. Compra:</p>
              <p className="font-semibold">{formatCurrency(product.lastPurchasePrice ?? 0)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">P. Venta Sug.:</p>
              <p className="font-semibold text-blue-600">
                {suggestedPrice !== null ? formatCurrency(suggestedPrice) : 'N/A'}
              </p>
            </div>
            {lowestPriceInfo && lowestPriceInfo.price > 0 && (
              <div className="col-span-2">
                <p className="text-muted-foreground">Menor P. Compra:</p>
                <p className="font-semibold text-green-600">
                  {formatCurrency(lowestPriceInfo.price)} <span className="text-xs text-muted-foreground">({lowestDistributor})</span>
                </p>
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => { e.stopPropagation(); handleEditClick(product); }}
              title={`Editar precios de ${product.name}`}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const lowestPrices = useMemo(() => {
    const prices: Record<string, { price: number; distributorId: string | null }> = {};
    filteredProducts.forEach(product => {
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
  }, [filteredProducts]);

  const calculateSuggestedPrice = (product: Product): number | null => {
    if (product.lastPurchasePrice === undefined || product.lastPurchasePrice === null || product.margin === undefined || product.margin === null) {
      return null;
    }
    const marginMultiplier = 1 + (product.margin / 100);
    return product.lastPurchasePrice * marginMultiplier;
  };

  const handleEditClick = (product: Product) => {
    setSelectedProductForEdit(product);
    setIsEditDialogOpen(true);
  };

  const handleCloseModal = () => {
    setIsEditDialogOpen(false);
    setSelectedProductForEdit(null);
  };

  const handleOpenProductDetail = (product: Product) => {
    setSelectedProductForDetail(product);
    setIsProductDetailOpen(true);
  };

  const handleCloseProductDetail = () => {
    setIsProductDetailOpen(false);
    setSelectedProductForDetail(null);
  };

  const handleExportExcel = () => {
    const dataToExport = filteredProducts.map(product => {
      const suggestedPrice = calculateSuggestedPrice(product);
      const baseData: any = {
        'Código': product.id,
        'Producto': product.name,
        'Ult. P. Compra': product.lastPurchasePrice ?? 0,
        'Margen (%)': product.margin ?? 0,
        'P. Venta Sug.': suggestedPrice ?? 0,
        'P. Venta': product.sellingPrice ?? 0,
      };
      distributors.forEach(dist => {
        baseData[dist.name] = product.purchasePrices?.[dist.id] ?? 0;
      });
      return baseData;
    });

    const formattedData = dataToExport.map(row => {
      const newRow = { ...row };
      Object.keys(newRow).forEach(key => {
        if (typeof newRow[key] === 'string' && !isNaN(parseFloat(newRow[key]))) {
          if (key.includes('P. Venta') || key.includes('P. Compra') || distributors.some(d => d.name === key)) {
            newRow[key] = parseFloat(newRow[key]);
          } else if (key.includes('Margen (%)')) {
            newRow[key] = parseFloat(newRow[key]);
          }
        } else if (typeof newRow[key] === 'number') {
          if (key.includes('P. Venta') || key.includes('P. Compra') || distributors.some(d => d.name === key)) {
          } else if (key.includes('Margen (%)')) {
          }
        }
      });
      return newRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(formattedData);

    const columnWidths = [
      { wch: 15 },
      { wch: 30 },
      { wch: 15 },
      { wch: 12 },
      { wch: 15 },
      { wch: 15 },
      ...distributors.map(() => ({ wch: 15 }))
    ];
    worksheet['!cols'] = columnWidths;

    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      const currencyCols = [2, 4, 5];
      distributors.forEach((_, i) => currencyCols.push(6 + i));

      currencyCols.forEach(C => {
        const cell_address = { c: C, r: R };
        const cell_ref = XLSX.utils.encode_cell(cell_address);
        if (worksheet[cell_ref] && typeof worksheet[cell_ref].v === 'number') {
          worksheet[cell_ref].t = 'n';
          worksheet[cell_ref].z = '$#,##0.00';
        }
      });

      const marginCellRef = XLSX.utils.encode_cell({ c: 3, r: R });
      if (worksheet[marginCellRef] && typeof worksheet[marginCellRef].v === 'number') {
        worksheet[marginCellRef].t = 'n';
        worksheet[marginCellRef].z = '0.0"%"';
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
      ...distributors.map(d => d.name)
    ];
    const tableRows: (string | number)[][] = [];

    filteredProducts.forEach(product => {
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

    autoTable(doc,{
      head: [tableColumn],
      body: tableRows,
      startY: 20,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [0, 150, 136], textColor: 255, fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 45 },
        2: { halign: 'right', cellWidth: 20 },
        3: { halign: 'right', cellWidth: 15 },
        4: { halign: 'right', cellWidth: 20 },
        5: { halign: 'right', cellWidth: 20 },
      },
      didDrawPage: (data) => {
        doc.setFontSize(18);
        doc.setTextColor(40);
        doc.text("Lista de Precios", data.settings.margin.left, 15);
        const pageCount = doc.getNumberOfPages();
        doc.setFontSize(10);
        doc.text(`Página ${data.pageNumber} de ${pageCount}`, data.settings.margin.left, doc.internal.pageSize.height - 10);
      }
    });

    doc.save(`ListaPrecios_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return <p className="text-center text-destructive">Error al cargar datos: {errorMessage}</p>;
  }

  return (
    <TooltipProvider>
      <Card>
        {isScannerOpen && (
          <FullScreenScanner
            onScanSuccess={handleScanSuccess}
            onClose={() => setIsScannerOpen(false)}
          />
        )}
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle>Lista de Precios</CardTitle>
            <CardDescription>Comparativa de precios de venta y compra. Busca por nombre o código.</CardDescription>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
            <div className='flex'>
            <div className="relative flex-grow min-w-[150px] sm:flex-grow-0">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar o escanear..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 w-full sm:w-56"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={toggleScan}
              title="Escanear Código"
              disabled={!isBarcodeDetectorSupported}
              className="shrink-0"
            >
              <ScanLine className="h-5 w-5" />
            </Button>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" onClick={handleExportExcel} disabled={filteredProducts.length === 0 || isLoading} className="flex-1 sm:flex-none">
                <FileDown className="mr-2 h-4 w-4" /> Excel
              </Button>
              <Button variant="outline" onClick={handleExportPDF} disabled={filteredProducts.length === 0 || isLoading} className="flex-1 sm:flex-none">
                <FileDown className="mr-2 h-4 w-4" /> PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center h-40"><LoadingSpinner /></div>
          ) : filteredProducts.length === 0 ? (
            <p className="text-center text-muted-foreground">
              {searchTerm ? 'No se encontraron productos.' : 'No hay productos para mostrar precios.'}
            </p>
          ) : (
            isMobile ? (
              <div className="space-y-4">
                {filteredProducts.map(renderPriceListCard)}
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-md">
                <Table className="min-w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-card z-20 min-w-[150px] border-r">Producto</TableHead>
                      <TableHead className="text-center sticky left-[150px] bg-card z-20 px-1 w-[50px] border-r"></TableHead>
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
                    {filteredProducts.map((product) => {
                      const suggestedPrice = calculateSuggestedPrice(product);
                      return (
                        <TableRow key={product.id} className="hover:bg-muted/50">
                          <TableCell className="font-medium sticky left-0 bg-card z-10 border-r whitespace-nowrap">
                            <div className="flex flex-col">
                              <span>{product.name}</span>
                              <span className="text-xs text-muted-foreground font-mono">{product.id}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center sticky left-[150px] bg-card z-10 px-1 border-r">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
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
                          <TableCell className="text-right text-muted-foreground">
                            {formatCurrency(product.lastPurchasePrice ?? 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            {`${product.margin ?? 0}%`}
                          </TableCell>
                          <TableCell className="text-right text-blue-600">
                            {suggestedPrice !== null ? formatCurrency(suggestedPrice) : <Ban className="h-4 w-4 mx-auto text-muted-foreground" />}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(product.sellingPrice ?? 0)}
                          </TableCell>
                          {distributors.map(dist => {
                            const purchasePrice = product.purchasePrices?.[dist.id];
                            const isLowest = lowestPrices[product.id]?.distributorId === dist.id && lowestPrices[product.id]?.price > 0;

                            return (
                              <TableCell key={dist.id} className={cn("text-right", isLowest && "font-bold text-green-600")}>
                                {purchasePrice !== undefined && purchasePrice !== null ? formatCurrency(purchasePrice) : <Ban className="h-4 w-4 mx-auto text-muted-foreground" />}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )
          )}
        </CardContent>
        {selectedProductForEdit && (
          <EditPriceDialog
            isOpen={isEditDialogOpen}
            onClose={handleCloseModal}
            product={selectedProductForEdit}
            distributors={distributors}
          />
        )}
      </Card>
      {selectedProductForDetail && (
        <ProductDetailDialog
          isOpen={isProductDetailOpen}
          onClose={handleCloseProductDetail}
          product={selectedProductForDetail}
          distributors={distributors}
        />
      )}
    </TooltipProvider>
  );
};

export default PriceListTable;
