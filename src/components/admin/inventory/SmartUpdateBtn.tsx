import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileUp, Loader2 } from 'lucide-react';
import { useFirebase } from '@/context/FirebaseContext';
import { writeBatch, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PreviewDialog } from './PreviewDialog';
import { ColumnMappingDialog } from './ColumnMappingDialog';
import { 
  parseExcel, 
  parseWord, 
  getPdfCandidateRows, 
  parsePdfWithMapping, 
  PdfColumnHeader, 
  CandidateRow,
  ExtractedItem 
} from '@/lib/documentParsers';
import { matchItemsWithCatalog } from '@/lib/matcher';
import { cn } from '@/lib/utils';

export default function SmartUpdateBtn({ myProducts = [], distributors = [] }: any) {
  const [loading, setLoading] = useState(false);
  const [selectedDistributorId, setSelectedDistributorId] = useState("");
  const { db } = useFirebase();
  const { toast } = useToast();

  // Estados para PreviewDialog (guardado final)
  const [showPreview, setShowPreview] = useState(false);
  const [pendingUpdates, setPendingUpdates] = useState<any[]>([]);

  // Estados para ColumnMappingDialog (filas candidatas del PDF)
  const [showMapping, setShowMapping] = useState(false);
  const [candidateRows, setCandidateRows] = useState<CandidateRow[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // 1. Selector de archivo principal
  const handleFileProcess = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedDistributorId) return;

    const extension = file.name.split('.').pop()?.toLowerCase();

    // SI ES PDF: Extraemos las primeras filas para que el usuario elija el encabezado en el modal
    if (extension === 'pdf') {
      try {
        setLoading(true);
        toast({ title: "Analizando PDF", description: "Leyendo la estructura del documento..." });
        
        // Obtenemos las primeras 10 filas de la primera página
        const rows = await getPdfCandidateRows(file, 10);
        
        if (rows.length === 0) {
          toast({ 
            title: "Error de lectura", 
            description: "No se detectaron líneas de texto legibles en la primera página.", 
            variant: "destructive" 
          });
          setLoading(false);
          return;
        }

        setSelectedFile(file);
        setCandidateRows(rows);
        setShowMapping(true); // Abre ColumnMappingDialog con el selector de fila
      } catch (err) {
        console.error("Error al inspeccionar PDF:", err);
        toast({ title: "Error", description: "No se pudo leer la estructura del PDF.", variant: "destructive" });
      } finally {
        setLoading(false);
        e.target.value = ''; // Limpiar input para permitir reintentos
      }
      return;
    }

    // SI ES EXCEL O WORD: Procesamiento directo
    setLoading(true);
    setPendingUpdates([]);
    try {
      let extracted: ExtractedItem[] = [];
      if (extension === 'xlsx' || extension === 'xls' || extension === 'csv') {
        extracted = await parseExcel(file);
      } else if (extension === 'docx') {
        extracted = await parseWord(file);
      }

      runMatching(extracted);
    } catch (error) {
      console.error("Error procesando:", error);
      toast({ title: "Error", description: "Fallo al procesar el archivo.", variant: "destructive" });
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  // 2. Callback cuando el usuario confirma la fila y columnas en ColumnMappingDialog
  const handleConfirmMapping = async (
    headers: PdfColumnHeader[],
    mapping: { codeIndex: number; nameIndex: number; priceIndex: number }
  ) => {
    if (!selectedFile) return;

    setLoading(true);
    try {
      toast({ title: "Procesando", description: "Extrayendo productos según las columnas elegidas..." });
      const extracted = await parsePdfWithMapping(selectedFile, headers, mapping);
      runMatching(extracted);
    } catch (err) {
      console.error("Error procesando con mapeo:", err);
      toast({ title: "Error", description: "Fallo al leer datos del PDF.", variant: "destructive" });
    } finally {
      setLoading(false);
      setSelectedFile(null);
    }
  };

  // 3. Función común para conciliar contra el catálogo (lib/matcher.ts)
  const runMatching = (extracted: ExtractedItem[]) => {
    if (extracted.length === 0) {
      toast({ title: "Sin datos", description: "No se encontraron productos y precios válidos.", variant: "destructive" });
      return;
    }

    const matches = matchItemsWithCatalog(extracted, myProducts, selectedDistributorId);

    if (matches.length > 0) {
      setPendingUpdates(matches);
      setShowPreview(true); // Abre el PreviewDialog con las diferencias de precio
    } else {
      toast({ 
        title: "Sin coincidencias", 
        description: "No se encontraron artículos conocidos en el catálogo.", 
        variant: "default" 
      });
    }
  };

  // 4. Guardado final en Firebase (Batch)
  const confirmUpdate = async (selectedUpdates: any[]) => {
    const batch = writeBatch(db);
    selectedUpdates.forEach((update) => {
      const productRef = doc(db, 'products', update.id);
      const payload: any = {
        [`purchasePrices.${selectedDistributorId}`]: update.newPrice,
        lastPurchasePrice: update.newPrice,
        updatedAt: new Date()
      };
      if (update.supplierCode) {
        payload[`providerCodes.${selectedDistributorId}`] = update.supplierCode;
      }
      batch.update(productRef, payload);
    });

    await batch.commit();
    setShowPreview(false);
    toast({ title: "Actualización exitosa", description: "Precios y códigos vinculados correctamente." });
  };

  const isDisabled = !selectedDistributorId || loading;

  return (
    <div className="flex flex-row items-end gap-2">
      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">
          Proveedor
        </label>
        <Select onValueChange={setSelectedDistributorId} value={selectedDistributorId}>
          <SelectTrigger className="w-[160px] h-9 bg-background">
            <SelectValue placeholder="Seleccionar..." />
          </SelectTrigger>
          <SelectContent>
            {distributors.map((d: any) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <input 
        type="file" 
        id="local-file-up" 
        className="hidden" 
        onChange={handleFileProcess} 
        accept=".xlsx,.xls,.csv,.docx,.pdf" 
      />

      <Button 
        asChild 
        disabled={isDisabled} 
        className={cn(
          "h-9 transition-colors",
          isDisabled 
            ? "bg-slate-500 hover:bg-slate-500 cursor-not-allowed opacity-70" 
            : "bg-indigo-600 hover:bg-indigo-700 cursor-pointer"
        )}
      >
        <label 
          htmlFor={isDisabled ? undefined : "local-file-up"} 
          className={cn(
            "flex items-center px-3 h-full",
            isDisabled ? "cursor-not-allowed pointer-events-none" : "cursor-pointer"
          )}
        >
          {loading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <FileUp className="h-4 w-4 mr-2" />}
          {loading ? "Procesando..." : "Actualizar"}
        </label>
      </Button>

      {/* Modal 1: Mapeo de columnas con selector visual de encabezado */}
      <ColumnMappingDialog 
        open={showMapping}
        onOpenChange={setShowMapping}
        candidateRows={candidateRows}
        onConfirmMapping={handleConfirmMapping}
      />

      {/* Modal 2: Confirmación y previsualización de precios previa al guardado */}
      <PreviewDialog 
        open={showPreview} 
        onOpenChange={setShowPreview}
        updates={pendingUpdates}
        products={myProducts}
        onConfirm={confirmUpdate}
        loading={loading}
        selectedDistributorId={selectedDistributorId}
      />
    </div>
  );
}