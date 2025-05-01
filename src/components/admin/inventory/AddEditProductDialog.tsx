'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useFirebase } from '@/context/FirebaseContext';
import { doc, setDoc, updateDoc, serverTimestamp, getDoc, Timestamp } from 'firebase/firestore'; // Added Timestamp
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
import { Loader2, Camera, ScanLine, Percent } from 'lucide-react'; // Added Percent
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { Product } from '@/types/product';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'; // For camera error
import { cn } from '@/lib/utils'; // Import cn
import { LoadingSpinner } from '@/components/ui/loading-spinner'; // Import LoadingSpinner


// Make sellingPrice optional for minimal add scenario
// Add optional margin field
const productSchema = z.object({
  id: z.string().min(1, { message: 'El código de barras es requerido.' }), // Barcode as ID
  name: z.string().min(2, { message: 'El nombre debe tener al menos 2 caracteres.' }).max(100),
  quantity: z.preprocess(
    (val) => val === '' || val === null || val === undefined ? undefined : parseInt(String(val), 10), // Allow empty/null/undefined
    z.number().int().min(0, { message: 'La cantidad no puede ser negativa.' }).optional() // Keep optional
  ),
  sellingPrice: z.preprocess(
    (val) => val === '' || val === null || val === undefined ? undefined : parseFloat(String(val).replace(/[^0-9.]+/g, "")), // Handle empty string/null for optional
    z.number().min(0, { message: 'El precio de venta no puede ser negativo.' }).optional() // Make optional
  ),
  margin: z.preprocess(
    (val) => val === '' || val === null || val === undefined ? undefined : parseFloat(String(val).replace(/[^0-9.]+/g, "")), // Handle empty string/null for optional
    z.number().min(0, { message: 'El margen no puede ser negativo.' }).optional() // Make margin optional
  ),
});

type ProductFormValues = z.infer<typeof productSchema>;

interface AddEditProductDialogProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Partial<Product> | null; // Allow partial product for prefilling ID
  onSuccessCallback?: (addedProduct: Product) => void; // Callback on successful add/edit
  isMinimalAdd?: boolean; // New prop for minimal add mode (only name required)
}

