
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
import { Loader2, Camera, ScanLine } from 'lucide-react';
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


const productSchema = z.object({
  id: z.string().min(1, { message: 'El código de barras es requerido.' }), // Barcode as ID
  name: z.string().min(2, { message: 'El nombre debe tener al menos 2 caracteres.' }).max(100),
  quantity: z.preprocess(
    (val) => parseInt(String(val), 10),
    z.number().int().min(0, { message: 'La cantidad no puede ser negativa.' }).optional().default(0)
  ),
  sellingPrice: z.preprocess(
    (val) => parseFloat(String(val).replace(/[^0-9.]+/g, "")), // Clean before validation
    z.number().min(0, { message: 'El precio de venta no puede ser negativo.' })
  ),
});

type ProductFormValues = z.infer<typeof productSchema>;

interface AddEditProductDialogProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product | null; // Product data for editing, null/undefined for adding
  onSuccessCallback?: (addedProduct: Product) => void; // Callback on successful add/edit
}

const AddEditProductDialog: React.FC<AddEditProductDialogProps> = ({
  isOpen,
  onClose,
  product,
  onSuccessCallback,
}) => {
  const { db } = useFirebase();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null); // null = unknown, true = granted, false = denied
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // For potentially drawing scan lines/results


  const isEditMode = !!product && !!product.name; // Edit mode if product exists and has a name (distinguish from prefilling barcode)
  const prefilledBarcode = product?.id && !product.name; // Check if only barcode is prefilled

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      id: '',
      name: '',
      quantity: 0,
      sellingPrice: '' as any, // Initialize for controlled input
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
       const barcodeDetector = new (window as any).BarcodeDetector({ formats: ['ean_13', 'upc_a', 'code_128'] }); // Add formats as needed


      const detectBarcode = async () => {
          if (!videoRef.current || !videoRef.current.srcObject || !isScanning) {
             console.log("Detection stopped or video not ready.");
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
            console.error("Error detecting barcode:", error);
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
          quantity: product.quantity ?? 0,
          sellingPrice: product.sellingPrice ?? '' as any,
        });
      } else if (prefilledBarcode && product) {
           console.log("Prefilling barcode:", product.id);
          form.reset({
              id: product.id, // Prefill ID
              name: '',
              quantity: 0,
              sellingPrice: '' as any,
          });
      }
      else {
         console.log("Resetting form for add");
        form.reset({
          id: '',
          name: '',
          quantity: 0,
          sellingPrice: '' as any,
        });
      }
       setIsScanning(false); // Ensure scanner is off initially
       setHasCameraPermission(null); // Reset permission status
    }
  }, [isOpen, product, isEditMode, prefilledBarcode, form]);


  const handleClose = () => {
     setIsScanning(false); // Ensure scanning stops when closing dialog manually
     onClose();
  };

  // --- Firestore Mutation ---
  const mutationFn = async (values: ProductFormValues): Promise<Product> => { // Return added/updated product
    const productRef = doc(db, 'products', values.id); // Use barcode as document ID
    const finalData: Product = { // Construct final product data
        id: values.id,
        name: values.name,
        quantity: values.quantity ?? 0,
        sellingPrice: values.sellingPrice,
        updatedAt: Timestamp.now(), // Set for both add and edit
    };

    if (isEditMode) {
      // Update existing document
       const updatePayload: Partial<Product> = {
          name: values.name,
          quantity: values.quantity ?? 0,
          sellingPrice: values.sellingPrice,
          updatedAt: serverTimestamp(),
       };
      await updateDoc(productRef, updatePayload);
      finalData.createdAt = product?.createdAt; // Preserve original createdAt if editing
    } else {
        // Check if product already exists before adding
        const docSnap = await getDoc(productRef);
        if (docSnap.exists()) {
             throw new Error(`El producto con código de barras ${values.id} ya existe.`);
        }
      // Add new document with createdAt timestamp
      finalData.createdAt = Timestamp.now();
      await setDoc(productRef, finalData); // Use finalData which includes ID
    }
     return finalData; // Return the full product data
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
            {isEditMode ? 'Modifica los detalles del producto.' : 'Ingresa los detalles del nuevo producto. Puedes escanear el código de barras.'}
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
                                disabled={isSaving || isEditMode || isScanning} // Disable editing barcode in edit mode or while scanning
                                className="font-mono text-sm"
                            />
                        </FormControl>
                         {/* Show scan button only when adding and not already scanning */}
                          {!isEditMode && (
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={toggleScan}
                                title={isScanning ? "Detener Escáner" : "Escanear Código"}
                                disabled={isSaving || !isBarcodeDetectorSupported}
                                className={cn(isScanning && "bg-destructive hover:bg-destructive/90 text-destructive-foreground")}
                            >
                                <ScanLine className="h-5 w-5" />
                            </Button>
                          )}
                        </div>
                        {!isBarcodeDetectorSupported && !isEditMode && (
                            <p className="text-xs text-destructive mt-1">Escáner no compatible con este navegador.</p>
                        )}
                         <FormMessage />
                    </FormItem>
                )}
                />

            {/* Other Fields */}
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
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cantidad</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="0" {...field} disabled={isSaving} min="0" step="1" />
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
                      <Input type="number" placeholder="0.00" {...field} disabled={isSaving} min="0" step="0.01" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
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
