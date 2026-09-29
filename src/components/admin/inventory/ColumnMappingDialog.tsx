import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { 
  PdfColumnHeader, 
  CandidateRow, 
  buildHeadersFromSelectedRow 
} from '@/lib/documentParsers';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateRows: CandidateRow[];
  onConfirmMapping: (
    headers: PdfColumnHeader[],
    mapping: { codeIndex: number; nameIndex: number; priceIndex: number }
  ) => void;
}

export function ColumnMappingDialog({ 
  open, 
  onOpenChange, 
  candidateRows = [], 
  onConfirmMapping 
}: Props) {
  // 1. Estado para la fila del encabezado elegida
  const [selectedRowIndex, setSelectedRowIndex] = useState<string>('0');
  const [currentHeaders, setCurrentHeaders] = useState<PdfColumnHeader[]>([]);

  // 2. Estados para los índices de las columnas
  const [codeCol, setCodeCol] = useState<string>('-1');
  const [nameCol, setNameCol] = useState<string>('');
  const [priceCol, setPriceCol] = useState<string>('');

  // 3. Inicializar y autoseleccionar columnas cuando se cargan las candidateRows
  useEffect(() => {
    if (candidateRows.length > 0) {
      // Intentar auto-detectar si alguna fila tiene palabras clave como "código", "descripción", "precio" o "tarifa"
      const bestIdx = candidateRows.findIndex(r => {
        const text = r.displayText.toLowerCase();
        return (
          (text.includes('desc') || text.includes('art')) &&
          (text.includes('precio') || text.includes('tarifa') || text.includes('iva') || text.includes('pvp'))
        );
      });

      const initialIdx = bestIdx !== -1 ? bestIdx : 0;
      setSelectedRowIndex(initialIdx.toString());
      updateHeadersForRow(initialIdx);
    }
  }, [candidateRows]);

  // 4. Regenerar las opciones de columnas según la fila elegida
  const updateHeadersForRow = (rowIndex: number) => {
    const row = candidateRows[rowIndex];
    if (!row) return;

    const headers = buildHeadersFromSelectedRow(row.items);
    setCurrentHeaders(headers);

    // Detección automática inteligente de columnas
    let autoCode = '-1';
    let autoName = '';
    let autoPrice = '';

    headers.forEach((h) => {
      const lower = h.label.toLowerCase();
      if (autoCode === '-1' && (lower.includes('cod') || lower.includes('ref') || lower.includes('art'))) {
        autoCode = h.index.toString();
      }
      if (!autoName && (lower.includes('desc') || lower.includes('nom') || lower.includes('art'))) {
        autoName = h.index.toString();
      }
      if (!autoPrice && (lower.includes('precio') || lower.includes('tarifa') || lower.includes('costo') || lower.includes('iva') || lower.includes('$'))) {
        autoPrice = h.index.toString();
      }
    });

    // Fallbacks por posición si no coinciden por nombre
    if (!autoName && headers.length > 1) autoName = '1';
    if (!autoPrice && headers.length > 2) autoPrice = (headers.length - 1).toString();

    setCodeCol(autoCode);
    setNameCol(autoName);
    setPriceCol(autoPrice);
  };

  const handleRowChange = (val: string) => {
    setSelectedRowIndex(val);
    updateHeadersForRow(Number(val));
  };

  const handleConfirm = () => {
    onConfirmMapping(currentHeaders, {
      codeIndex: parseInt(codeCol),
      nameIndex: parseInt(nameCol),
      priceIndex: parseInt(priceCol),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Asignar Columnas del PDF</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* === NUEVO SELECTOR: ELECCIÓN DE LA FILA DE ENCABEZADO === */}
          <div className="flex flex-col gap-1.5 p-2.5 rounded-md border bg-muted/30">
            <label className="text-xs font-semibold text-foreground">
              Línea del Encabezado en el PDF:
            </label>
            <Select onValueChange={handleRowChange} value={selectedRowIndex}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecciona la fila..." />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                {candidateRows.map((row) => (
                  <SelectItem key={row.rowIndex} value={row.rowIndex.toString()} className="text-xs">
                    <span className="font-semibold text-muted-foreground mr-1">
                      Fila #{row.rowIndex + 1}:
                    </span>
                    <span className="truncate">{row.displayText}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            Indica a qué atributo corresponde cada columna de la fila seleccionada:
          </p>

          {/* Columna Nombre */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold">Columna de Descripción / Nombre *:</label>
            <Select onValueChange={setNameCol} value={nameCol}>
              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>
                {currentHeaders.map(h => (
                  <SelectItem key={h.index} value={h.index.toString()}>{h.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Columna Precio */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold">Columna de Precio *:</label>
            <Select onValueChange={setPriceCol} value={priceCol}>
              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>
                {currentHeaders.map(h => (
                  <SelectItem key={h.index} value={h.index.toString()}>{h.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Columna Código */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold">Columna de Código (Opcional):</label>
            <Select onValueChange={setCodeCol} value={codeCol}>
              <SelectTrigger><SelectValue placeholder="Ninguna o Seleccionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="-1">-- Ninguna --</SelectItem>
                {currentHeaders.map(h => (
                  <SelectItem key={h.index} value={h.index.toString()}>{h.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!nameCol || !priceCol}>
            Continuar al Matcheo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}