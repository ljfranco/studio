
'use client';

import React, { useState } from 'react';
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
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PlusCircle, Pencil, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import AddEditProductDialog from './AddEditProductDialog'; // Import the dialog
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"; // For delete confirmation
import { useToast } from '@/hooks/use-toast';
import type { Product } from '@/types/product';

// Fetch products function
const fetchProducts = async (db: any): Promise<Product[]> => {
  const productsCol = collection(db, 'products');
  const snapshot = await getDocs(productsCol);
  // Use barcode (doc.id) as the product ID
  return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Product));
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


  // Fetch products using React Query
  const { data: products = [], isLoading, error } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => fetchProducts(db),
  });

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
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Inventario de Productos</CardTitle>
          <CardDescription>Lista de productos en stock.</CardDescription>
        </div>
        <Button onClick={handleAddProduct}>
          <PlusCircle className="mr-2 h-4 w-4" /> Agregar Producto
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center h-40"><LoadingSpinner /></div>
        ) : products.length === 0 ? (
          <p className="text-center text-muted-foreground">No hay productos en el inventario.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código Barras</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Últ. P. Compra</TableHead> {/* New Column */}
                  <TableHead className="text-right">Precio Venta</TableHead>
                  <TableHead className="text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-mono text-xs">{product.id}</TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="text-right">{product.quantity ?? 0}</TableCell>
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
                        {deleteMutation.isPending && productToDelete?.id === product.id ? <LoadingSpinner size="sm"/> : <Trash2 className="h-4 w-4" />}
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
               {deleteMutation.isPending ? <LoadingSpinner size="sm" className="mr-2"/> : 'Sí, Eliminar'}
             </AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>
    </Card>
  );
};

export default ProductTable;

