
'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react'; // Added useRef, useEffect
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Ban, Pencil, Percent, Info, FileDown, Search, ScanLine, Camera } from 'lucide-react'; // Added ScanLine, Camera
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
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { autoTable, type UserOptions } from 'jspdf-autotable';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'; // Import Alert

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
  return snapshot.docs
    .map(doc => ({ ...doc.data(), id: doc.id } as Product))
    .sort((a, b) => a.name.localeCompare(b.name));
};

// Fetch distributors function
const fetchDistributors = async (db: any): Promise<Distributor[]> => {
  const distributorsCol = collection(db, 'distributors');
  const snapshot = await getDocs(distributorsCol);
  return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Distributor)).sort((a, b) => a.name.localeCompare(b.name)); // Sort distributors by name
};

const PriceListTable: React.FC = () => {
  const { db } = useFirebase();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedProductForEdit, setSelectedProductForEdit] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isScanning, setIsScanning] = useState(false); // Scanner state
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null); // Camera permission
  const videoRef = useRef<HTMLVideoElement>(null); // Video ref
  const canvasRef = useRef<HTMLCanvasElement>(null); // Canvas ref (optional for overlay)

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

  // Filter products based on search term
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

  // --- Barcode Scanning Logic (Copied & adapted) ---
  const isBarcodeDetectorSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopStream = () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }

    const getCameraPermission = async () => {
      if (!isScanning) {
        setHasCameraPermission(null);
        stopStream();
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        setHasCameraPermission(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(playError => {
            console.error("Error playing video:", playError);
            setHasCameraPermission(false);
            toast({ variant: 'destructive', title: 'Error de Cámara', description: 'No se pudo iniciar la cámara.' });
            setIsScanning(false);
          });
        } else {
          stopStream();
          setIsScanning(false);
        }
      } catch (err) {
        console.error('Error accessing camera:', err);
        setHasCameraPermission(false);
        toast({ variant: 'destructive', title: 'Acceso a Cámara Denegado' });
        setIsScanning(false);
        stopStream();
      }
    };
    getCameraPermission();
    return stopStream;
  }, [isScanning, toast]);

  useEffect(() => {
    if (!isScanning || !hasCameraPermission || !videoRef.current || !isBarcodeDetectorSupported) return;

    let animationFrameId: number;
    let isDetectionRunning = true;
    const barcodeDetector = new (window as any).BarcodeDetector({ formats: ['ean_13', 'upc_a', 'code_128', 'ean_8', 'itf', 'code_39', 'code_93'] });

    const detectBarcode = async () => {
      if (!isDetectionRunning || !videoRef.current || !videoRef.current.srcObject || !isScanning) return;
      if (videoRef.current.readyState < videoRef.current.HAVE_METADATA || videoRef.current.videoWidth === 0) {
        if (isDetectionRunning) animationFrameId = requestAnimationFrame(detectBarcode);
        return;
      }

      try {
        const barcodes = await barcodeDetector.detect(videoRef.current);
        if (barcodes.length > 0 && barcodes[0].rawValue && isDetectionRunning) {
          const scannedId = barcodes[0].rawValue;
          console.log("Barcode detected:", scannedId);
          setSearchTerm(scannedId); // Update search term with scanned barcode
          setIsScanning(false);
          isDetectionRunning = false;
          toast({ title: "Código Detectado", description: scannedId });
        } else if (isDetectionRunning) {
          animationFrameId = requestAnimationFrame(detectBarcode);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'InvalidStateError')) {
          console.error("Error detecting barcode:", error);
        }
        if (isDetectionRunning) animationFrameId = requestAnimationFrame(detectBarcode);
      }
    };
    if (isDetectionRunning) animationFrameId = requestAnimationFrame(detectBarcode);

    return () => {
      isDetectionRunning = false;
      cancelAnimationFrame(animationFrameId);
    };
  }, [isScanning, hasCameraPermission, isBarcodeDetectorSupported, toast]);

  const toggleScan = () => {
    if (!isBarcodeDetectorSupported) {
      toast({ title: "No Soportado", description: "El escáner no es compatible.", variant: "destructive" });
      return;
    }
    setIsScanning(prev => !prev);
  };
  // --- End Barcode Scanning Logic ---

  // Calculate lowest purchase price and identify the distributor using filtered data
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


  // --- Export Functions (Use filteredProducts for exports) ---
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
      { wch: 15 }, // Código
      { wch: 30 }, // Producto
      { wch: 15 }, // Ult. P. Compra
      { wch: 12 }, // Margen (%)
      { wch: 15 }, // P. Venta Sug.
      { wch: 15 }, // P. Venta
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
  // --- End Export Functions ---


  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return <p className="text-center text-destructive">Error al cargar datos: {errorMessage}</p>;
  }


  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle>Lista de Precios</CardTitle>
            <CardDescription>Comparativa de precios de venta y compra. Busca por nombre o código.</CardDescription>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
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
            {/* Scan Button */}
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={toggleScan}
              title={isScanning ? "Detener Escáner" : "Escanear Código"}
              disabled={!isBarcodeDetectorSupported}
              className={cn("shrink-0", isScanning && "bg-destructive hover:bg-destructive/90 text-destructive-foreground")}
            >
              <ScanLine className="h-5 w-5" />
            </Button>
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
          {/* Scanner View */}
          {isScanning && (
            <div className="relative mb-4">
              <video ref={videoRef} className={cn("w-full max-w-sm mx-auto aspect-video rounded-md bg-muted", hasCameraPermission === false && "hidden")} autoPlay muted playsInline />
              <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none" />
              <div className="absolute top-1/2 left-1/2 w-3/4 h-0.5 bg-red-500 animate-pulse -translate-x-1/2 -translate-y-1/2" /> {/* Centered Scan Line */}
              {hasCameraPermission === null && !videoRef.current?.srcObject && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted rounded-md"><LoadingSpinner /><p className="ml-2 text-sm text-muted-foreground">Iniciando...</p></div>
              )}
              {hasCameraPermission === false && (
                <Alert variant="destructive" className="mt-2"><Camera className="h-4 w-4" /><AlertTitle>Permiso Requerido</AlertTitle><AlertDescription>Permite el acceso a la cámara.</AlertDescription></Alert>
              )}
            </div>
          )}
          {isLoading ? (
            <div className="flex justify-center items-center h-40"><LoadingSpinner /></div>
          ) : filteredProducts.length === 0 ? (
            <p className="text-center text-muted-foreground">
              {searchTerm ? 'No se encontraron productos.' : 'No hay productos para mostrar precios.'}
            </p>
          ) : (
            <div className="overflow-x-auto border rounded-md"> {/* Added overflow-x-auto */}
              <Table className="min-w-full"> {/* Added min-w-full */}
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-card z-20 min-w-[150px] border-r">Producto</TableHead>
                    <TableHead className="text-center sticky left-[150px] bg-card z-20 px-1 w-[50px] border-r"></TableHead> {/* Adjusted width */}
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
                        <TableCell className="font-medium sticky left-0 bg-card z-10 border-r whitespace-nowrap"> {/* Added whitespace-nowrap */}
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
    </TooltipProvider>
  );
};

export default PriceListTable;
