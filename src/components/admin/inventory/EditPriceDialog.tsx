'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form'; // Import useWatch
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useFirebase } from '@/context/FirebaseContext';
import { doc, updateDoc, serverTimestamp, deleteField } from 'firebase/firestore';
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
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Percent, Info } from 'lucide-react'; // Added Info icon
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatCurrency, cn } from '@/lib/utils';
import type { Product } from '@/types/product';
import type { Distributor } from '@/types/distributor';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"; // Import Tooltip

// Schema for the edit price form
const createPriceSchema = (distributorIds: string[]) => {
  const schemaObject: any = {
    sellingPrice: z.preprocess(
      (val) => val === '' || val === null || val === undefined ? undefined : parseFloat(String(val).replace(/[^0-9.]+/g, "")),
      z.number().min(0, { message: 'El precio de venta no puede ser negativo.' }).optional()
    ),
    margin: z.preprocess(
      (val) => val === '' || val === null || val === undefined ? undefined : parseFloat(String(val).replace(/[^0-9.]+/g, "")),
      z.number().min(0, { message: 'El margen no puede ser negativo.' }).optional()
    ),
  };

  distributorIds.forEach(id => {
    schemaObject[`purchase_${id}`] = z.preprocess(
      (val) => val === '' || val === null || val === undefined ? undefined : parseFloat(String(val).replace(/[^0-9.]+/g, "")),
      z.number().min(0, { message: 'El precio de compra no puede ser negativo.' }).optional()
    );
  });

  return z.object(schemaObject);
};

type PriceFormValues = z.infer<ReturnType<typeof createPriceSchema>>;

interface EditPriceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product;
  distributors: Distributor[];
}

// Calculate suggested selling price based on last purchase price and margin
const calculateSuggestedPrice = (lastPurchasePrice?: number | null, margin?: number | null): number | null => {
    if (lastPurchasePrice === undefined || lastPurchasePrice === null || margin === undefined || margin === null) {
      return null; // Not enough info
    }
    const marginMultiplier = 1 + (margin / 100);
    return lastPurchasePrice * marginMultiplier;
};


