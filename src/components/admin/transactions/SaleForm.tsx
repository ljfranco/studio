
'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useFirebase } from '@/context/FirebaseContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, doc, runTransaction, Timestamp, writeBatch, query, where, orderBy, setDoc, getDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Combobox } from '@/components/ui/combobox'; // Assuming Combobox component exists
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, cn } from '@/lib/utils';
import { PlusCircle, ScanLine, Trash2, Camera, Ban, Pencil, AlertCircle } from 'lucide-react'; // Added AlertCircle
import type { User as AuthUser } from 'firebase/auth';
import type { Product } from '@/types/product';
import type { UserData } from '@/types/user'; // Define or import UserData type
import type { Transaction, SaleDetail } from '@/types/transaction';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
// Removed direct import of UserDetailView's recalculateBalance
import AddEditProductDialog from '../inventory/AddEditProductDialog'; // Import AddEditProductDialog

// Special ID for the generic customer - Changed from reserved name
const CONSUMIDOR_FINAL_ID = 'consumidor-final-id'; // Changed ID
const CONSUMIDOR_FINAL_NAME = 'Consumidor Final';

// --- Fetching Functions ---
const fetchUsers = async (db: any): Promise<UserData[]> => {
    const usersCol = collection(db, 'users');
    const q = query(usersCol, where('role', '!=', 'admin'), orderBy('name'));
    const snapshot = await getDocs(q);
    const users = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as UserData))
        .filter(user => user.id !== CONSUMIDOR_FINAL_ID);

     // Ensure generic user exists and add to the beginning
     const genericUserDocRef = doc(db, 'users', CONSUMIDOR_FINAL_ID);
     const genericDocSnap = await getDoc(genericUserDocRef);
     if (!genericDocSnap.exists()) {
        try {
            await setDoc(genericUserDocRef, {
                 name: CONSUMIDOR_FINAL_NAME,
                 role: 'user',
                 balance: 0,
                 isEnabled: true,
                 createdAt: Timestamp.now(),
                 isGeneric: true,
            });
            console.log("Created generic consumer document.");
        } catch (error) {
             console.error("Failed to create generic consumer document:", error);
        }
     }
    users.unshift({ id: CONSUMIDOR_FINAL_ID, name: CONSUMIDOR_FINAL_NAME, email: '', balance: 0, isEnabled: true, role: 'user', isGeneric: true });


    return users;
};

const fetchProducts = async (db: any): Promise<Product[]> => {
    const productsCol = collection(db, 'products');
    const snapshot = await getDocs(productsCol);
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Product));
};

// --- Component Props ---
interface SaleFormProps {
    saleToEdit?: Transaction | null; // Optional prop for editing an existing sale
    onClose?: () => void; // Callback to close the dialog/modal if editing
    onSuccessCallback?: () => void; // General success callback (e.g., for recalculation)
}


