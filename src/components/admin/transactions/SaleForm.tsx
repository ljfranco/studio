
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { PlusCircle, ScanLine, Trash2, Camera, Ban } from 'lucide-react';
import type { User as AuthUser } from 'firebase/auth';
import type { Product } from '@/types/product';
import type { UserData } from '@/types/user'; // Define or import UserData type
import type { Transaction, SaleDetail } from '@/types/transaction';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import UserDetailView from '../UserDetailView'; // Need recalculateBalance from here temporarily


// Special ID for the generic customer
const CONSUMIDOR_FINAL_ID = '__CONSUMIDOR_FINAL__';
const CONSUMIDOR_FINAL_NAME = 'Consumidor Final';


// --- Fetching Functions ---
const fetchUsers = async (db: any): Promise<UserData[]> => {
    const usersCol = collection(db, 'users');
    // Filter out the generic customer if it exists as a document, and admins
    const q = query(usersCol, where('role', '!=', 'admin'), orderBy('name'));
    const snapshot = await getDocs(q);
    const users = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as UserData))
        .filter(user => user.id !== CONSUMIDOR_FINAL_ID); // Ensure generic user doc isn't listed if it exists

     // Add the generic customer option manually
     users.unshift({ id: CONSUMIDOR_FINAL_ID, name: CONSUMIDOR_FINAL_NAME, email: '', balance: 0, isEnabled: true, role: 'user' });

     // Ensure the generic user document exists (run once or check on load)
     const genericUserDocRef = doc(db, 'users', CONSUMIDOR_FINAL_ID);
     const genericDocSnap = await getDoc(genericUserDocRef);
     if (!genericDocSnap.exists()) {
        try {
            await setDoc(genericUserDocRef, {
                 name: CONSUMIDOR_FINAL_NAME,
                 role: 'user', // Special role or just user? Let's use user for now.
                 balance: 0,
                 isEnabled: true,
                 createdAt: Timestamp.now(),
                 isGeneric: true, // Add a flag to identify easily
            });
            console.log("Created generic consumer document.");
        } catch (error) {
             console.error("Failed to create generic consumer document:", error);
             // Handle error appropriately, maybe prevent sale form loading
        }
     }


    return users;
};

const fetchProducts = async (db: any): Promise<Product[]> => {
    const productsCol = collection(db, 'products');
    const snapshot = await getDocs(productsCol);
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Product));
};

