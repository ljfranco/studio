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
  const [selectedRowIndex, setSelectedRowIndex] = useState<string>('0');
  const [currentHeaders, setCurrentHeaders] = useState<PdfColumnHeader[]>([]);

  const [codeCol, setCodeCol] = useState<string>('-1');
  const [nameCol, setNameCol] = useState<string>('');
  const [priceCol, setPriceCol] = useState<string>('');

  useEffect(() => {
    if (candidateRows.length > 0) {
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

  const updateHeadersForRow = (rowIndex: number) => {
    const row = candidateRows[rowIndex];
    if (!row) return;

    const headers = buildHeadersFromSelectedRow(row.items);
    setCurrentHeaders(headers);

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
      {/* 1. overflow-hidden y ancho explícito para que el modal no se ensanche */}
      <DialogContent className="w-full max-w-lg sm:max-w-xl overflow-hidden p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Asignar Columnas del PDF</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 w-full min-w-0">
          {/* SELECTOR DE FILA: min-w-0 y w-full obligan a respetar el contenedor */}
          <div className="flex flex-col gap-1.5 p-3 rounded-md border bg-muted/30 w-full min-w-0">
            <label className="text-xs font-semibold text-foreground">
              Línea del Encabezado en el PDF:
            </label>
            <Select onValueChange={handleRowChange} value={selectedRowIndex}>
              <SelectTrigger className="w-full min-w-0 h-9 text-xs truncate">
                <SelectValue placeholder="Selecciona la fila..." />
              </SelectTrigger>
              <SelectContent className="max-h-56 max-w-[calc(100vw-40px)] sm:max-w-lg">
                {candidateRows.map((row) => (
                  <SelectItem 
                    key={row.rowIndex} 
                    value={row.rowIndex.toString()} 
                    className="text-xs cursor-pointer"
                  >
                    <div className="flex items-center min-w-0 max-w-full">
                      <span className="font-semibold text-muted-foreground mr-1.5 shrink-0">
                        #{row.rowIndex + 1}:
                      </span>
                      {/* Truncar con elipsis si la concatenación de columnas es excesiva */}
                      <span className="truncate max-w-[340px] sm:max-w-[420px]" title={row.displayText}>
                        {row.displayText}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            Indica a qué atributo corresponde cada columna de la fila seleccionada:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full min-w-0">
            {/* Columna Nombre */}
            <div className="flex flex-col gap-1.5 min-w-0">
              <label className="text-xs font-semibold truncate">Descripción / Nombre *:</label>
              <Select onValueChange={setNameCol} value={nameCol}>
                <SelectTrigger className="w-full min-w-0 h-9 text-xs truncate">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {currentHeaders.map(h => (
                    <SelectItem key={h.index} value={h.index.toString()} className="text-xs">
                      <span className="truncate max-w-[200px]" title={h.label}>{h.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Columna Precio */}
            <div className="flex flex-col gap-1.5 min-w-0">
              <label className="text-xs font-semibold truncate">Precio *:</label>
              <Select onValueChange={setPriceCol} value={priceCol}>
                <SelectTrigger className="w-full min-w-0 h-9 text-xs truncate">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {currentHeaders.map(h => (
                    <SelectItem key={h.index} value={h.index.toString()} className="text-xs">
                      <span className="truncate max-w-[200px]" title={h.label}>{h.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Columna Código */}
            <div className="flex flex-col gap-1.5 min-w-0">
              <label className="text-xs font-semibold truncate">Código (Opcional):</label>
              <Select onValueChange={setCodeCol} value={codeCol}>
                <SelectTrigger className="w-full min-w-0 h-9 text-xs truncate">
                  <SelectValue placeholder="Ninguna..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="-1" className="text-xs italic text-muted-foreground">
                    -- Ninguna --
                  </SelectItem>
                  {currentHeaders.map(h => (
                    <SelectItem key={h.index} value={h.index.toString()} className="text-xs">
                      <span className="truncate max-w-[200px]" title={h.label}>{h.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!nameCol || !priceCol}>
            Continuar al Matcheo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}