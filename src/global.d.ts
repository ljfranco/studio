
// src/global.d.ts
export {}; // Make this a module

declare global {
  interface Window {
    // Add the BarcodeDetector definition
    BarcodeDetector?: new (options?: { formats: string[] }) => BarcodeDetector;
  }

  // Define the BarcodeDetector interface based on the spec
  interface BarcodeDetector {
    detect(image: ImageBitmapSource): Promise<DetectedBarcode[]>;
    getSupportedFormats(): Promise<string[]>;
  }

  interface DetectedBarcode {
    boundingBox: DOMRectReadOnly;
    rawValue: string;
    format: string;
    cornerPoints: { x: number; y: number }[];
  }
}