// --- Component ---
const SaleForm: React.FC<SaleFormProps> = ({ saleToEdit = null, onClose, onSuccessCallback }) => {
    const { db } = useFirebase();
    const { user: adminUser } = useAuth(); // Admin performing the sale
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [selectedUserId, setSelectedUserId] = useState<string>('');
    const [saleItems, setSaleItems] = useState<SaleDetail[]>([]);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [quantity, setQuantity] = useState<number | ''>(''); // Allow empty string for placeholder
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [searchText, setSearchText] = useState(''); // For product search
    const [isAddProductDialogOpen, setIsAddProductDialogOpen] = useState(false); // Add state for Add Product dialog
    const [barcodeToAdd, setBarcodeToAdd] = useState<string | null>(null); // Add state to hold scanned barcode for new product

    const isEditMode = !!saleToEdit;
    const isCustomerSelected = !!selectedUserId; // Check if a customer is selected

    // --- Initialize form state for editing ---
    useEffect(() => {
        if (isEditMode && saleToEdit) {
            console.log("Populating form for editing sale:", saleToEdit.id);
            setSelectedUserId(saleToEdit.userId);
            setSaleItems(saleToEdit.saleDetails || []);
        } else {
             setSelectedUserId('');
             setSaleItems([]);
             setSelectedProduct(null);
             setSearchText('');
             setQuantity('');
        }
    }, [isEditMode, saleToEdit]);

    // --- Data Fetching ---
    const { data: users = [], isLoading: isLoadingUsers, error: errorUsers } = useQuery<UserData[]>({
        queryKey: ['saleUsers'],
        queryFn: () => fetchUsers(db),
        staleTime: 1000 * 60 * 5,
    });

    const { data: products = [], isLoading: isLoadingProducts, error: errorProducts } = useQuery<Product[]>({
        queryKey: ['products'],
        queryFn: () => fetchProducts(db),
    });

    const isLoading = isLoadingUsers || isLoadingProducts;
    const error = errorUsers || errorProducts;

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
        setQuantity('');
     };


     // --- Barcode Scanning ---
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
                       setQuantity('');
                      toast({ title: "Código Detectado", description: `${product.name}` });
                  } else {
                       // If product not found, open Add Product dialog
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
              setQuantity('');
          }
       };


    // --- Sale Item Management ---
    const handleAddItem = () => {
        const currentQuantity = Number(quantity);
        if (!selectedProduct || !quantity || currentQuantity <= 0) {
            toast({ title: 'Error', description: 'Selecciona un producto y una cantidad válida.', variant: 'destructive' });
            return;
        }
        if (!isCustomerSelected) {
             toast({ title: 'Error', description: 'Debes seleccionar un cliente primero.', variant: 'destructive' });
             return;
        }

        const currentStock = selectedProduct.quantity ?? 0;
        const existingItem = saleItems.find(item => item.productId === selectedProduct.id);
        const currentQuantityInCart = existingItem?.quantity ?? 0;

        if (currentQuantityInCart + currentQuantity > currentStock) {
             toast({
                title: 'Stock Insuficiente',
                description: `Stock total: ${currentStock}. En carrito: ${currentQuantityInCart}. Intentas agregar: ${currentQuantity}.`,
                variant: 'destructive',
                duration: 5000
            });
            return;
        }

        const price = selectedProduct.sellingPrice ?? 0;
        let updatedItems;

        if (existingItem) {
            updatedItems = saleItems.map(item =>
                item.productId === selectedProduct.id
                    ? { ...item, quantity: item.quantity + currentQuantity, totalPrice: (item.quantity + currentQuantity) * price }
                    : item
            );
        } else {
            const newItem: SaleDetail = {
                productId: selectedProduct.id,
                productName: selectedProduct.name,
                quantity: currentQuantity,
                unitPrice: price,
                totalPrice: currentQuantity * price,
            };
            updatedItems = [...saleItems, newItem];
        }

        setSaleItems(updatedItems);
        setSelectedProduct(null);
        setSearchText('');
        setQuantity('');
    };

    const handleRemoveItem = (productId: string) => {
        setSaleItems(saleItems.filter(item => item.productId !== productId));
    };

    const saleTotal = useMemo(() => {
        return saleItems.reduce((total, item) => total + item.totalPrice, 0);
    }, [saleItems]);


    // --- Submit Sale ---
    const handleSubmitSale = async () => {
        if (!selectedUserId) {
            toast({ title: 'Error', description: 'Selecciona un cliente.', variant: 'destructive' });
            return;
        }
        if (saleItems.length === 0) {
            toast({ title: 'Error', description: 'Agrega al menos un producto a la venta.', variant: 'destructive' });
            return;
        }
        if (!adminUser) {
            toast({ title: 'Error', description: 'Usuario administrador no válido.', variant: 'destructive' });
            return;
        }

        setIsSubmitting(true);

        try {
            await runTransaction(db, async (transaction) => {
                const timestamp = Timestamp.now();
                const originalSaleId = isEditMode ? saleToEdit?.id : null;
                let originalSaleDetails: SaleDetail[] = [];
                let originalSaleRef: any = null;

                if (isEditMode && originalSaleId) {
                    originalSaleRef = doc(db, 'transactions', originalSaleId);
                    const originalSaleSnap = await transaction.get(originalSaleRef);
                    if (!originalSaleSnap.exists()) {
                        throw new Error("La venta original a modificar no existe.");
                    }
                    const originalSaleData = originalSaleSnap.data() as Transaction;
                    originalSaleDetails = originalSaleData.saleDetails || [];
                }

                const allProductIds = new Set([
                    ...originalSaleDetails.map(item => item.productId),
                    ...saleItems.map(item => item.productId)
                ]);
                const productRefs = Array.from(allProductIds).map(id => doc(db, 'products', id));
                const productDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));

                const productDataMap = new Map<string, { exists: boolean, data: Product | null, ref: any }>();
                productDocs.forEach((docSnap, index) => {
                    const productId = Array.from(allProductIds)[index];
                    productDataMap.set(productId, {
                        exists: docSnap.exists(),
                        data: docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Product : null,
                        ref: productRefs[index]
                    });
                });

                const stockAdjustments = new Map<string, number>();

                originalSaleDetails.forEach(item => {
                    stockAdjustments.set(item.productId, (stockAdjustments.get(item.productId) || 0) + item.quantity);
                });

                for (const item of saleItems) {
                    const currentAdjustment = stockAdjustments.get(item.productId) || 0;
                    stockAdjustments.set(item.productId, currentAdjustment - item.quantity);

                    const productInfo = productDataMap.get(item.productId);
                    if (!productInfo || !productInfo.exists) {
                        throw new Error(`Producto ${item.productName} (${item.productId}) no encontrado.`);
                    }
                    const currentQuantity = productInfo.data?.quantity ?? 0;
                    const netChange = stockAdjustments.get(item.productId)!;

                    if (currentQuantity + netChange < 0) {
                         throw new Error(`Stock insuficiente para ${item.productName}. Disponible: ${currentQuantity}, Cambio Neto Requerido: ${netChange}`);
                    }
                }

                if (isEditMode && originalSaleRef) {
                    transaction.update(originalSaleRef, {
                        isCancelled: true,
                        cancelledAt: timestamp,
                        cancelledBy: adminUser.uid,
                        cancelledByName: adminUser.displayName || adminUser.email,
                        cancellationReason: `Modificada por nueva venta ${timestamp.toMillis()}`,
                    });
                }

                const newSaleTransactionRef = doc(collection(db, 'transactions'));
                transaction.set(newSaleTransactionRef, {
                    userId: selectedUserId,
                    type: 'purchase',
                    description: `Venta #${newSaleTransactionRef.id.substring(0, 6)}${isEditMode ? ' (Modificada)' : ''}`,
                    amount: saleTotal,
                    balanceAfter: 0, // Placeholder
                    timestamp: timestamp,
                    addedBy: adminUser.uid,
                    addedByName: adminUser.displayName || adminUser.email,
                    isAdminAction: true,
                    isCancelled: false,
                    isModified: isEditMode,
                    modifiedAt: isEditMode ? timestamp : null,
                    saleDetails: saleItems,
                });

                for (const [productId, quantityChange] of stockAdjustments.entries()) {
                    if (quantityChange !== 0) {
                        const productInfo = productDataMap.get(productId);
                        if (productInfo) {
                            const currentQuantity = productInfo.data?.quantity ?? 0;
                            const newQuantity = currentQuantity + quantityChange;
                            console.log(`Product ${productId}: Current ${currentQuantity}, Change ${quantityChange}, New ${newQuantity}`);
                            transaction.update(productInfo.ref, { quantity: newQuantity });
                        } else {
                            console.warn(`Product info not found for ${productId} during stock update write.`);
                        }
                    }
                }
            });

            onSuccessCallback?.();

            toast({
                title: `¡Venta ${isEditMode ? 'Modificada' : 'Registrada'}!`,
                description: `Venta por ${formatCurrency(saleTotal)} registrada para ${users.find(u => u.id === selectedUserId)?.name}.`,
            });

            if (!isEditMode) {
                setSelectedUserId('');
                setSaleItems([]);
                setSelectedProduct(null);
                setSearchText('');
                setQuantity('');
            }

            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['transactions', selectedUserId] });
            queryClient.invalidateQueries({ queryKey: ['userBalance', selectedUserId] });
            queryClient.invalidateQueries({ queryKey: ['saleUsers'] });

            if (isEditMode && onClose) {
                 onClose();
            }

        } catch (error) {
            console.error("Error submitting sale:", error);
            toast({
                title: `Error al ${isEditMode ? 'Modificar' : 'Registrar'} Venta`,
                description: `No se pudo completar la operación. ${error instanceof Error ? error.message : String(error)}`,
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

     // --- Handler for when a new product is added via the dialog ---
     const handleProductAdded = useCallback((newProduct: Product) => {
         // Refetch products to include the new one in the list immediately
         queryClient.refetchQueries({ queryKey: ['products'] });

         // Automatically select the newly added product
         if (newProduct) {
            setSelectedProduct(newProduct);
            setSearchText(`${newProduct.name} (${newProduct.id})`);
            setQuantity(''); // Reset quantity
         }

         setBarcodeToAdd(null); // Clear the barcode to add state
     }, [queryClient]); // Dependencies


    // --- Render Logic ---
    if (error) return <p className="text-center text-destructive">Error al cargar datos: {error instanceof Error ? error.message : 'Error desconocido'}</p>;
    if (isLoading) return <div className="flex justify-center p-4"><LoadingSpinner /></div>;

    return (
        <div className="space-y-6 overflow-y-auto">
             {/* Customer Selection */}
             <div>
                <Label htmlFor="customer-select">Cliente</Label>
                <Select
                    value={selectedUserId}
                    onValueChange={setSelectedUserId}
                    disabled={isSubmitting || isEditMode || saleItems.length > 0}
                >
                    <SelectTrigger id="customer-select">
                        <SelectValue placeholder="Selecciona un cliente..." />
                    </SelectTrigger>
                    <SelectContent>
                        {users.map((user) => (
                            <SelectItem key={user.id} value={user.id} disabled={!user.isEnabled && user.id !== CONSUMIDOR_FINAL_ID}>
                                {user.name} {!user.isEnabled && user.id !== CONSUMIDOR_FINAL_ID ? '(Deshabilitado)' : ''}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {isEditMode && <p className="text-xs text-muted-foreground mt-1">Cliente no editable al modificar una venta.</p>}
                {!isEditMode && saleItems.length > 0 && <p className="text-xs text-muted-foreground mt-1">Cliente bloqueado hasta finalizar o cancelar la venta actual.</p>}
             </div>

             {/* Add Product Section */}
            <div className={cn(
                 "border p-4 rounded-md space-y-4 bg-secondary/50 transition-opacity",
                 !isCustomerSelected && "opacity-50 pointer-events-none"
                )}>
                 <h3 className="text-lg font-medium mb-2">Agregar Producto</h3>
                 {!isCustomerSelected && (
                     <div className="flex items-center text-sm text-orange-600 bg-orange-100 p-2 rounded-md border border-orange-300">
                         <AlertCircle className="h-4 w-4 mr-2 shrink-0" />
                         <span>Selecciona un cliente para agregar productos.</span>
                     </div>
                 )}

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

                 {/* Product Search / Scan & Quantity Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                     {/* Search Combobox & Scan Button (larger width on medium screens) */}
                    <div className="md:col-span-7">
                         <Label htmlFor="product-search">Buscar Producto o Escanear</Label>
                         <div className="flex items-center gap-2">
                              <Combobox
                                options={filteredProductOptions}
                                value={selectedProduct?.id ?? ''}
                                onSelect={handleProductSelect}
                                placeholder="Busca por nombre o código..."
                                searchPlaceholder="Escribe para buscar..."
                                notFoundMessage="Producto no encontrado."
                                searchText={searchText}
                                setSearchText={setSearchText}
                                disabled={isScanning || isSubmitting || !isCustomerSelected}
                                triggerId="product-search"
                              />
                             <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={toggleScan}
                                title={isScanning ? "Detener Escáner" : "Escanear Código"}
                                disabled={isSubmitting || !isBarcodeDetectorSupported || !isCustomerSelected}
                                className={cn("shrink-0", isScanning && "bg-destructive hover:bg-destructive/90 text-destructive-foreground")}
                            >
                                <ScanLine className="h-5 w-5" />
                            </Button>
                         </div>
                          {!isBarcodeDetectorSupported && (
                            <p className="text-xs text-destructive mt-1">Escáner no compatible.</p>
                        )}
                        {/* Button to add new product if not found */}
                         {searchText && !selectedProduct && filteredProductOptions.length === 0 && !isLoadingProducts && !isScanning && (
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
                     <div className="md:col-span-2">
                        <Label htmlFor="quantity">Cantidad</Label>
                        <Input
                            id="quantity"
                            type="number"
                            min="1"
                            step="1"
                            placeholder="Cant."
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value === '' ? '' : parseInt(e.target.value, 10) || '')}
                            className="w-full text-center"
                            disabled={!selectedProduct || isSubmitting || !isCustomerSelected}
                        />
                    </div>

                     {/* Add Item Button */}
                     <div className="md:col-span-3">
                         <Button
                            type="button"
                            onClick={handleAddItem}
                            disabled={!selectedProduct || !quantity || quantity <= 0 || isSubmitting || !isCustomerSelected}
                            className="w-full"
                         >
                            <PlusCircle className="mr-2 h-4 w-4" /> Agregar
                        </Button>
                     </div>
                 </div>
                 {selectedProduct && (
                    <p className="text-xs text-muted-foreground mt-2">
                        Seleccionado: {selectedProduct.name} - Precio: {formatCurrency(selectedProduct.sellingPrice ?? 0)} - Stock: {selectedProduct.quantity ?? 0}
                    </p>
                )}

            </div>

             {/* Sale Items List */}
             {saleItems.length > 0 && (
                <div className="border rounded-md overflow-x-auto"> {/* Added overflow-x-auto */}
                    <Table className="min-w-full"> {/* Added min-w-full */}
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-[150px]">Producto</TableHead> {/* Added min-width */}
                                <TableHead className="text-center min-w-[80px]">Cantidad</TableHead> {/* Added min-width */}
                                <TableHead className="text-right min-w-[100px]">Precio Unit.</TableHead> {/* Added min-width */}
                                <TableHead className="text-right min-w-[110px]">Total</TableHead> {/* Added min-width */}
                                <TableHead className="text-center">Quitar</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {saleItems.map((item) => (
                                <TableRow key={item.productId}>
                                    <TableCell className="font-medium whitespace-nowrap">{item.productName}</TableCell> {/* Added whitespace-nowrap */}
                                    <TableCell className="text-center">{item.quantity}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                                    <TableCell className="text-right font-semibold">{formatCurrency(item.totalPrice)}</TableCell>
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
             {saleItems.length > 0 && (
                <div className="flex flex-col items-end space-y-4 mt-4 sticky bottom-0 bg-background py-4 px-6 border-t">
                    <p className="text-xl font-bold">Total Venta: {formatCurrency(saleTotal)}</p>
                    <div className='flex gap-2 flex-wrap justify-end'> {/* Added flex-wrap */}
                         {!isEditMode && (
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setSaleItems([]);
                                    setSelectedUserId('');
                                }}
                                disabled={isSubmitting}
                            >
                                Cancelar Venta Actual
                            </Button>
                         )}
                          {isEditMode && onClose && (
                            <Button
                                variant="outline"
                                onClick={onClose}
                                disabled={isSubmitting}
                            >
                                Cancelar Modificación
                            </Button>
                          )}
                        <Button
                            onClick={handleSubmitSale}
                            disabled={isSubmitting || saleItems.length === 0 || !selectedUserId}
                            size="lg"
                        >
                            {isSubmitting
                                ? <LoadingSpinner className="mr-2" />
                                : (isEditMode ? <><Pencil className="mr-2 h-4 w-4" /> Guardar Cambios</> : 'Confirmar Venta')
                            }
                        </Button>
                    </div>
                </div>
             )}

             {/* Add Product Dialog - Triggered when barcode not found or button clicked */}
              <AddEditProductDialog
                isOpen={isAddProductDialogOpen}
                onClose={() => {
                    setIsAddProductDialogOpen(false);
                    setBarcodeToAdd(null); // Clear barcode when closing
                }}
                product={barcodeToAdd ? { id: barcodeToAdd } : null} // Pass barcode if scanned, otherwise null
                onSuccessCallback={handleProductAdded}
                isMinimalAdd={true} // Always use minimal add when triggered from here
            />
        </div>
    );
};

export default SaleForm;