// --- Component ---
const SaleForm: React.FC = () => {
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
                      setIsScanning(false);
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
        if (quantity > selectedProduct.quantity) {
            toast({ title: 'Stock Insuficiente', description: `Solo quedan ${selectedProduct.quantity} unidades de ${selectedProduct.name}.`, variant: 'destructive' });
            return;
        }

        // Check if item already exists
        const existingItemIndex = saleItems.findIndex(item => item.productId === selectedProduct.id);
        const price = selectedProduct.sellingPrice ?? 0;

        if (existingItemIndex > -1) {
             // Update quantity and total if item exists
             const updatedItems = [...saleItems];
             const newQuantity = updatedItems[existingItemIndex].quantity + quantity;
              if (newQuantity > selectedProduct.quantity) {
                  toast({ title: 'Stock Insuficiente', description: `No puedes agregar ${quantity} más. Stock total ${selectedProduct.quantity}, ya en lista ${updatedItems[existingItemIndex].quantity}.`, variant: 'destructive' });
                  return;
              }
             updatedItems[existingItemIndex] = {
                 ...updatedItems[existingItemIndex],
                 quantity: newQuantity,
                 totalPrice: newQuantity * price,
             };
             setSaleItems(updatedItems);
        } else {
             // Add new item
            const newItem: SaleDetail = {
                productId: selectedProduct.id,
                productName: selectedProduct.name,
                quantity: quantity,
                unitPrice: price,
                totalPrice: quantity * price,
            };
            setSaleItems([...saleItems, newItem]);
        }


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

    // --- Recalculate Balance (Temporary import/use) ---
    // TODO: Move recalculateBalance to a shared service/hook
     const recalculateBalance = useCallback(async (userId: string, showToast: boolean = true) => {
         if (!userId || !db || !adminUser) return;
         console.log(`Recalculating balance for user: ${userId}`);
         try {
             const transactionsColRef = collection(db, 'transactions');
             const q = query(transactionsColRef, where('userId', '==', userId), orderBy('timestamp', 'asc'));
             const querySnapshot = await getDocs(q);
             let currentBalance = 0;
             const batch = writeBatch(db);
             querySnapshot.forEach((docSnap) => {
                 const transaction = { id: docSnap.id, ...docSnap.data() } as Transaction;
                 let transactionAmount = 0;
                 if (!transaction.isCancelled) {
                     transactionAmount = transaction.type === 'purchase' ? -transaction.amount : transaction.amount;
                 }
                 currentBalance += transactionAmount;
                 if (transaction.balanceAfter !== currentBalance) {
                    batch.update(docSnap.ref, { balanceAfter: currentBalance });
                 }
             });
             const userDocRef = doc(db, 'users', userId);
             batch.update(userDocRef, { balance: currentBalance });
             await batch.commit();
             if (showToast) toast({ title: "Éxito", description: "Saldo recalculado." });
             console.log("Recalculation complete.");
         } catch (error) {
             console.error("Error recalculating balance:", error);
             if (showToast) toast({ title: "Error", description: `No se pudo recalcular el saldo. ${error instanceof Error ? error.message : String(error)}`, variant: "destructive" });
         }
     }, [db, adminUser, toast]);

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
                const saleTransactionRef = doc(collection(db, 'transactions')); // New transaction for the sale
                const timestamp = Timestamp.now();

                 // 1. Create the main sale transaction document
                 transaction.set(saleTransactionRef, {
                    userId: selectedUserId,
                    type: 'purchase', // A sale is a 'purchase' for the customer's account
                    description: `Venta #${saleTransactionRef.id.substring(0, 6)}`, // Auto-generated description
                    amount: saleTotal, // Total amount of the sale
                    balanceAfter: 0, // Placeholder, recalculate will fix this
                    timestamp: timestamp,
                    addedBy: adminUser.uid,
                    addedByName: adminUser.displayName || adminUser.email,
                    isAdminAction: true,
                    isCancelled: false,
                    isModified: false,
                    saleDetails: saleItems, // Embed sale details
                });

                 // 2. Update product quantities (decrement stock)
                 for (const item of saleItems) {
                    const productRef = doc(db, 'products', item.productId);
                    const productDoc = await transaction.get(productRef);
                    if (!productDoc.exists()) {
                        throw new Error(`Producto ${item.productName} (${item.productId}) no encontrado.`);
                    }
                    const currentQuantity = productDoc.data()?.quantity ?? 0;
                    const newQuantity = currentQuantity - item.quantity;
                    if (newQuantity < 0) {
                         // This should be caught earlier, but double-check here
                        throw new Error(`Stock insuficiente para ${item.productName}. Disponible: ${currentQuantity}, Venta: ${item.quantity}`);
                    }
                    transaction.update(productRef, { quantity: newQuantity });
                 }

                 // 3. User balance update is handled by recalculateBalance called after transaction
             });

             // Recalculate balance for the affected user *after* the transaction commits
             await recalculateBalance(selectedUserId, false); // Recalculate silently

             toast({
                title: '¡Venta Registrada!',
                description: `Venta por ${formatCurrency(saleTotal)} registrada para ${users.find(u => u.id === selectedUserId)?.name}.`,
            });

             // Reset form state
             setSelectedUserId('');
             setSaleItems([]);
             setSelectedProduct(null);
             setSearchText('');
             setQuantity(1);
             queryClient.invalidateQueries({ queryKey: ['products'] }); // Invalidate products to update stock display
             queryClient.invalidateQueries({ queryKey: ['transactions', selectedUserId] }); // Invalidate transactions for the user
             queryClient.invalidateQueries({ queryKey: ['userBalance', selectedUserId] }); // Invalidate user balance if cached separately

        } catch (error) {
            console.error("Error submitting sale:", error);
            toast({
                title: 'Error al Registrar Venta',
                description: `No se pudo completar la venta. ${error instanceof Error ? error.message : String(error)}`,
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    };


    // --- Render Logic ---
    if (error) return <p className="text-center text-destructive">Error al cargar datos: {error.message}</p>;
    if (isLoading) return <div className="flex justify-center p-4"><LoadingSpinner /></div>;

    return (
        <div className="space-y-6">
             {/* Customer Selection */}
             <div>
                <Label htmlFor="customer-select">Cliente</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={isSubmitting || saleItems.length > 0}>
                    <SelectTrigger id="customer-select">
                        <SelectValue placeholder="Selecciona un cliente..." />
                    </SelectTrigger>
                    <SelectContent>
                        {users.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                                {user.name} {user.id !== CONSUMIDOR_FINAL_ID && user.email ? `(${user.email})` : ''}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {saleItems.length > 0 && <p className="text-xs text-muted-foreground mt-1">Cliente bloqueado hasta finalizar o cancelar la venta actual.</p>}
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
                <div className="border rounded-md">
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

             {/* Total and Submit */}
             {saleItems.length > 0 && (
                <div className="flex flex-col items-end space-y-4 mt-4">
                    <p className="text-xl font-bold">Total Venta: {formatCurrency(saleTotal)}</p>
                    <div className='flex gap-2'>
                         <Button
                            variant="outline"
                            onClick={() => setSaleItems([])} // Clear sale items
                            disabled={isSubmitting}
                         >
                             Cancelar Venta Actual
                         </Button>
                        <Button
                            onClick={handleSubmitSale}
                            disabled={isSubmitting || saleItems.length === 0 || !selectedUserId}
                            size="lg"
                        >
                            {isSubmitting ? <LoadingSpinner className="mr-2" /> : 'Confirmar Venta'}
                        </Button>
                    </div>
                </div>
             )}
        </div>
    );
};

export default SaleForm;