const EditPriceDialog: React.FC<EditPriceDialogProps> = ({
  isOpen,
  onClose,
  product,
  distributors,
}) => {
  const { db } = useFirebase();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);

  const distributorIds = distributors.map(d => d.id);
  const priceSchema = createPriceSchema(distributorIds);

  const form = useForm<PriceFormValues>({
    resolver: zodResolver(priceSchema),
    defaultValues: {}, // Will be set in useEffect
  });

   // Watch the margin field to dynamically update the suggested price display
   const watchedMargin = useWatch({
    control: form.control,
    name: 'margin',
   });

   // Calculate the suggested price based on watched margin and product's last purchase price
   const suggestedPrice = useMemo(() => {
       const marginValue = typeof watchedMargin === 'number' ? watchedMargin : product.margin;
       return calculateSuggestedPrice(product.lastPurchasePrice, marginValue);
   }, [watchedMargin, product.lastPurchasePrice, product.margin]);


  // Set default values when dialog opens or product changes
  useEffect(() => {
    if (isOpen && product) {
      const defaults: PriceFormValues = {
        sellingPrice: product.sellingPrice ?? undefined,
        margin: product.margin ?? undefined,
      };
      distributors.forEach(dist => {
        defaults[`purchase_${dist.id}`] = product.purchasePrices?.[dist.id] ?? undefined;
      });
      form.reset(defaults);
    }
  }, [isOpen, product, distributors, form]);

  // Firestore Mutation
  const mutationFn = async (values: PriceFormValues) => {
    const productRef = doc(db, 'products', product.id);
    const updates: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };

    // Prepare sellingPrice and margin updates
    updates.sellingPrice = values.sellingPrice ?? 0; // Default to 0 if undefined
    updates.margin = values.margin ?? null; // Convert undefined to null for Firestore

    // Prepare purchasePrices updates using dot notation
    const purchasePriceUpdates: Record<string, number | typeof deleteField> = {};
    distributors.forEach(dist => {
       const key = `purchase_${dist.id}`;
       const value = values[key];
       if (value !== undefined && value !== null) {
           updates[`purchasePrices.${dist.id}`] = value;
       } else if (product.purchasePrices?.[dist.id] !== undefined) {
           // If the field existed and is now empty/undefined, remove it
           updates[`purchasePrices.${dist.id}`] = deleteField();
       }
    });


    await updateDoc(productRef, updates);
  };

  const mutation = useMutation({
    mutationFn,
    onSuccess: () => {
      toast({
        title: '¡Éxito!',
        description: `Precios de "${product.name}" actualizados correctamente.`,
      });
      queryClient.invalidateQueries({ queryKey: ['products'] }); // Refetch products
      queryClient.invalidateQueries({ queryKey: ['distributors'] }); // Might be relevant if distributors list changes
      onClose(); // Close the dialog
    },
    onError: (error) => {
      console.error("Error updating prices:", error);
      toast({
        title: 'Error',
        description: `No se pudo actualizar los precios. ${error instanceof Error ? error.message : String(error)}`,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setIsSaving(false);
    }
  });

  const onSubmit = (values: PriceFormValues) => {
    setIsSaving(true);
    mutation.mutate(values);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Editar Precios - {product.name}</DialogTitle>
          <DialogDescription>
            Actualiza el precio de venta, margen y precios de compra por distribuidor.
            <br/>
            <span className="text-xs text-muted-foreground">
                Últ. Compra: {formatCurrency(product.lastPurchasePrice ?? 0)} | Stock: {product.quantity ?? 0}
            </span>
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          {/* Wrap form content in ScrollArea */}
           <TooltipProvider> {/* Provider for Tooltip */}
            <ScrollArea className="flex-grow overflow-y-auto pr-6 -mr-6"> {/* Add padding-right */}
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 pl-1 pr-1"> {/* Added padding */}
                <div className="grid grid-cols-2 gap-4 items-end"> {/* Use items-end */}
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
                        name="margin"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Margen (%)</FormLabel>
                            <div className="relative">
                                <FormControl>
                                <Input
                                    type="number"
                                    placeholder="0"
                                    {...field}
                                    disabled={isSaving}
                                    min="0"
                                    step="0.1"
                                    value={field.value ?? ''}
                                    className="pr-6" // Add padding for the icon
                                    />
                                </FormControl>
                                <Percent className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            </div>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                </div>

                {/* Suggested Price Display */}
                <div className="mt-1 text-sm text-muted-foreground flex items-center gap-1">
                    <Label>P. Venta Sugerido:</Label>
                    <span className={cn("font-medium", suggestedPrice !== null ? "text-blue-600" : "text-muted-foreground")}>
                        {suggestedPrice !== null ? formatCurrency(suggestedPrice) : "N/A"}
                    </span>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Info className="h-3 w-3 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="right">
                            <p className="text-xs">Calculado: Últ. Compra * (1 + Margen %)</p>
                        </TooltipContent>
                    </Tooltip>
                </div>


                <hr className="my-4" />

                <h4 className="text-md font-medium mb-2">Precios de Compra por Distribuidor</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {distributors.map(dist => (
                    <FormField
                        key={dist.id}
                        control={form.control}
                        name={`purchase_${dist.id}`}
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>{dist.name}</FormLabel>
                            <FormControl>
                            <Input
                                type="number"
                                placeholder="0.00"
                                {...field}
                                disabled={isSaving}
                                min="0"
                                step="0.01"
                                value={field.value ?? ''}
                            />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    ))}
                </div>
                    {distributors.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center">No hay distribuidores registrados. Agrégalos desde la pestaña "Distribuidores".</p>
                    )}
                </form>
            </ScrollArea>
           </TooltipProvider>
        </Form>

        <DialogFooter className="mt-auto pt-4 border-t"> {/* Ensure footer is at bottom */}
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isSaving}>
              Cancelar
            </Button>
          </DialogClose>
          {/* Manually trigger form submission from outside the form */}
          <Button onClick={form.handleSubmit(onSubmit)} disabled={isSaving} className="bg-primary hover:bg-primary/90"> {/* Removed distributor check */}
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Guardar Cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditPriceDialog;

