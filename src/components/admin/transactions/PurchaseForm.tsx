
'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useFirebase } from '@/context/FirebaseContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, doc, runTransaction, Timestamp, writeBatch, query, where, orderBy, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Combobox } from '@/components/ui/combobox';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, cn } from '@/lib/utils';
import { PlusCircle, ScanLine, Trash2, Camera, Ban, Truck } from 'lucide-react'; // Added Truck icon
import type { User as AuthUser } from 'firebase/auth';
import type { Product } from '@/types/product';
import type { Distributor } from '@/types/distributor'; // Import Distributor type
import type { Transaction } from '@/types/transaction'; // Only needed if logging purchase transactions
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import AddEditProductDialog from '../inventory/AddEditProductDialog'; // Import dialog for adding products

// Define the structure for items in the purchase list
interface PurchaseItem {
    productId: string;
    productName: string;
    quantity: number;
    purchasePrice: number; // Cost price
    totalCost: number;
}

// --- Fetching Functions ---
const fetchDistributors = async (db: any): Promise<Distributor[]> => {
    const distributorsCol = collection(db, 'distributors');
    const q = query(distributorsCol, orderBy('name'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Distributor));
};

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
    const [selectedDistributorId, setSelectedDistributorId] = useState<string>('');
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
    const [isAddProductDialogOpen, setIsAddProductDialogOpen] = useState(false);
    const [barcodeToAdd, setBarcodeToAdd] = useState<string | null>(null); // Store barcode if product not found


    // --- Data Fetching ---
    const { data: distributors = [], isLoading: isLoadingDistributors, error: errorDistributors } = useQuery<Distributor[]>({
        queryKey: ['distributors'],
        queryFn: () => fetchDistributors(db),
        staleTime: 1000 * 60 * 5,
    });

    const { data: products = [], isLoading: isLoadingProducts, error: errorProducts } = useQuery<Product[]>({
        queryKey: ['products'],
        queryFn: () => fetchProducts(db),
    });

    const isLoading = isLoadingDistributors || isLoadingProducts;
    const error = errorDistributors || errorProducts;

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
        // Pre-fill purchase price if available for the selected distributor
        if (product && selectedDistributorId && product.purchasePrices?.[selectedDistributorId] !== undefined) {
             setPurchasePrice(String(product.purchasePrices[selectedDistributorId]));
        } else {
             setPurchasePrice(''); // Clear if no price or distributor selected
        }
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
              try {
                const barcodes = await barcodeDetector.detect(videoRef.current);
                if (barcodes.length > 0 && barcodes[0].rawValue) {
                  const scannedId = barcodes[0].rawValue;
                  const product = products.find(p => p.id === scannedId);
                  setIsScanning(false); // Stop scanning after detection attempt
                  if (product) {
                      setSelectedProduct(product);
                      setSearchText(`${product.name} (${product.id})`);
                      // Pre-fill price
                      if (selectedDistributorId && product.purchasePrices?.[selectedDistributorId] !== undefined) {
                          setPurchasePrice(String(product.purchasePrices[selectedDistributorId]));
                      } else {
                          setPurchasePrice('');
                      }
                      toast({ title: "Código Detectado", description: `${product.name}` });
                  } else {
                       // Product not found, prompt to add
                       setBarcodeToAdd(scannedId);
                       setIsAddProductDialogOpen(true);
                       toast({ title: "Producto no encontrado", description: `Código: ${scannedId}. Agrega el nuevo producto.`, variant: "default", duration: 5000 });
                  }
                } else {
                  animationFrameId = requestAnimationFrame(detectBarcode);
                }
              } catch (error) {
                console.error("Error detecting barcode:", error);
                animationFrameId = requestAnimationFrame(detectBarcode);
              }
          };
          animationFrameId = requestAnimationFrame(detectBarcode);
          return () => cancelAnimationFrame(animationFrameId);
       }, [isScanning, hasCameraPermission, products, toast, isBarcodeDetectorSupported, selectedDistributorId]); // Add selectedDistributorId dependency

       const toggleScan = () => {
         if (!isBarcodeDetectorSupported) {
             toast({ title: "No Soportado", description: "El escáner no es compatible.", variant: "destructive" });
             return;
         }
         setIsScanning(prev => !prev);
         if (isScanning) {
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
            // Update existing item's quantity and price if it changed
            updatedItems = purchaseItems.map(item =>
                item.productId === selectedProduct.id
                    ? {
                        ...item,
                        quantity: item.quantity + quantity,
                        purchasePrice: price, // Update price potentially
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
        if (!selectedDistributorId) {
            toast({ title: 'Error', description: 'Selecciona un proveedor.', variant: 'destructive' });
            return;
        }
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
                     // This shouldn't happen if products are added before purchase, but handle defensively
                     console.warn(`Product ${item.productId} not found during purchase submission. Skipping update.`);
                     continue; // Or throw an error: throw new Error(`Producto ${item.productName} no encontrado.`);
                }

                const currentQuantity = productSnap.data()?.quantity ?? 0;
                const newQuantity = currentQuantity + item.quantity;

                // Prepare product update
                batch.update(productRef, {
                    quantity: newQuantity,
                    [`purchasePrices.${selectedDistributorId}`]: item.purchasePrice, // Update or set the purchase price for this distributor
                    updatedAt: timestamp, // Update product timestamp
                });
            }

            // TODO: Optionally log the purchase itself as a separate 'purchase_log' transaction
            // This would require creating a new collection and document structure for purchase logs.
            // Example:
            // const purchaseLogRef = doc(collection(db, 'purchaseLogs'));
            // batch.set(purchaseLogRef, {
            //     distributorId: selectedDistributorId,
            //     distributorName: distributors.find(d => d.id === selectedDistributorId)?.name,
            //     items: purchaseItems,
            //     totalCost: purchaseTotal,
            //     purchasedAt: timestamp,
            //     purchasedBy: adminUser.uid,
            //     purchasedByName: adminUser.displayName || adminUser.email,
            // });

            await batch.commit();

            toast({
                title: '¡Compra Registrada!',
                description: `Compra por ${formatCurrency(purchaseTotal)} registrada. Stock actualizado.`,
            });

            // Reset form state
            setSelectedDistributorId('');
            setPurchaseItems([]);
            setSelectedProduct(null);
            setSearchText('');
            setQuantity(1);
            setPurchasePrice('');

            queryClient.invalidateQueries({ queryKey: ['products'] }); // Invalidate products cache

        } catch (error) {
            console.error("Error submitting purchase:", error);
            toast({
                title: 'Error al Registrar Compra',
                description: `No se pudo completar la operación. ${error instanceof Error ? error.message : String(error)}`,
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

     // --- Handler for when a new product is added via the dialog ---
     const handleProductAdded = useCallback((newProduct: Product) => {
         // Invalidate and refetch products query to include the new one
         queryClient.invalidateQueries({ queryKey: ['products'] }).then(() => {
             // After refetch, find the new product and select it
             queryClient.getQueryData<Product[]>(['products'])?.then((updatedProducts) => {
                 const addedProduct = updatedProducts?.find(p => p.id === newProduct.id);
                 if (addedProduct) {
                     setSelectedProduct(addedProduct);
                     setSearchText(`${addedProduct.name} (${addedProduct.id})`);
                      // Optionally pre-fill price if a distributor is selected
                      if (selectedDistributorId && addedProduct.purchasePrices?.[selectedDistributorId] !== undefined) {
                          setPurchasePrice(String(addedProduct.purchasePrices[selectedDistributorId]));
                      } else {
                          setPurchasePrice('');
                      }
                 }
             });
         });
         setBarcodeToAdd(null); // Clear the barcode after handling
     }, [queryClient, selectedDistributorId]);


    // --- Render Logic ---
    if (error) return <p className="text-center text-destructive">Error al cargar datos: {error instanceof Error ? error.message : 'Error desconocido'}</p>;
    if (isLoading) return <div className="flex justify-center p-4"><LoadingSpinner /></div>;

    return (
        <div className="space-y-6">
             {/* Distributor Selection */}
             <div>
                <Label htmlFor="distributor-select">Proveedor</Label>
                <Select
                    value={selectedDistributorId}
                    onValueChange={(value) => {
                        setSelectedDistributorId(value);
                        // Clear purchase price when distributor changes, unless product is selected
                        if (selectedProduct && value && selectedProduct.purchasePrices?.[value] !== undefined) {
                             setPurchasePrice(String(selectedProduct.purchasePrices[value]));
                        } else {
                            setPurchasePrice('');
                        }
                    }}
                    disabled={isSubmitting || purchaseItems.length > 0} // Disable if items added
                >
                    <SelectTrigger id="distributor-select">
                        <SelectValue placeholder="Selecciona un proveedor..." />
                    </SelectTrigger>
                    <SelectContent>
                        {distributors.map((dist) => (
                            <SelectItem key={dist.id} value={dist.id}>
                                {dist.name}
                            </SelectItem>
                        ))}
                        {distributors.length === 0 && <div className="p-4 text-sm text-muted-foreground">No hay proveedores registrados.</div>}
                    </SelectContent>
                </Select>
                 {purchaseItems.length > 0 && <p className="text-xs text-muted-foreground mt-1">Proveedor bloqueado hasta finalizar o cancelar la compra actual.</p>}
             </div>

             {/* Add Product Section */}
            <div className="border p-4 rounded-md space-y-4 bg-secondary/50">
                 <h3 className="text-lg font-medium mb-2">Agregar Producto a la Compra</h3>

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
                          {/* Add New Product Button (appears if search yields no results but text exists) */}
                          {searchText && !selectedProduct && filteredProductOptions.length === 0 && !isLoadingProducts && (
                            <Button
                                type="button"
                                variant="link"
                                className="text-xs h-auto p-0 mt-1"
                                onClick={() => setIsAddProductDialogOpen(true)}
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
                        className="w-full sm:w-auto shrink-0" // Prevent button from shrinking too much
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
                    <p className="text-xl font-bold">Total Compra: {formatCurrency(purchaseTotal)}</p>
                    <div className='flex gap-2'>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setPurchaseItems([]);
                                setSelectedDistributorId(''); // Reset selection
                            }}
                            disabled={isSubmitting}
                        >
                            Cancelar Compra Actual
                        </Button>
                        <Button
                            onClick={handleSubmitPurchase}
                            disabled={isSubmitting || purchaseItems.length === 0 || !selectedDistributorId}
                            size="lg"
                        >
                            {isSubmitting
                                ? <LoadingSpinner className="mr-2" />
                                : <><Truck className="mr-2 h-4 w-4" /> Confirmar Compra</>
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
                product={barcodeToAdd ? { id: barcodeToAdd, name: '', quantity: 0, sellingPrice: 0 } : null} // Pass barcode to prefill
                onSuccessCallback={handleProductAdded} // Callback to handle added product
            />
        </div>
    );
};

export default PurchaseForm;
