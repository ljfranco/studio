
'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react'; // Added useRef, useEffect
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
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
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PlusCircle, Pencil, Trash2, Search, ScanLine, Camera } from 'lucide-react'; // Added ScanLine, Camera
import { formatCurrency, cn } from '@/lib/utils';
import AddEditProductDialog from './AddEditProductDialog'; // Import the dialog
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"; // For delete confirmation
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'; // For camera error
import { useToast } from '@/hooks/use-toast';
import type { Product } from '@/types/product';

// Fetch products function
const fetchProducts = async (db: any): Promise<Product[]> => {
  const productsCol = collection(db, 'products');
  const snapshot = await getDocs(productsCol);
  // Use barcode (doc.id) as the product ID
  return snapshot.docs
    .map(doc => ({ ...doc.data(), id: doc.id } as Product))
    .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically by name
};

// Delete product function
const deleteProduct = async (db: any, productId: string) => {
  const productDocRef = doc(db, 'products', productId);
  await deleteDoc(productDocRef);
};


const ProductTable: React.FC = () => {
  const { db } = useFirebase();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isAddEditDialogOpen, setIsAddEditDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState(''); // State for search term
  const [isScanning, setIsScanning] = useState(false); // State for scanning mode
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null); // Camera permission state
  const videoRef = useRef<HTMLVideoElement>(null); // Ref for video element
  const canvasRef = useRef<HTMLCanvasElement>(null); // Ref for canvas overlay


  // Fetch products using React Query
  const { data: products = [], isLoading, error } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => fetchProducts(db),
  });

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


  // Mutation for deleting a product
  const deleteMutation = useMutation({
    mutationFn: (productId: string) => deleteProduct(db, productId),
    onSuccess: () => {
      toast({ title: 'Éxito', description: 'Producto eliminado correctamente.' });
      queryClient.invalidateQueries({ queryKey: ['products'] }); // Refetch products
      setIsDeleteDialogOpen(false); // Close dialog on success
      setProductToDelete(null);
    },
    onError: (err) => {
      console.error("Error deleting product:", err);
      toast({ title: 'Error', description: `No se pudo eliminar el producto. ${err instanceof Error ? err.message : ''}`, variant: 'destructive' });
      setIsDeleteDialogOpen(false); // Close dialog on error
      setProductToDelete(null);
    },
  });


  // --- Barcode Scanning Logic ---
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
  }, [isScanning, toast]); // Only run when isScanning changes

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
  }, [isScanning, hasCameraPermission, isBarcodeDetectorSupported, toast]); // Add dependencies


  const toggleScan = () => {
    if (!isBarcodeDetectorSupported) {
      toast({ title: "No Soportado", description: "El escáner no es compatible.", variant: "destructive" });
      return;
    }
    setIsScanning(prev => !prev);
  };
  // --- End Barcode Scanning Logic ---


  const handleAddProduct = () => {
    setSelectedProduct(null); // Ensure no product is selected for editing
    setIsAddEditDialogOpen(true);
  };

  const handleEditProduct = (product: Product) => {
    setSelectedProduct(product);
    setIsAddEditDialogOpen(true);
  };

  const openDeleteDialog = (product: Product) => {
    setProductToDelete(product);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (productToDelete) {
      deleteMutation.mutate(productToDelete.id);
    }
  };

  if (error) {
    // Check if error is an instance of Error before accessing message
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return <p className="text-center text-destructive">Error al cargar productos: {errorMessage}</p>;
  }


  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
        <div>
          <CardTitle>Inventario de Productos</CardTitle>
          <CardDescription>Lista de productos en stock. Busca por nombre o código.</CardDescription>
        </div>
        <Button onClick={handleAddProduct}>
          <PlusCircle className="mr-2 h-4 w-4" /> Agregar Producto
        </Button>
      </CardHeader>
      <CardContent>
        {/* Search Input with Scan Button */}
        <div className="mb-4 flex gap-2 items-center flex-wrap">
          <div className="relative flex-grow min-w-[150px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar o escanear..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 w-full"
            />
          </div>
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
        </div>

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
            {searchTerm ? 'No se encontraron productos.' : 'No hay productos en el inventario.'}
          </p>
        ) : (
          <div className="overflow-x-auto border rounded-md"> {/* Added overflow-x-auto */}
            <Table className="min-w-full"> {/* Added min-w-full */}
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[120px]">Código Barras</TableHead> {/* Added min-width */}
                  <TableHead className="min-w-[150px]">Nombre</TableHead> {/* Added min-width */}
                  <TableHead className="text-right min-w-[80px]">Cantidad</TableHead> {/* Added min-width */}
                  <TableHead className="text-right min-w-[120px]">Stock Min.</TableHead> {/* New Column */}
                  <TableHead className="text-right min-w-[120px]">Últ. P. Compra</TableHead> {/* New Column */}
                  <TableHead className="text-right min-w-[120px]">Precio Venta</TableHead> {/* Added min-width */}
                  <TableHead className="text-center min-w-[100px]">Acciones</TableHead> {/* Added min-width */}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{product.id}</TableCell> {/* Added whitespace-nowrap */}
                    <TableCell className="font-medium whitespace-nowrap">{product.name}</TableCell> {/* Added whitespace-nowrap */}
                    <TableCell className="text-right">{product.quantity ?? 0}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {product.minStock ?? 0}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground"> {/* New Cell */}
                      {formatCurrency(product.lastPurchasePrice ?? 0)}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(product.sellingPrice ?? 0)}</TableCell>
                    <TableCell className="text-center space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEditProduct(product)}
                        title={`Editar ${product.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive/90"
                        onClick={() => openDeleteDialog(product)}
                        title={`Eliminar ${product.name}`}
                        disabled={deleteMutation.isPending && productToDelete?.id === product.id}
                      >
                        {deleteMutation.isPending && productToDelete?.id === product.id ? <LoadingSpinner size="sm" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Add/Edit Dialog */}
      <AddEditProductDialog
        isOpen={isAddEditDialogOpen}
        onClose={() => setIsAddEditDialogOpen(false)}
        product={selectedProduct} // Pass null for adding, product data for editing
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar Eliminación?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de eliminar el producto "{productToDelete?.name}" (Código: {productToDelete?.id}). Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDeleteDialogOpen(false)} disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? <LoadingSpinner size="sm" className="mr-2" /> : 'Sí, Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default ProductTable;
