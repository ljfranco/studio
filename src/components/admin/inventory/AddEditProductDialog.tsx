'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useFirebase } from '@/context/FirebaseContext';
import { doc, setDoc, updateDoc, serverTimestamp, getDoc, Timestamp } from 'firebase/firestore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ScanLine, Percent } from 'lucide-react';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { Product } from '@/types/product';
import { cn } from '@/lib/utils';
import FullScreenScanner from '@/components/scanner/FullScreenScanner';

const productSchema = z.object({
  id: z.string().min(1, { message: 'El código de barras es requerido.' }),
  name: z.string().min(2, { message: 'El nombre debe tener al menos 2 caracteres.' }).max(100),
  quantity: z.preprocess(
    (val) => val === '' || val === null || val === undefined ? undefined : parseInt(String(val), 10),
    z.number().int().min(0, { message: 'La cantidad no puede ser negativa.' }).optional()
  ),
  sellingPrice: z.preprocess(
    (val) => val === '' || val === null || val === undefined ? undefined : parseFloat(String(val).replace(/[^0-9.]+/g, "")),
    z.number().min(0, { message: 'El precio de venta no puede ser negativo.' }).optional()
  ),
  minStock: z.preprocess(
    (val) => val === '' || val === null || val === undefined ? undefined : parseInt(String(val), 10),
    z.number().int().min(0, { message: 'El stock mínimo no puede ser negativo.' }).optional()
  ),
  margin: z.preprocess(
    (val) => val === '' || val === null || val === undefined ? undefined : parseFloat(String(val).replace(/[^0-9.]+/g, "")),
    z.number().min(0, { message: 'El margen no puede ser negativo.' }).optional()
  ),
});

type ProductFormValues = z.infer<typeof productSchema>;

interface AddEditProductDialogProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Partial<Product> | null;
  onSuccessCallback?: (addedProduct: Product) => void;
  isMinimalAdd?: boolean;
}

