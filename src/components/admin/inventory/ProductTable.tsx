
'use client';

import React, { useState, useMemo } from 'react';
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
import { PlusCircle, Pencil, Trash2, Search, ScanLine } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import AddEditProductDialog from './AddEditProductDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import type { Product } from '@/types/product';
import FullScreenScanner from '@/components/scanner/FullScreenScanner';
import { useIsMobile } from '@/hooks/use-mobile'; // Import useIsMobile

const fetchProducts = async (db: any): Promise<Product[]> => {
  const productsCol = collection(db, 'products');
  const snapshot = await getDocs(productsCol);
  return snapshot.docs
    .map(doc => ({ ...doc.data(), id: doc.id } as Product))
    .sort((a, b) => a.name.localeCompare(b.name));
};

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
  const [searchTerm, setSearchTerm] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const { data: products = [], isLoading, error } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => fetchProducts(db),
  });

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

  const deleteMutation = useMutation({
    mutationFn: (productId: string) => deleteProduct(db, productId),
    onSuccess: () => {
      toast({ title: 'Éxito', description: 'Producto eliminado correctamente.' });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setIsDeleteDialogOpen(false);
      setProductToDelete(null);
    },
    onError: (err) => {
      console.error("Error deleting product:", err);
      toast({ title: 'Error', description: `No se pudo eliminar el producto. ${err instanceof Error ? err.message : ''}`, variant: 'destructive' });
      setIsDeleteDialogOpen(false);
      setProductToDelete(null);
    },
  });

  const isBarcodeDetectorSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window;
  const isMobile = useIsMobile();

  const handleScanSuccess = (scannedId: string) => {
    console.log("Barcode detected:", scannedId);
    setSearchTerm(scannedId);
    setIsScannerOpen(false);
    toast({ title: "Código Detectado", description: scannedId });
  };

  const renderProductCard = (product: Product) => (
    <Card key={product.id} className="mb-4 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg">{product.name}</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">Código: {product.id}</CardDescription>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-primary">{formatCurrency(product.sellingPrice ?? 0)}</p>
            <p className="text-xs text-muted-foreground">Últ. Compra: {formatCurrency(product.lastPurchasePrice ?? 0)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2 flex justify-between items-center">
        <div>
          <p className="text-sm">Stock: <span className="font-semibold">{product.quantity ?? 0}</span></p>
          <p className="text-xs text-muted-foreground">Mínimo: {product.minStock ?? 0}</p>
        </div>
        <div className="flex items-center space-x-1">
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
        </div>
      </CardContent>
    </Card>
  );

  const toggleScan = () => {
    if (!isBarcodeDetectorSupported) {
      toast({ title: "No Soportado", description: "El escáner no es compatible.", variant: "destructive" });
      return;
    }
    setIsScannerOpen(prev => !prev);
  };

  const handleAddProduct = () => {
    setSelectedProduct(null);
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return <p className="text-center text-destructive">Error al cargar productos: {errorMessage}</p>;
  }

  return (
    <Card>
      {isScannerOpen && (
        <FullScreenScanner
          onScanSuccess={handleScanSuccess}
          onClose={() => setIsScannerOpen(false)}
        />
      )}
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
        <div className="mb-4 flex gap-2 items-center flex">
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
            title="Escanear Código"
            disabled={!isBarcodeDetectorSupported}
            className="shrink-0"
          >
            <ScanLine className="h-5 w-5" />
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-40"><LoadingSpinner /></div>
        ) : filteredProducts.length === 0 ? (
          <p className="text-center text-muted-foreground">
            {searchTerm ? 'No se encontraron productos.' : 'No hay productos en el inventario.'}
          </p>
        ) : (
          isMobile ? (
            <div className="space-y-4">
              {filteredProducts.map(renderProductCard)}
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-md">
              <Table className="min-w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">Código Barras</TableHead>
                    <TableHead className="min-w-[150px]">Nombre</TableHead>
                    <TableHead className="text-right min-w-[80px]">Cantidad</TableHead>
                    <TableHead className="text-right min-w-[120px]">Stock Min.</TableHead>
                    <TableHead className="text-right min-w-[120px]">Últ. P. Compra</TableHead>
                    <TableHead className="text-right min-w-[120px]">Precio Venta</TableHead>
                    <TableHead className="text-center min-w-[100px]">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-mono text-xs whitespace-nowrap">{product.id}</TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{product.name}</TableCell>
                      <TableCell className="text-right">{product.quantity ?? 0}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {product.minStock ?? 0}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
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
          )
        )}
      </CardContent>

      <AddEditProductDialog
        isOpen={isAddEditDialogOpen}
        onClose={() => setIsAddEditDialogOpen(false)}
        product={selectedProduct}
      />

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
