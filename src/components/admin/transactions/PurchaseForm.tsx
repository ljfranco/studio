
'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useFirebase } from '@/context/FirebaseContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, doc, runTransaction, Timestamp, writeBatch, query, where, orderBy, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Combobox } from '@/components/ui/combobox';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, cn } from '@/lib/utils';
import { PlusCircle, ScanLine, Trash2, Camera, Ban, Truck } from 'lucide-react';
import type { User as AuthUser } from 'firebase/auth';
import type { Product } from '@/types/product';
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
    const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [quantity, setQuantity] = useState<number | ''>(''); // Allow empty string for placeholder
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
    const { data: products = [], isLoading: isLoadingProducts, error: errorProducts } = useQuery<Product[]>({
        queryKey: ['products'],
        queryFn: () => fetchProducts(db),
    });

    const isLoading = isLoadingProducts;
    const error = errorProducts;

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
        // Pre-fill purchase price if available from last purchase
        setPurchasePrice(product?.lastPurchasePrice?.toString() ?? '');
        setQuantity(''); // Reset quantity when selecting a new product
     };


     // --- Barcode Scanning (Adapted) ---
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
                     toast({ variant: 'destructive', title: 'Error de Cámara', description: 'No se pudo iniciar la cámara.'});
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
                  const product = products.find(p => p.id === scannedId);
                   setIsScanning(false);
                   isDetectionRunning = false;

                  if (product) {
                      setSelectedProduct(product);
                      setSearchText(`${product.name} (${product.id})`);
                      setPurchasePrice(product.lastPurchasePrice?.toString() ?? '');
                       setQuantity('');
                      toast({ title: "Código Detectado", description: `${product.name}` });
                  } else {
                       setBarcodeToAdd(scannedId);
                       setIsAddProductDialogOpen(true);
                       toast({ title: "Producto no encontrado", description: `Código: ${scannedId}. Agrega el nuevo producto.`, variant: "default", duration: 5000 });
                  }
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
       }, [isScanning, hasCameraPermission, products, toast, isBarcodeDetectorSupported]);


       const toggleScan = () => {
         if (!isBarcodeDetectorSupported) {
             toast({ title: "No Soportado", description: "El escáner no es compatible.", variant: "destructive" });
             return;
         }
         setIsScanning(prev => !prev);
          if (!isScanning) {
              setSelectedProduct(null);
              setSearchText('');
              setPurchasePrice('');
              setQuantity('');
          }
       };

    // --- Purchase Item Management ---
    const handleAddItem = () => {
        const currentQuantity = Number(quantity);
        if (!selectedProduct || !quantity || currentQuantity <= 0) {
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
            updatedItems = purchaseItems.map(item =>
                item.productId === selectedProduct.id
                    ? {
                        ...item,
                        quantity: item.quantity + currentQuantity,
                        purchasePrice: price,
                        totalCost: (item.quantity + currentQuantity) * price
                      }
                    : item
            );
        } else {
            const newItem: PurchaseItem = {
                productId: selectedProduct.id,
                productName: selectedProduct.name,
                quantity: currentQuantity,
                purchasePrice: price,
                totalCost: currentQuantity * price,
            };
            updatedItems = [...purchaseItems, newItem];
        }

        setPurchaseItems(updatedItems);
        setSelectedProduct(null);
        setSearchText('');
        setQuantity('');
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
            const timestamp = serverTimestamp();

            for (const item of purchaseItems) {
                const productRef = doc(db, 'products', item.productId);
                const productSnap = await getDoc(productRef);

                if (!productSnap.exists()) {
                     console.warn(`Product ${item.productId} not found during purchase submission. Skipping update.`);
                     continue;
                }

                const currentQuantity = productSnap.data()?.quantity ?? 0;
                const newQuantity = currentQuantity + item.quantity;

                batch.update(productRef, {
                    quantity: newQuantity,
                    lastPurchasePrice: item.purchasePrice,
                    updatedAt: timestamp,
                });
            }

            await batch.commit();

            toast({
                title: '¡Stock Actualizado!',
                description: `Ingreso de mercadería por ${formatCurrency(purchaseTotal)} registrado. Stock actualizado.`,
            });

            setPurchaseItems([]);
            setSelectedProduct(null);
            setSearchText('');
            setQuantity('');
            setPurchasePrice('');

            queryClient.invalidateQueries({ queryKey: ['products'] });

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
         queryClient.invalidateQueries({ queryKey: ['products'] });

         if (newProduct) {
            setSelectedProduct(newProduct);
            setSearchText(`${newProduct.name} (${newProduct.id})`);
            setPurchasePrice(newProduct.lastPurchasePrice?.toString() ?? '');
            setQuantity('');
         }

         setBarcodeToAdd(null);
     }, [queryClient]);


    // --- Render Logic ---
    if (error) return <p className="text-center text-destructive">Error al cargar datos: {error instanceof Error ? error.message : 'Error desconocido'}</p>;
    if (isLoading) return <div className="flex justify-center p-4"><LoadingSpinner /></div>;

    return (
        <div className="space-y-6">
             {/* Add Product Section */}
            <div className="border p-4 rounded-md space-y-4 bg-secondary/50">
                 <h3 className="text-lg font-medium mb-2">Agregar Producto Comprado</h3>

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

                 {/* Product Search / Scan & Quantity/Price Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                    {/* Search Combobox & Scan Button (larger width on medium screens) */}
                    <div className="md:col-span-5">
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
                    <div className="md:col-span-2">
                        <Label htmlFor="quantity">Cantidad</Label>
                        <Input
                            id="quantity"
                            type="number"
                            min="1"
                            step="1"
                            placeholder="Cant." // Use placeholder
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value === '' ? '' : parseInt(e.target.value, 10) || '')} // Allow empty string
                            className="w-full text-center"
                            disabled={!selectedProduct || isSubmitting}
                        />
                    </div>
                     {/* Purchase Price Input */}
                     <div className="md:col-span-3">
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
                     <div className="md:col-span-2">
                         <Button
                            type="button"
                            onClick={handleAddItem}
                            disabled={!selectedProduct || !quantity || quantity <= 0 || !purchasePrice || isSubmitting} // Update disabled check
                            className="w-full"
                         >
                            <PlusCircle className="mr-2 h-4 w-4" /> Agregar
                        </Button>
                    </div>
                 </div>
                 {selectedProduct && (
                    <p className="text-xs text-muted-foreground mt-2">
                        Seleccionado: {selectedProduct.name} - Stock Actual: {selectedProduct.quantity ?? 0} - Ult. Compra: {formatCurrency(selectedProduct.lastPurchasePrice ?? 0)}
                    </p>
                )}
            </div>

             {/* Purchase Items List */}
             {purchaseItems.length > 0 && (
                <div className="border rounded-md overflow-x-auto"> {/* Added overflow-x-auto */}
                    <Table className="min-w-full"> {/* Added min-w-full */}
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-[150px]">Producto</TableHead> {/* Added min-width */}
                                <TableHead className="text-center min-w-[80px]">Cantidad</TableHead> {/* Added min-width */}
                                <TableHead className="text-right min-w-[100px]">Precio Costo</TableHead> {/* Added min-width */}
                                <TableHead className="text-right min-w-[110px]">Total</TableHead> {/* Added min-width */}
                                <TableHead className="text-center">Quitar</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {purchaseItems.map((item) => (
                                <TableRow key={item.productId}>
                                    <TableCell className="font-medium whitespace-nowrap">{item.productName}</TableCell> {/* Added whitespace-nowrap */}
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
                    <div className='flex gap-2 flex-wrap justify-end'> {/* Added flex-wrap */}
                        <Button
                            variant="outline"
                            onClick={() => {
                                setPurchaseItems([]);
                            }}
                            disabled={isSubmitting}
                        >
                            Cancelar Ingreso Actual
                        </Button>
                        <Button
                            onClick={handleSubmitPurchase}
                            disabled={isSubmitting || purchaseItems.length === 0}
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