const AddEditProductDialog: React.FC<AddEditProductDialogProps> = ({
  isOpen,
  onClose,
  product,
  onSuccessCallback,
  isMinimalAdd = false,
}) => {
  const { db } = useFirebase();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const isEditMode = !!product && !!product.name && !isMinimalAdd;
  const prefilledBarcode = product?.id && !product.name;

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      id: '',
      name: '',
      quantity: undefined,
      sellingPrice: undefined,
      minStock: undefined,
      margin: undefined,
    },
  });

  const isBarcodeDetectorSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  const handleScanSuccess = (scannedId: string) => {
    console.log("Barcode detected:", scannedId);
    form.setValue('id', scannedId, { shouldValidate: true });
    setIsScannerOpen(false);
    toast({ title: "Código Detectado", description: scannedId });
  };

  const toggleScan = () => {
    if (!isBarcodeDetectorSupported) {
      toast({ title: "No Soportado", description: "El escáner de código de barras no es compatible con este navegador.", variant: "destructive" });
      return;
    }
    setIsScannerOpen(true);
  };

  useEffect(() => {
    if (isOpen) {
      if (isEditMode && product) {
        form.reset({
          id: product.id,
          name: product.name,
          quantity: product.quantity ?? undefined,
          sellingPrice: product.sellingPrice ?? undefined,
          minStock: product.minStock ?? undefined,
          margin: product.margin ?? undefined,
        });
      } else if ((prefilledBarcode || isMinimalAdd) && product?.id) {
        form.reset({
          id: product.id,
          name: '',
          quantity: undefined,
          sellingPrice: undefined,
          minStock: undefined,
          margin: undefined,
        });
      } else {
        form.reset({
          id: '',
          name: '',
          quantity: undefined,
          sellingPrice: undefined,
          minStock: undefined,
          margin: undefined,
        });
      }
    }
  }, [isOpen, product, isEditMode, prefilledBarcode, isMinimalAdd, form]);

  const mutationFn = async (values: ProductFormValues): Promise<Product> => {
    const productRef = doc(db, 'products', values.id);
    const finalSellingPrice = isMinimalAdd ? 0 : (values.sellingPrice ?? 0);
    const finalMargin = values.margin ?? null;
    const finalQuantity = isMinimalAdd ? 0 : (values.quantity ?? 0);
    const finalMinStock = values.minStock ?? 0;

    const finalData = {
      id: values.id,
      name: values.name,
      quantity: finalQuantity,
      sellingPrice: finalSellingPrice,
      minStock: finalMinStock,
      margin: finalMargin,
      updatedAt: Timestamp.now(),
      createdAt: isEditMode ? product?.createdAt : Timestamp.now(),
      lastPurchasePrice: isEditMode ? product?.lastPurchasePrice : null,
    };

    if (isEditMode && product) {
      const updatePayload: Record<string, any> = {
        name: values.name,
        quantity: values.quantity ?? 0,
        minStock: values.minStock ?? 0,
        sellingPrice: values.sellingPrice ?? 0,
        margin: values.margin ?? null,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(productRef, updatePayload);
      finalData.createdAt = product.createdAt;
      finalData.lastPurchasePrice = product.lastPurchasePrice;
    } else {
      const docSnap = await getDoc(productRef);
      if (docSnap.exists()) {
        throw new Error(`El producto con código de barras ${values.id} ya existe.`);
      }
      finalData.createdAt = Timestamp.now();
      finalData.lastPurchasePrice = null;
      await setDoc(productRef, finalData);
    }
    return {
      ...finalData,
      margin: finalData.margin === null ? undefined : finalData.margin,
      lastPurchasePrice: finalData.lastPurchasePrice === null ? undefined : finalData.lastPurchasePrice,
    } as Product;
  };

  const mutation = useMutation({
    mutationFn,
    onSuccess: (data) => {
      toast({
        title: '¡Éxito!',
        description: `Producto ${isEditMode ? 'actualizado' : 'agregado'} correctamente.`,
      });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onSuccessCallback?.(data);
      onClose();
    },
    onError: (error) => {
      console.error("Error saving product:", error);
      toast({
        title: 'Error',
        description: `No se pudo guardar el producto. ${error instanceof Error ? error.message : String(error)}`,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setIsSaving(false);
    }
  });

  const onSubmit = (values: ProductFormValues) => {
    if (!isMinimalAdd && (values.sellingPrice === undefined || values.sellingPrice === null || isNaN(values.sellingPrice))) {
      form.setError('sellingPrice', { type: 'manual', message: 'El precio de venta es requerido.' });
      return;
    }
    if (!isMinimalAdd && (values.quantity === undefined || values.quantity === null || isNaN(values.quantity))) {
      form.setError('quantity', { type: 'manual', message: 'La cantidad es requerida.' });
      return;
    }
    setIsSaving(true);
    mutation.mutate(values);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      {isScannerOpen && (
        <FullScreenScanner 
          onScanSuccess={handleScanSuccess} 
          onClose={() => setIsScannerOpen(false)} 
        />
      )}
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Editar Producto' : 'Agregar Nuevo Producto'}</DialogTitle>
          <DialogDescription>
            {isEditMode ? 'Modifica los detalles del producto.' : (isMinimalAdd ? 'Ingresa el nombre del nuevo producto.' : 'Ingresa los detalles del nuevo producto. Puedes escanear el código de barras.')}
            {prefilledBarcode && <span className='block mt-1 text-sm text-primary'>Código de barras pre-llenado. Completa los demás datos.</span>}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
            <FormField
              control={form.control}
              name="id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código de Barras</FormLabel>
                  <div className="flex items-center space-x-2">
                    <FormControl>
                      <Input
                        placeholder="Escanea o ingresa el código"
                        {...field}
                        disabled={isSaving || isEditMode || isScannerOpen || isMinimalAdd}
                        className="font-mono text-sm"
                      />
                    </FormControl>
                    {!isEditMode && !isMinimalAdd && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={toggleScan}
                        title="Escanear Código"
                        disabled={isSaving || !isBarcodeDetectorSupported}
                        className="shrink-0"
                      >
                        <ScanLine className="h-5 w-5" />
                      </Button>
                    )}
                  </div>
                  {!isBarcodeDetectorSupported && !isEditMode && !isMinimalAdd && (
                    <p className="text-xs text-destructive mt-1">Escáner no compatible con este navegador.</p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del Producto</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Coca Cola 1.5L" {...field} disabled={isSaving} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {!isMinimalAdd && (
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cantidad</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Cant."
                          {...field}
                          value={field.value ?? ''}
                          onChange={e => field.onChange(e.target.value === '' ? undefined : parseInt(e.target.value, 10))}
                          disabled={isSaving}
                          min="0"
                          step="1" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sellingPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Precio Venta</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="0.00" {...field} disabled={isSaving} min="0" step="0.01" value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="minStock"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stock Minimo</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="0.00" {...field} disabled={isSaving} min="0" step="1" value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="margin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Margen (%)</FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="%"
                            {...field}
                            disabled={isSaving}
                            min="0"
                            step="0.1"
                            value={field.value ?? ''}
                            className="pr-6"
                          />
                        </FormControl>
                        <Percent className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isSaving || isScannerOpen} className="bg-primary hover:bg-primary/90">
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isEditMode ? 'Guardar Cambios' : 'Agregar Producto')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AddEditProductDialog;