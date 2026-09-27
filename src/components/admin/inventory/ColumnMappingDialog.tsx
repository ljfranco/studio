import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { PdfColumnHeader } from '@/lib/documentParsers';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  headers: PdfColumnHeader[];
  onConfirmMapping: (mapping: { codeIndex: number; nameIndex: number; priceIndex: number }) => void;
}

export function ColumnMappingDialog({ open, onOpenChange, headers, onConfirmMapping }: Props) {
  const [codeCol, setCodeCol] = useState<string>('');
  const [nameCol, setNameCol] = useState<string>('');
  const [priceCol, setPriceCol] = useState<string>('');

  const handleConfirm = () => {
    onConfirmMapping({
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
          <p className="text-xs text-muted-foreground">
            Indica a qué atributo corresponde cada columna detectada en el documento:
          </p>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold">Columna de Descripción / Nombre:</label>
            <Select onValueChange={setNameCol} value={nameCol}>
              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>
                {headers.map(h => (
                  <SelectItem key={h.index} value={h.index.toString()}>{h.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold">Columna de Precio:</label>
            <Select onValueChange={setPriceCol} value={priceCol}>
              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>
                {headers.map(h => (
                  <SelectItem key={h.index} value={h.index.toString()}>{h.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold">Columna de Código (Opcional):</label>
            <Select onValueChange={setCodeCol} value={codeCol}>
              <SelectTrigger><SelectValue placeholder="Ninguna o Seleccionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="-1">Ninguna</SelectItem>
                {headers.map(h => (
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