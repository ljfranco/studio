
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useFirebase } from '@/context/FirebaseContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, doc, writeBatch, serverTimestamp, getDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Combobox } from '@/components/ui/combobox';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, cn } from '@/lib/utils';
import { PlusCircle, ScanLine, Trash2, Truck } from 'lucide-react';
import type { Product } from '@/types/product';
import AddEditProductDialog from '../inventory/AddEditProductDialog';
import FullScreenScanner from '@/components/scanner/FullScreenScanner';

interface PurchaseItem {
    productId: string;
    productName: string;
    quantity: number;
    purchasePrice: number;
    totalCost: number;
}

const fetchProducts = async (db: any): Promise<Product[]> => {
    const productsCol = collection(db, 'products');
    const snapshot = await getDocs(productsCol);
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Product));
};

const PurchaseForm: React.FC = () => {
    const { db } = useFirebase();
    const { user: adminUser } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [quantity, setQuantity] = useState<number | ''>('');
    const [purchasePrice, setPurchasePrice] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [isAddProductDialogOpen, setIsAddProductDialogOpen] = useState(false);
    const [barcodeToAdd, setBarcodeToAdd] = useState<string | null>(null);

    const { data: products = [], isLoading: isLoadingProducts, error: errorProducts } = useQuery<Product[]>({
        queryKey: ['products'],
        queryFn: () => fetchProducts(db),
    });

    const isLoading = isLoadingProducts;
    const error = errorProducts;

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
        setPurchasePrice(product?.lastPurchasePrice?.toString() ?? '');
        setQuantity('');
    };

    const isBarcodeDetectorSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

    const handleScanSuccess = (scannedId: string) => {
        console.log("Barcode detected:", scannedId);
        const product = products.find(p => p.id === scannedId);
        setIsScannerOpen(false);

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
    };

    const toggleScan = () => {
        if (!isBarcodeDetectorSupported) {
            toast({ title: "No Soportado", description: "El escáner no es compatible.", variant: "destructive" });
            return;
        }
        setIsScannerOpen(prev => !prev);
    };

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

    if (error) return <p className="text-center text-destructive">Error al cargar datos: {error instanceof Error ? error.message : 'Error desconocido'}</p>;
    if (isLoading) return <div className="flex justify-center p-4"><LoadingSpinner /></div>;

    return (
        <div className="space-y-6">
            {isScannerOpen && (
                <FullScreenScanner
                    onScanSuccess={handleScanSuccess}
                    onClose={() => setIsScannerOpen(false)}
                />
            )}
            <div className="border p-4 rounded-md space-y-4 bg-secondary/50">
                <h3 className="text-lg font-medium mb-2">Agregar Producto Comprado</h3>
                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-end">
                        <div className="md:col-span-12">
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
                                    disabled={isSubmitting}
                                    triggerId="product-search"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={toggleScan}
                                    title="Escanear Código"
                                    disabled={isSubmitting || !isBarcodeDetectorSupported}
                                    className="shrink-0"
                                >
                                    <ScanLine className="h-5 w-5" />
                                </Button>
                            </div>
                            {!isBarcodeDetectorSupported && (
                                <p className="text-xs text-destructive mt-1">Escáner no compatible.</p>
                            )}
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
                    </div>

                    <div className="grid grid-cols-12 gap-4 items-end">
                        <div className="col-span-6 sm:col-span-4">
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
                                disabled={!selectedProduct || isSubmitting}
                            />
                        </div>
                        <div className="col-span-6 sm:col-span-4">
                            <Label htmlFor="purchasePrice">Precio Costo</Label>
                            <Input
                                id="purchasePrice"
                                type="text"
                                inputMode="decimal"
                                placeholder="0.00"
                                value={purchasePrice}
                                onChange={(e) => setPurchasePrice(e.target.value)}
                                className="w-full text-right"
                                disabled={!selectedProduct || isSubmitting}
                            />
                        </div>

                        <div className="col-span-12 sm:col-span-4">
                            <Button
                                type="button"
                                onClick={handleAddItem}
                                disabled={!selectedProduct || !quantity || quantity <= 0 || !purchasePrice || isSubmitting}
                                className="w-full"
                            >
                                <PlusCircle className="mr-2 h-4 w-4" /> Agregar
                            </Button>
                        </div>
                    </div>
                </div>
                {selectedProduct && (
                    <p className="text-xs text-muted-foreground mt-2">
                        Seleccionado: {selectedProduct.name} - Stock Actual: {selectedProduct.quantity ?? 0} - Ult. Compra: {formatCurrency(selectedProduct.lastPurchasePrice ?? 0)}
                    </p>
                )}
            </div>

            {purchaseItems.length > 0 && (
                <div className="border rounded-md overflow-x-auto">
                    <Table className="min-w-full">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-[150px]">Producto</TableHead>
                                <TableHead className="text-center min-w-[80px]">Cantidad</TableHead>
                                <TableHead className="text-right min-w-[100px]">Precio Costo</TableHead>
                                <TableHead className="text-right min-w-[110px]">Total</TableHead>
                                <TableHead className="text-center">Quitar</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {purchaseItems.map((item) => (
                                <TableRow key={item.productId}>
                                    <TableCell className="font-medium whitespace-nowrap">{item.productName}</TableCell>
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

            {purchaseItems.length > 0 && (
                <div className="flex flex-col items-end space-y-4 mt-4 sticky bottom-0 bg-background py-4 px-6 border-t">
                    <p className="text-xl font-bold">Total Ingreso: {formatCurrency(purchaseTotal)}</p>
                    <div className='flex gap-2 flex-wrap justify-end'>
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

            <AddEditProductDialog
                isOpen={isAddProductDialogOpen}
                onClose={() => {
                    setIsAddProductDialogOpen(false);
                    setBarcodeToAdd(null);
                }}
                product={barcodeToAdd ? { id: barcodeToAdd } : null}
                onSuccessCallback={handleProductAdded}
                isMinimalAdd={true}
            />
        </div>
    );
};

export default PurchaseForm;
