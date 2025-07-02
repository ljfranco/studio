
"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FullScreenScannerProps {
  onScanSuccess: (scannedId: string) => void;
  onClose: () => void;
}

const FullScreenScanner = ({ onScanSuccess, onClose }: FullScreenScannerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const requestCameraPermission = async () => {
      try {
        // Check for BarcodeDetector support
        if (!("BarcodeDetector" in window)) {
          console.error("Barcode Detector is not supported by this browser.");
          toast({
            title: "Navegador no compatible",
            description: "El escáner de código de barras no es compatible con este navegador.",
            variant: "destructive",
          });
          setHasPermission(false);
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setHasPermission(true);
      } catch (err) {
        console.error("Error accessing camera:", err);
        toast({
          title: "Error de Cámara",
          description: "No se pudo acceder a la cámara. Por favor, verifica los permisos.",
          variant: "destructive",
        });
        setHasPermission(false);
        onClose();
      }
    };

    requestCameraPermission();

    // Cleanup function to stop video stream
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [toast, onClose]);

  useEffect(() => {
    if (hasPermission === null || !hasPermission || !videoRef.current) return;

    const barcodeDetector = new (window as any).BarcodeDetector({
        formats: ["ean_13", "upc_a", "code_128", "ean_8", "itf", "code_39", "code_93"],
    });
    
    let isDetectionRunning = true;

    const detectBarcode = async () => {
        if (!isDetectionRunning || !videoRef.current || !videoRef.current.srcObject) return;

        try {
            const barcodes = await barcodeDetector.detect(videoRef.current);
            if (barcodes.length > 0 && barcodes[0].rawValue) {
                isDetectionRunning = false; // Stop detection after a successful scan
                onScanSuccess(barcodes[0].rawValue);
            }
        } catch (error) {
            console.error("Error detecting barcode:", error);
        }
        
        if(isDetectionRunning) {
            requestAnimationFrame(detectBarcode);
        }
    };

    const videoElement = videoRef.current;
    videoElement.addEventListener("loadeddata", detectBarcode);


    return () => {
      isDetectionRunning = false;
      videoElement.removeEventListener("loadeddata", detectBarcode);
    };
  }, [hasPermission, onScanSuccess]);

  if (hasPermission === false) {
    return null; // Don't render anything if permission is denied
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />
      <div className="absolute top-1/2 left-1/2 w-3/4 max-w-md h-0.5 bg-red-500 animate-pulse -translate-x-1/2 -translate-y-1/2" />
      <Button
        variant="ghost"
        size="icon"
        onClick={onClose}
        className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/75"
      >
        <X className="h-6 w-6" />
      </Button>
    </div>
  );
};

export default FullScreenScanner;
