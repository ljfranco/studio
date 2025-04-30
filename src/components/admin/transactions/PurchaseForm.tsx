'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useFirebase } from '@/context/FirebaseContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, doc, runTransaction, Timestamp, writeBatch, query, where, orderBy, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
// Removed Select import as distributor is removed
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Combobox } from '@/components/ui/combobox';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, cn } from '@/lib/utils';
import { PlusCircle, ScanLine, Trash2, Camera, Ban, Truck } from 'lucide-react';
import type { User as AuthUser } from 'firebase/auth';
import type { Product } from '@/types/product';
// Removed Distributor import
import type { Transaction } from '@/types/transaction';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import AddEditProductDialog from '../inventory/AddEditProductDialog'; // Import AddEditProductDialog

// Define the structure for items in the purchase list
interface PurchaseItem {
    productId: string;
    productName: string;
    quantity: number;
    purchasePrice: number; // Cost price
    totalCost: number;
}

// --- Fetching Functions ---
// Removed fetchDistributors

const fetchProducts = async (db: any): Promise<Product[]> => {
    const productsCol = collection(db, 'products');
    const snapshot = await getDocs(productsCol);
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Product));
};

// --- Component ---
const PurchaseForm: React.FC = () => {
    const { db } = useFirebase();
    const { user: adminUser } = useAuth(); // Admin performing the purchase
    const { toast } = useToast();
    const queryClient = useQueryClient();
    // Removed selectedDistributorId state
    const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [quantity, setQuantity] = useState<number>(1);
    const [purchasePrice, setPurchasePrice] = useState<string>(''); // Store as string for input flexibility
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [searchText, setSearchText] = useState('');
    const [isAddProductDialogOpen, setIsAddProductDialogOpen] = useState(false); // State for Add Product Dialog
    const [barcodeToAdd, setBarcodeToAdd] = useState<string | null>(null); // State to store barcode for new product


    // --- Data Fetching ---
    // Removed distributor query

    const { data: products = [], isLoading: isLoadingProducts, error: errorProducts } = useQuery<Product[]>({
        queryKey: ['products'],
        queryFn: () => fetchProducts(db),
    });

    const isLoading = isLoadingProducts; // Adjusted loading state
    const error = errorProducts; // Adjusted error state

     // --- Product Search ---
     const productOptions = useMemo(() => {
        if (!products) return [];
        return products.map(p => ({ value: p.id, label: `${p.name} (${p.id})` }));
     }, [products]);

     const filteredProductOptions = useMemo(() => {
        if (!searchText) return productOptions;
        return productOptions.filter(option =>
          option.label.toLowerCase().includes(searchText.toLowerCase())
        );
     }, [searchText, productOptions]);

     const handleProductSelect = (barcode: string) => {
        const product = products.find(p => p.id === barcode);
        setSelectedProduct(product || null);
        setSearchText(product ? `${product.name} (${product.id})` : '');
        // Removed pre-filling price based on distributor
        setPurchasePrice(''); // Clear price on new product selection
     };


     // --- Barcode Scanning ---
     const isBarcodeDetectorSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

      useEffect(() => {
        let stream: MediaStream | null = null;
        const getCameraPermission = async () => {
          if (!isScanning) {
            setHasCameraPermission(null);
            if (videoRef.current && videoRef.current.srcObject) {
                (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
                videoRef.current.srcObject = null;
              }
            return;
          }
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            setHasCameraPermission(true);
            if (videoRef.current) videoRef.current.srcObject = stream;
          } catch (err) {
            console.error('Error accessing camera:', err);
            setHasCameraPermission(false);
            toast({ variant: 'destructive', title: 'Acceso a Cámara Denegado' });
            setIsScanning(false);
          }
        };
        getCameraPermission();
        return () => stream?.getTracks().forEach(track => track.stop());
      }, [isScanning, toast]);

      useEffect(() => {
          if (!isScanning || !hasCameraPermission || !videoRef.current || !isBarcodeDetectorSupported) return;

          let animationFrameId: number;
          const barcodeDetector = new (window as any).BarcodeDetector({ formats: ['ean_13', 'upc_a', 'code_128'] });

          const detectBarcode = async () => {
              if (!videoRef.current || !videoRef.current.srcObject || !isScanning) return;

              // Check if video is ready before detecting
              if (videoRef.current.readyState < videoRef.current.HAVE_CURRENT_DATA) {
                  console.log("Video not ready for detection, waiting...");
                  animationFrameId = requestAnimationFrame(detectBarcode);
                  return;
              }

              try {
                const barcodes = await barcodeDetector.detect(videoRef.current);
                if (barcodes.length > 0 && barcodes[0].rawValue) {
                  const scannedId = barcodes[0].rawValue;
                  const product = products.find(p => p.id === scannedId);
                  setIsScanning(false); // Stop scanning after detection attempt
                  if (product) {
                      setSelectedProduct(product);
                      setSearchText(`${product.name} (${product.id})`);
                      // Removed pre-fill price logic based on distributor
                      setPurchasePrice(''); // Clear price field
                      toast({ title: "Código Detectado", description: `${product.name}` });
                  } else {
                       // Product not found, prompt to add
                       setBarcodeToAdd(scannedId); // Store the scanned barcode
                       setIsAddProductDialogOpen(true); // Open the dialog
                       toast({ title: "Producto no encontrado", description: `Código: ${scannedId}. Agrega el nuevo producto.`, variant: "default", duration: 5000 });
                  }
                } else {
                  animationFrameId = requestAnimationFrame(detectBarcode);
                }
              } catch (error) {
                console.error("Error detecting barcode:", error);
                // Continue scanning even if detection fails once
                animationFrameId = requestAnimationFrame(detectBarcode);
              }
          };
          animationFrameId = requestAnimationFrame(detectBarcode);
          return () => cancelAnimationFrame(animationFrameId);
       }, [isScanning, hasCameraPermission, products, toast, isBarcodeDetectorSupported]); // Added products as dependency

       const toggleScan = () => {
         if (!isBarcodeDetectorSupported) {
             toast({ title: "No Soportado", description: "El escáner no es compatible.", variant: "destructive" });
             return;
         }
         setIsScanning(prev => !prev);
         if (isScanning) { // If turning scanner OFF
             setSelectedProduct(null);
             setSearchText('');
             setPurchasePrice('');
         }
       };

    // --- Purchase Item Management ---
    const handleAddItem = () => {
        if (!selectedProduct || quantity <= 0) {
            toast({ title: 'Error', description: 'Selecciona un producto y una cantidad válida.', variant: 'destructive' });
            return;
        }
        const price = parseFloat(purchasePrice.replace(/[^0-9.]+/g, ''));
        if (isNaN(price) || price < 0) {
             toast({ title: 'Error', description: 'Ingresa un precio de compra válido.', variant: 'destructive' });
             return;
        }

        const existingItem = purchaseItems.find(item => item.productId === selectedProduct.id);
        let updatedItems;

        if (existingItem) {
            // Update existing item's quantity and potentially price
            updatedItems = purchaseItems.map(item =>
                item.productId === selectedProduct.id
                    ? {
                        ...item,
                        quantity: item.quantity + quantity,
                        purchasePrice: price, // Update price to the newly entered one
                        totalCost: (item.quantity + quantity) * price
                      }
                    : item
            );
        } else {
            const newItem: PurchaseItem = {
                productId: selectedProduct.id,
                productName: selectedProduct.name,
                quantity: quantity,
                purchasePrice: price,
                totalCost: quantity * price,
            };
            updatedItems = [...purchaseItems, newItem];
        }

        setPurchaseItems(updatedItems);
        // Reset inputs
        setSelectedProduct(null);
        setSearchText('');
        setQuantity(1);
        setPurchasePrice('');
    };

    const handleRemoveItem = (productId: string) => {
        setPurchaseItems(purchaseItems.filter(item => item.productId !== productId));
    };

    const purchaseTotal = useMemo(() => {
        return purchaseItems.reduce((total, item) => total + item.totalCost, 0);
    }, [purchaseItems]);


    // --- Submit Purchase ---
    const handleSubmitPurchase = async () => {
        // Removed distributor check
        if (purchaseItems.length === 0) {
            toast({ title: 'Error', description: 'Agrega al menos un producto a la compra.', variant: 'destructive' });
            return;
        }
        if (!adminUser) {
            toast({ title: 'Error', description: 'Usuario administrador no válido.', variant: 'destructive' });
            return;
        }

        setIsSubmitting(true);

        try {
            const batch = writeBatch(db);
            const timestamp = serverTimestamp(); // Use server timestamp for consistency

            for (const item of purchaseItems) {
                const productRef = doc(db, 'products', item.productId);
                const productSnap = await getDoc(productRef); // Need to read current quantity

                if (!productSnap.exists()) {
                     console.warn(`Product ${item.productId} not found during purchase submission. Skipping update.`);
                     continue; // Skip this item if product doc doesn't exist
                }

                const currentQuantity = productSnap.data()?.quantity ?? 0;
                const newQuantity = currentQuantity + item.quantity;

                // Prepare product update - ONLY update quantity and timestamp
                batch.update(productRef, {
                    quantity: newQuantity,
                    // Removed purchase price update based on distributor
                    updatedAt: timestamp, // Update product timestamp
                });
            }

            // Removed optional purchase log for simplicity based on the request

            await batch.commit();

            toast({
                title: '¡Stock Actualizado!',
                description: `Ingreso de mercadería por ${formatCurrency(purchaseTotal)} registrado. Stock actualizado.`,
            });

            // Reset form state
            // Removed distributor reset
            setPurchaseItems([]);
            setSelectedProduct(null);
            setSearchText('');
            setQuantity(1);
            setPurchasePrice('');

            queryClient.invalidateQueries({ queryKey: ['products'] }); // Invalidate products cache

        } catch (error) {
            console.error("Error submitting purchase:", error);
            toast({
                title: 'Error al Registrar Ingreso',
                description: `No se pudo completar la operación. ${error instanceof Error ? error.message : String(error)}`,
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

     // --- Handler for when a new product is added via the dialog ---
     const handleProductAdded = useCallback((newProduct: Product) => {
         // Invalidate and refetch is one way, or directly update cache
         // For simplicity, let's invalidate and let the main query refetch
         queryClient.invalidateQueries({ queryKey: ['products'] }).then(() => {
             // After invalidation, get the latest data and select the product
             // Use getQueryData which might return undefined if data not ready yet
             queryClient.getQueryData<Product[]>(['products'])?.then((updatedProducts) => {
                 const addedProduct = updatedProducts?.find(p => p.id === newProduct.id);
                 if (addedProduct) {
                     setSelectedProduct(addedProduct);
                     setSearchText(`${addedProduct.name} (${addedProduct.id})`); // Set search text
                     setPurchasePrice(''); // Clear price field
                 }
             });
         });
         setBarcodeToAdd(null); // Clear the barcode to add state
     }, [queryClient]);


    // --- Render Logic ---
    if (error) return <p className="text-center text-destructive">Error al cargar datos: {error instanceof Error ? error.message : 'Error desconocido'}</p>;
    if (isLoading) return <div className="flex justify-center p-4"><LoadingSpinner /></div>;

    return (
        <div className="space-y-6">
             {/* Distributor Selection Removed */}

             {/* Add Product Section */}
            <div className="border p-4 rounded-md space-y-4 bg-secondary/50">
                 <h3 className="text-lg font-medium mb-2">Agregar Producto Comprado</h3>

                  {/* Scanner Section */}
                 {isScanning && (
                     <div className="relative mb-4">
                         <video ref={videoRef} className={cn("w-full aspect-video rounded-md bg-muted", hasCameraPermission === false && "hidden")} autoPlay muted playsInline />
                         <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none" />
                         <div className="absolute top-1/2 left-0 w-full h-0.5 bg-red-500 animate-pulse" />
                         {hasCameraPermission === null && !videoRef.current?.srcObject && (
                             <div className="absolute inset-0 flex items-center justify-center bg-muted rounded-md"><LoadingSpinner /><p className="ml-2 text-sm text-muted-foreground">Iniciando...</p></div>
                         )}
                         {hasCameraPermission === false && (
                             <Alert variant="destructive" className="mt-2"><Camera className="h-4 w-4" /><AlertTitle>Permiso Requerido</AlertTitle><AlertDescription>Permite el acceso a la cámara.</AlertDescription></Alert>
                         )}
                     </div>
                 )}

                 {/* Product Search / Scan */}
                <div className="flex flex-col sm:flex-row gap-2 items-end">
                    {/* Search Combobox */}
                    <div className="flex-grow">
                         <Label htmlFor="product-search">Producto</Label>
                         <div className="flex items-center gap-2">
                              <Combobox
                                options={filteredProductOptions}
                                value={selectedProduct?.id ?? ''}
                                onSelect={handleProductSelect}
                                placeholder="Busca o escanea..."
                                searchPlaceholder="Escribe para buscar..."
                                notFoundMessage="Producto no encontrado."
                                searchText={searchText}
                                setSearchText={setSearchText}
                                disabled={isScanning || isSubmitting}
                                triggerId="product-search"
                              />
                             <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={toggleScan}
                                title={isScanning ? "Detener Escáner" : "Escanear Código"}
                                disabled={isSubmitting || !isBarcodeDetectorSupported}
                                className={cn("shrink-0", isScanning && "bg-destructive hover:bg-destructive/90 text-destructive-foreground")}
                            >
                                <ScanLine className="h-5 w-5" />
                            </Button>
                         </div>
                          {!isBarcodeDetectorSupported && (
                            <p className="text-xs text-destructive mt-1">Escáner no compatible.</p>
                          )}
                          {/* Add New Product Button */}
                          {searchText && !selectedProduct && filteredProductOptions.length === 0 && !isLoadingProducts && (
                            <Button
                                type="button"
                                variant="link"
                                className="text-xs h-auto p-0 mt-1"
                                onClick={() => setIsAddProductDialogOpen(true)} // Open dialog without prefilled barcode
                            >
                                ¿Producto no encontrado? Agrégalo aquí.
                            </Button>
                          )}
                    </div>

                    {/* Quantity Input */}
                    <div className="w-full sm:w-20">
                        <Label htmlFor="quantity">Cantidad</Label>
                        <Input
                            id="quantity"
                            type="number"
                            min="1"
                            step="1"
                            value={quantity}
                            onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                            className="w-full text-center"
                            disabled={!selectedProduct || isSubmitting}
                        />
                    </div>
                     {/* Purchase Price Input */}
                     <div className="w-full sm:w-28">
                        <Label htmlFor="purchasePrice">Precio Costo</Label>
                        <Input
                            id="purchasePrice"
                            type="text" // Use text for flexible input with currency symbols
                            inputMode="decimal" // Hint for mobile keyboards
                            placeholder="0.00"
                            value={purchasePrice}
                            onChange={(e) => setPurchasePrice(e.target.value)}
                            className="w-full text-right"
                            disabled={!selectedProduct || isSubmitting}
                        />
                    </div>

                     {/* Add Item Button */}
                     <Button
                        type="button"
                        onClick={handleAddItem}
                        disabled={!selectedProduct || quantity <= 0 || !purchasePrice || isSubmitting}
                        className="w-full sm:w-auto shrink-0"
                     >
                        <PlusCircle className="mr-2 h-4 w-4" /> Agregar
                    </Button>
                 </div>
                 {selectedProduct && (
                    <p className="text-xs text-muted-foreground">
                        Seleccionado: {selectedProduct.name} - Stock Actual: {selectedProduct.quantity ?? 0}
                    </p>
                )}
            </div>

             {/* Purchase Items List */}
             {purchaseItems.length > 0 && (
                <div className="border rounded-md overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Producto</TableHead>
                                <TableHead className="text-center">Cantidad</TableHead>
                                <TableHead className="text-right">Precio Costo</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead className="text-center">Quitar</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {purchaseItems.map((item) => (
                                <TableRow key={item.productId}>
                                    <TableCell className="font-medium">{item.productName}</TableCell>
                                    <TableCell className="text-center">{item.quantity}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(item.purchasePrice)}</TableCell>
                                    <TableCell className="text-right font-semibold">{formatCurrency(item.totalCost)}</TableCell>
                                    <TableCell className="text-center">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-destructive hover:text-destructive/90"
                                            onClick={() => handleRemoveItem(item.productId)}
                                            disabled={isSubmitting}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
             )}

             {/* Total and Submit */}
             {purchaseItems.length > 0 && (
                <div className="flex flex-col items-end space-y-4 mt-4 sticky bottom-0 bg-background py-4 px-6 border-t">
                    <p className="text-xl font-bold">Total Ingreso: {formatCurrency(purchaseTotal)}</p>
                    <div className='flex gap-2'>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setPurchaseItems([]);
                                // Removed distributor reset
                            }}
                            disabled={isSubmitting}
                        >
                            Cancelar Ingreso Actual
                        </Button>
                        <Button
                            onClick={handleSubmitPurchase}
                            disabled={isSubmitting || purchaseItems.length === 0} // Removed distributor check
                            size="lg"
                        >
                            {isSubmitting
                                ? <LoadingSpinner className="mr-2" />
                                : <><Truck className="mr-2 h-4 w-4" /> Confirmar Ingreso</>
                            }
                        </Button>
                    </div>
                </div>
             )}

            {/* Add Product Dialog */}
            <AddEditProductDialog
                isOpen={isAddProductDialogOpen}
                onClose={() => {
                    setIsAddProductDialogOpen(false);
                    setBarcodeToAdd(null); // Clear barcode when closing
                }}
                product={barcodeToAdd ? { id: barcodeToAdd } : null} // Pass only ID for minimal add
                onSuccessCallback={handleProductAdded} // Callback to handle added product
                isMinimalAdd={true} // Trigger minimal add mode
            />
        </div>
    );
};

export default PurchaseForm;
