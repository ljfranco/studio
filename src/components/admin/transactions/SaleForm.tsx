
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
import { PlusCircle, ScanLine, Trash2, Camera, Ban, Pencil } from 'lucide-react'; // Added Pencil
import type { User as AuthUser } from 'firebase/auth';
import type { Product } from '@/types/product';
import type { UserData } from '@/types/user'; // Define or import UserData type
import type { Transaction, SaleDetail } from '@/types/transaction';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
// Removed direct import of UserDetailView's recalculateBalance

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

     users.unshift({ id: CONSUMIDOR_FINAL_ID, name: CONSUMIDOR_FINAL_NAME, email: '', balance: 0, isEnabled: true, role: 'user' });

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
    const [quantity, setQuantity] = useState<number>(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [searchText, setSearchText] = useState(''); // For product search

    const isEditMode = !!saleToEdit;

    // --- Initialize form state for editing ---
    useEffect(() => {
        if (isEditMode && saleToEdit) {
            console.log("Populating form for editing sale:", saleToEdit.id);
            setSelectedUserId(saleToEdit.userId);
            setSaleItems(saleToEdit.saleDetails || []); // Pre-fill items
            // Do not reset product selection or quantity here, user might want to add more
        } else {
            // Reset for new sale mode
             setSelectedUserId('');
             setSaleItems([]);
             setSelectedProduct(null);
             setSearchText('');
             setQuantity(1);
        }
    }, [isEditMode, saleToEdit]); // Depend on edit mode and the sale data

    // --- Data Fetching ---
    const { data: users = [], isLoading: isLoadingUsers, error: errorUsers } = useQuery<UserData[]>({
        queryKey: ['saleUsers'], // Distinct query key
        queryFn: () => fetchUsers(db),
        staleTime: 1000 * 60 * 5, // Cache users for 5 minutes
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
        setSearchText(product ? `${product.name} (${product.id})` : ''); // Update search text display
     };


     // --- Barcode Scanning (adapted from AddEditProductDialog) ---
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
                  if (product) {
                      setSelectedProduct(product);
                       setSearchText(`${product.name} (${product.id})`); // Update search text
                      toast({ title: "Código Detectado", description: `${product.name}` });
                      setIsScanning(false); // Stop scanning after successful detection
                  } else {
                      toast({ title: "Código no encontrado", description: scannedId, variant: "destructive" });
                      // Keep scanning
                      animationFrameId = requestAnimationFrame(detectBarcode);
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
       }, [isScanning, hasCameraPermission, products, toast, isBarcodeDetectorSupported]);

       const toggleScan = () => {
         if (!isBarcodeDetectorSupported) {
             toast({ title: "No Soportado", description: "El escáner no es compatible.", variant: "destructive" });
             return;
         }
         setIsScanning(prev => !prev);
         if (isScanning) setSelectedProduct(null); // Clear selection when stopping scan
       };


    // --- Sale Item Management ---
    const handleAddItem = () => {
        if (!selectedProduct || quantity <= 0) {
            toast({ title: 'Error', description: 'Selecciona un producto y una cantidad válida.', variant: 'destructive' });
            return;
        }

        const currentStock = selectedProduct.quantity ?? 0;
        const existingItem = saleItems.find(item => item.productId === selectedProduct.id);
        const currentQuantityInCart = existingItem?.quantity ?? 0;

        if (currentQuantityInCart + quantity > currentStock) {
             toast({
                title: 'Stock Insuficiente',
                description: `Stock total: ${currentStock}. En carrito: ${currentQuantityInCart}. Intentas agregar: ${quantity}.`,
                variant: 'destructive',
                duration: 5000 // Longer duration for stock errors
            });
            return;
        }

        const price = selectedProduct.sellingPrice ?? 0;
        let updatedItems;

        if (existingItem) {
            updatedItems = saleItems.map(item =>
                item.productId === selectedProduct.id
                    ? { ...item, quantity: item.quantity + quantity, totalPrice: (item.quantity + quantity) * price }
                    : item
            );
        } else {
            const newItem: SaleDetail = {
                productId: selectedProduct.id,
                productName: selectedProduct.name,
                quantity: quantity,
                unitPrice: price,
                totalPrice: quantity * price,
            };
            updatedItems = [...saleItems, newItem];
        }

        setSaleItems(updatedItems);
        // Reset inputs
        setSelectedProduct(null);
        setSearchText(''); // Clear search text
        setQuantity(1);
    };

    const handleRemoveItem = (productId: string) => {
        setSaleItems(saleItems.filter(item => item.productId !== productId));
    };

    const saleTotal = useMemo(() => {
        return saleItems.reduce((total, item) => total + item.totalPrice, 0);
    }, [saleItems]);


    // --- Submit Sale (Handles both Add and Edit) ---
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

                // --- Step 1: Handle Original Sale (if editing) ---
                let originalSaleDetails: SaleDetail[] = [];
                if (isEditMode && originalSaleId) {
                    const originalSaleRef = doc(db, 'transactions', originalSaleId);
                    const originalSaleSnap = await transaction.get(originalSaleRef);
                    if (!originalSaleSnap.exists()) {
                        throw new Error("La venta original a modificar no existe.");
                    }
                    const originalSaleData = originalSaleSnap.data() as Transaction;
                    originalSaleDetails = originalSaleData.saleDetails || [];

                    // Mark original sale as cancelled/modified
                    transaction.update(originalSaleRef, {
                        isCancelled: true, // Mark as cancelled
                        cancelledAt: timestamp,
                        cancelledBy: adminUser.uid,
                        cancelledByName: adminUser.displayName || adminUser.email,
                        cancellationReason: `Modificada por nueva venta ${timestamp.toMillis()}`, // Indicate modification
                        // Optionally add modification fields if needed for audit
                        // isModified: true,
                        // modifiedAt: timestamp,
                        // modifiedBy: adminUser.uid,
                    });
                }

                // --- Step 2: Read Product Stock (Combined Needs) ---
                // Get unique product IDs from both original sale (for restoring) and new sale (for deducting)
                const allProductIds = new Set([
                    ...originalSaleDetails.map(item => item.productId),
                    ...saleItems.map(item => item.productId)
                ]);
                const productRefs = Array.from(allProductIds).map(id => doc(db, 'products', id));
                const productDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));

                const productDataMap = new Map<string, { exists: boolean, data: Product | null }>();
                productDocs.forEach((docSnap, index) => {
                    const productId = Array.from(allProductIds)[index];
                    productDataMap.set(productId, {
                        exists: docSnap.exists(),
                        data: docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Product : null
                    });
                });

                // --- Step 3: Calculate Final Stock Adjustments ---
                const stockAdjustments = new Map<string, number>(); // productId -> quantity change (+ve for restore, -ve for deduct)

                // Restore stock from original sale (if editing)
                originalSaleDetails.forEach(item => {
                    stockAdjustments.set(item.productId, (stockAdjustments.get(item.productId) || 0) + item.quantity);
                });

                // Deduct stock for the new/updated sale
                for (const item of saleItems) {
                    const currentAdjustment = stockAdjustments.get(item.productId) || 0;
                    stockAdjustments.set(item.productId, currentAdjustment - item.quantity);

                    // Validate stock *after* calculating net change
                    const productInfo = productDataMap.get(item.productId);
                    if (!productInfo || !productInfo.exists) {
                        throw new Error(`Producto ${item.productName} (${item.productId}) no encontrado.`);
                    }
                    const currentQuantity = productInfo.data?.quantity ?? 0;
                    const netChange = stockAdjustments.get(item.productId)!; // Should exist at this point

                    if (currentQuantity + netChange < 0) {
                         throw new Error(`Stock insuficiente para ${item.productName}. Disponible: ${currentQuantity}, Cambio Neto Requerido: ${netChange}`);
                    }
                }

                // --- Step 4: Create the New Sale Transaction ---
                const newSaleTransactionRef = doc(collection(db, 'transactions'));
                transaction.set(newSaleTransactionRef, {
                    userId: selectedUserId,
                    type: 'purchase', // Sale is a purchase for customer
                    description: `Venta #${newSaleTransactionRef.id.substring(0, 6)}${isEditMode ? ' (Modificada)' : ''}`,
                    amount: saleTotal,
                    balanceAfter: 0, // Placeholder
                    timestamp: timestamp,
                    addedBy: adminUser.uid,
                    addedByName: adminUser.displayName || adminUser.email,
                    isAdminAction: true,
                    isCancelled: false,
                    isModified: isEditMode, // Mark as modified if editing
                    modifiedAt: isEditMode ? timestamp : null, // Timestamp modification
                    saleDetails: saleItems,
                    // If editing, link to original? Maybe not necessary if cancelling old one
                    // originalSaleId: originalSaleId,
                });

                // --- Step 5: Apply Stock Updates ---
                for (const [productId, quantityChange] of stockAdjustments.entries()) {
                    if (quantityChange !== 0) {
                        const productRef = doc(db, 'products', productId);
                        const productInfo = productDataMap.get(productId);
                        const currentQuantity = productInfo?.data?.quantity ?? 0;
                        const newQuantity = currentQuantity + quantityChange;
                        console.log(`Product ${productId}: Current ${currentQuantity}, Change ${quantityChange}, New ${newQuantity}`);
                        transaction.update(productRef, { quantity: newQuantity });
                    }
                }

                // User balance update is handled by recalculateBalance called after transaction
            });

            // Call success callback (e.g., for recalculation) *after* the transaction commits
            onSuccessCallback?.(); // Trigger recalculation

            toast({
                title: `¡Venta ${isEditMode ? 'Modificada' : 'Registrada'}!`,
                description: `Venta por ${formatCurrency(saleTotal)} registrada para ${users.find(u => u.id === selectedUserId)?.name}.`,
            });

            // Reset form state only if NOT editing, or if explicitly closed
            if (!isEditMode) {
                setSelectedUserId('');
                setSaleItems([]);
                setSelectedProduct(null);
                setSearchText('');
                setQuantity(1);
            }

            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['transactions', selectedUserId] });
            queryClient.invalidateQueries({ queryKey: ['userBalance', selectedUserId] });
            queryClient.invalidateQueries({ queryKey: ['saleUsers'] });

            if (isEditMode && onClose) {
                 onClose(); // Close the modal/dialog after successful edit
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


    // --- Render Logic ---
    if (error) return <p className="text-center text-destructive">Error al cargar datos: {error instanceof Error ? error.message : 'Error desconocido'}</p>; // Check if error is Error instance
    if (isLoading) return <div className="flex justify-center p-4"><LoadingSpinner /></div>;

    return (
        // Wrap the form content in a div that can scroll if needed
        <div className="space-y-6 overflow-y-auto">
             {/* Customer Selection */}
             <div>
                <Label htmlFor="customer-select">Cliente</Label>
                <Select
                    value={selectedUserId}
                    onValueChange={setSelectedUserId}
                    disabled={isSubmitting || isEditMode || saleItems.length > 0} // Disable if editing or items added
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
            <div className="border p-4 rounded-md space-y-4 bg-secondary/50">
                 <h3 className="text-lg font-medium mb-2">Agregar Producto</h3>

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
                    <div className="flex-grow">
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
                    </div>

                     {/* Quantity Input */}
                    <div className="w-full sm:w-auto">
                        <Label htmlFor="quantity">Cantidad</Label>
                        <Input
                            id="quantity"
                            type="number"
                            min="1"
                            step="1"
                            value={quantity}
                            onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                            className="w-full sm:w-20 text-center"
                            disabled={!selectedProduct || isSubmitting}
                        />
                    </div>

                     {/* Add Item Button */}
                     <Button
                        type="button"
                        onClick={handleAddItem}
                        disabled={!selectedProduct || quantity <= 0 || isSubmitting}
                        className="w-full sm:w-auto"
                     >
                        <PlusCircle className="mr-2 h-4 w-4" /> Agregar
                    </Button>
                 </div>
                 {selectedProduct && (
                    <p className="text-xs text-muted-foreground">
                        Seleccionado: {selectedProduct.name} - Precio: {formatCurrency(selectedProduct.sellingPrice ?? 0)} - Stock: {selectedProduct.quantity ?? 0}
                    </p>
                )}

            </div>

             {/* Sale Items List */}
             {saleItems.length > 0 && (
                <div className="border rounded-md overflow-x-auto"> {/* Make table scrollable horizontally if needed */}
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Producto</TableHead>
                                <TableHead className="text-center">Cantidad</TableHead>
                                <TableHead className="text-right">Precio Unit.</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead className="text-center">Quitar</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {saleItems.map((item) => (
                                <TableRow key={item.productId}>
                                    <TableCell className="font-medium">{item.productName}</TableCell>
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

             {/* Total and Submit - Keep this outside the scrollable area for visibility */}
             {saleItems.length > 0 && (
                <div className="flex flex-col items-end space-y-4 mt-4 sticky bottom-0 bg-background py-4 px-6 border-t"> {/* Make footer sticky */}
                    <p className="text-xl font-bold">Total Venta: {formatCurrency(saleTotal)}</p>
                    <div className='flex gap-2'>
                        {/* Only show Cancel Sale button in "new sale" mode */}
                         {!isEditMode && (
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setSaleItems([]); // Clear sale items
                                    setSelectedUserId(''); // Reset customer selection
                                }}
                                disabled={isSubmitting}
                            >
                                Cancelar Venta Actual
                            </Button>
                         )}
                          {/* Close button for edit mode */}
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
        </div>
    );
};

export default SaleForm;