const AddEditProductDialog: React.FC<AddEditProductDialogProps> = ({
  isOpen,
  onClose,
  product,
  onSuccessCallback,
  isMinimalAdd = false, // Default to false
}) => {
  const { db } = useFirebase();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null); // null = unknown, true = granted, false = denied
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // For potentially drawing scan lines/results


  const isEditMode = !!product && !!product.name && !isMinimalAdd; // Edit mode if product exists, has a name, and not minimal add
  const prefilledBarcode = product?.id && !product.name; // Check if only barcode is prefilled

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      id: '',
      name: '',
      quantity: undefined, // Initialize quantity as undefined
      sellingPrice: undefined, // Initialize as undefined for optional field
      margin: undefined, // Initialize margin as undefined
    },
  });

   // --- Camera Permission Effect ---
   useEffect(() => {
    let stream: MediaStream | null = null;
    const getCameraPermission = async () => {
      if (!isOpen || !isScanning) {
        setHasCameraPermission(null); // Reset when not scanning or dialog closed
        if (videoRef.current && videoRef.current.srcObject) {
            (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
          }
        return;
      }
       console.log("Requesting camera permission...");
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); // Prefer rear camera
         console.log("Camera permission granted.");
        setHasCameraPermission(true);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
         console.error('Error accessing camera:', error);
        setHasCameraPermission(false);
        toast({
          variant: 'destructive',
          title: 'Acceso a Cámara Denegado',
          description: 'Habilita los permisos de cámara en tu navegador para usar el escáner.',
        });
        setIsScanning(false); // Stop scanning if permission denied
      }
    };

    getCameraPermission();

     // Cleanup function to stop video stream
     return () => {
        if (stream) {
            console.log("Stopping camera stream.");
            stream.getTracks().forEach(track => track.stop());
        }
        if (videoRef.current) {
           videoRef.current.srcObject = null;
        }
     };
  }, [isOpen, isScanning, toast]);


   // --- Barcode Scanning Logic ---
   useEffect(() => {
      if (!isOpen || !isScanning || !hasCameraPermission || !videoRef.current || !('BarcodeDetector' in window)) {
        return; // Exit if not ready or BarcodeDetector not supported
      }

       console.log("Starting barcode detection...");
      let animationFrameId: number;
       const barcodeDetector = new (window as any).BarcodeDetector({ formats: ['aztec',
    'code_128',
    'code_39',
    'code_93',
    'data_matrix',
    'ean_13',
    'ean_8',
    'itf',
    'pdf417',
    'qr_code',
    'upc_a',
    'upc_e'] }); // Add formats as needed


      const detectBarcode = async () => {
          if (!videoRef.current || !videoRef.current.srcObject || !isScanning) {
             console.log("Detection stopped or video not ready.");
             return;
          }
          // Check video readiness before detecting
           if (videoRef.current.readyState < videoRef.current.HAVE_METADATA || videoRef.current.videoWidth === 0) {
             console.log("Video not ready for detection, retrying...");
             animationFrameId = requestAnimationFrame(detectBarcode); // Retry detection
             return;
           }


          try {
            const barcodes = await barcodeDetector.detect(videoRef.current);
            if (barcodes.length > 0 && barcodes[0].rawValue) {
              console.log("Barcode detected:", barcodes[0].rawValue);
              form.setValue('id', barcodes[0].rawValue, { shouldValidate: true });
              setIsScanning(false); // Stop scanning after detection
              toast({ title: "Código Detectado", description: barcodes[0].rawValue });
            } else {
              // No barcode detected, continue scanning
              animationFrameId = requestAnimationFrame(detectBarcode);
            }
          } catch (error) {
             // Avoid logging the common InvalidStateError unless needed for debugging
             if (!(error instanceof DOMException && error.name === 'InvalidStateError')) {
                console.error("Error detecting barcode:", error);
             }
            // Don't stop scanning on error, just log it
             animationFrameId = requestAnimationFrame(detectBarcode); // Try again
          }
      };

      // Start detection loop
       animationFrameId = requestAnimationFrame(detectBarcode);

      // Cleanup function to cancel the animation frame
      return () => {
         console.log("Stopping barcode detection loop.");
         cancelAnimationFrame(animationFrameId);
      };

   }, [isOpen, isScanning, hasCameraPermission, form, toast]); // Add dependencies


  // --- Form Reset Effect ---
  useEffect(() => {
    if (isOpen) {
      if (isEditMode && product) {
         console.log("Resetting form for edit:", product);
        form.reset({
          id: product.id,
          name: product.name,
          quantity: product.quantity ?? undefined, // Use undefined for placeholder
          sellingPrice: product.sellingPrice ?? undefined,
          margin: product.margin ?? undefined, // Reset margin in edit mode
        });
      } else if ((prefilledBarcode || isMinimalAdd) && product?.id) {
           console.log("Prefilling barcode for minimal add:", product.id);
          form.reset({
              id: product.id, // Prefill ID
              name: '',
              quantity: undefined, // Default undefined for placeholder
              sellingPrice: undefined, // Default optional field
              margin: undefined, // Default margin
          });
      }
      else {
         console.log("Resetting form for standard add");
        form.reset({
          id: '',
          name: '',
          quantity: undefined, // Default undefined
          sellingPrice: undefined,
          margin: undefined,
        });
      }
       setIsScanning(false); // Ensure scanner is off initially
       setHasCameraPermission(null); // Reset permission status
    }
  }, [isOpen, product, isEditMode, prefilledBarcode, isMinimalAdd, form]);


  const handleClose = () => {
     setIsScanning(false); // Ensure scanning stops when closing dialog manually
     onClose();
  };

  // --- Firestore Mutation ---
  const mutationFn = async (values: ProductFormValues): Promise<Product> => { // Return added/updated product
    const productRef = doc(db, 'products', values.id); // Use barcode as document ID

    // Adjust sellingPrice and margin for minimal add or if undefined
    const finalSellingPrice = isMinimalAdd ? 0 : (values.sellingPrice ?? 0);
    // Ensure margin is null instead of undefined when saving to Firestore
    const finalMargin = values.margin ?? null; // Convert undefined to null
    // Ensure quantity is 0 if undefined when saving
    const finalQuantity = isMinimalAdd ? 0 : (values.quantity ?? 0);

    // Construct final product data, ensuring required fields have defaults
    const finalData = {
        id: values.id,
        name: values.name,
        quantity: finalQuantity, // Use finalQuantity
        sellingPrice: finalSellingPrice,
        margin: finalMargin,
        updatedAt: Timestamp.now(), // Set for both add and edit
        createdAt: isEditMode ? product?.createdAt : Timestamp.now(), // Preserve or set createdAt
        lastPurchasePrice: isEditMode ? product?.lastPurchasePrice : null, // Preserve or set lastPurchasePrice
    };

    if (isEditMode && product) {
      // Update existing document
      const updatePayload: Record<string, any> = { // Use Record<string, any> for flexibility
          name: values.name,
          quantity: values.quantity ?? 0, // Default to 0 if undefined
          sellingPrice: values.sellingPrice ?? 0, // Default to 0 if undefined
          margin: values.margin ?? null, // Convert undefined to null for update
          updatedAt: serverTimestamp(),
      };
      // Remove undefined fields before updating (not strictly necessary with defaults, but good practice)
      Object.keys(updatePayload).forEach(key => updatePayload[key] === undefined && delete updatePayload[key]);

      await updateDoc(productRef, updatePayload);
      // Merge existing non-updated fields back if necessary (like createdAt)
      finalData.createdAt = product.createdAt;
      finalData.lastPurchasePrice = product.lastPurchasePrice;
    } else {
        // Add new document
        const docSnap = await getDoc(productRef);
        if (docSnap.exists()) {
             throw new Error(`El producto con código de barras ${values.id} ya existe.`);
        }
        finalData.createdAt = Timestamp.now(); // Set createdAt for new doc
        finalData.lastPurchasePrice = null; // Ensure lastPurchasePrice is null for new products

        // Remove undefined fields before setting (again, less critical with defaults)
        Object.keys(finalData).forEach(key => (finalData as any)[key] === undefined && delete (finalData as any)[key]);

        await setDoc(productRef, finalData); // Use finalData which includes ID
    }
     // Return the full product data, replacing nulls back to undefined if needed for the app state
     return {
       ...finalData,
       margin: finalData.margin === null ? undefined : finalData.margin,
       lastPurchasePrice: finalData.lastPurchasePrice === null ? undefined : finalData.lastPurchasePrice,
     } as Product;
  };


  const mutation = useMutation({
    mutationFn,
    onSuccess: (data) => { // Data is the returned product
      toast({
        title: '¡Éxito!',
        description: `Producto ${isEditMode ? 'actualizado' : 'agregado'} correctamente.`,
      });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onSuccessCallback?.(data); // Call the callback with the added/updated product data
      handleClose(); // Use the new handler
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

  // --- Form Submission ---
  const onSubmit = (values: ProductFormValues) => {
    // Validation for sellingPrice only if not minimal add
    if (!isMinimalAdd && (values.sellingPrice === undefined || values.sellingPrice === null || isNaN(values.sellingPrice))) {
        form.setError('sellingPrice', { type: 'manual', message: 'El precio de venta es requerido.' });
        return;
    }
    // Quantity validation if not minimal add
     if (!isMinimalAdd && (values.quantity === undefined || values.quantity === null || isNaN(values.quantity))) {
        form.setError('quantity', { type: 'manual', message: 'La cantidad es requerida.' });
        return;
    }
    // No mandatory validation for margin
    setIsSaving(true);
    console.log("Submitting product:", values);
    mutation.mutate(values);
  };


  // --- Check BarcodeDetector Support ---
  const isBarcodeDetectorSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  const toggleScan = () => {
     if (!isBarcodeDetectorSupported) {
         toast({ title: "No Soportado", description: "El escáner de código de barras no es compatible con este navegador.", variant: "destructive" });
         return;
     }
     setIsScanning(prev => !prev);
   };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Editar Producto' : 'Agregar Nuevo Producto'}</DialogTitle>
          <DialogDescription>
            {isEditMode ? 'Modifica los detalles del producto.' : (isMinimalAdd ? 'Ingresa el nombre del nuevo producto.' : 'Ingresa los detalles del nuevo producto. Puedes escanear el código de barras.')}
             {prefilledBarcode && <span className='block mt-1 text-sm text-primary'>Código de barras pre-llenado. Completa los demás datos.</span>}
          </DialogDescription>
        </DialogHeader>

        {isScanning && (
            <div className="relative mb-4">
                <video
                    ref={videoRef}
                    className={cn(
                        "w-full aspect-video rounded-md bg-muted",
                        hasCameraPermission === false && "hidden" // Hide if permission denied
                    )}
                    autoPlay
                    muted
                    playsInline // Important for iOS
                />
                <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none" /> {/* Overlay for drawing */}
                {/* Scan Line */}
                 <div className="absolute top-1/2 left-0 w-full h-0.5 bg-red-500 animate-pulse" />

                {hasCameraPermission === null && !videoRef.current?.srcObject && (
                     <div className="absolute inset-0 flex items-center justify-center bg-muted rounded-md">
                        <LoadingSpinner />
                        <p className="ml-2 text-sm text-muted-foreground">Iniciando cámara...</p>
                    </div>
                )}
                {hasCameraPermission === false && (
                     <Alert variant="destructive" className="mt-2">
                      <Camera className="h-4 w-4" />
                      <AlertTitle>Permiso de Cámara Requerido</AlertTitle>
                      <AlertDescription>
                        Por favor, permite el acceso a la cámara en la configuración de tu navegador.
                      </AlertDescription>
                    </Alert>
                )}
            </div>
        )}


        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
             {/* Barcode ID Field */}
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
                                disabled={isSaving || isEditMode || isScanning || isMinimalAdd} // Disable editing barcode in edit/minimal add/scanning modes
                                className="font-mono text-sm"
                            />
                        </FormControl>
                         {/* Show scan button only when adding and not minimal/scanning */}
                          {!isEditMode && !isMinimalAdd && (
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={toggleScan}
                                title={isScanning ? "Detener Escáner" : "Escanear Código"}
                                disabled={isSaving || !isBarcodeDetectorSupported}
                                className={cn("shrink-0", isScanning && "bg-destructive hover:bg-destructive/90 text-destructive-foreground")}
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

            {/* Name Field */}
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
             {/* Quantity, Price, and Margin Fields (conditional) */}
             {!isMinimalAdd && (
                <div className="grid grid-cols-3 gap-4"> {/* Changed to 3 cols */}
                  <FormField
                    control={form.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cantidad</FormLabel>
                        <FormControl>
                          <Input
                             type="number"
                             placeholder="Cant." // Use placeholder
                             {...field}
                             value={field.value ?? ''} // Use empty string for placeholder
                             onChange={e => field.onChange(e.target.value === '' ? undefined : parseInt(e.target.value, 10))} // Handle empty string
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
                    name="margin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Margen (%)</FormLabel>
                        <div className="relative">
                            <FormControl>
                            <Input
                                type="number"
                                placeholder="%" // Changed placeholder
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
             )}
            <DialogFooter>
              <DialogClose asChild>
                 {/* Use the custom handleClose */}
                <Button type="button" variant="outline" onClick={handleClose} disabled={isSaving}>
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isSaving || isScanning} className="bg-primary hover:bg-primary/90">
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isEditMode ? 'Guardar Cambios' : 'Agregar Producto')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

// Helper to check for BarcodeDetector support safely on the client
if (typeof window !== 'undefined' && !('BarcodeDetector' in window)) {
  console.warn("Barcode Detector API is not supported in this browser.");
  // Potentially load a polyfill here if desired
}


export default AddEditProductDialog;
