import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "@/components/ui/dialog";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updates: any[];
  products: any[];
  onConfirm: (selectedUpdates: any[]) => void;
  loading: boolean;
  selectedDistributorId: string;
}

export function PreviewDialog({
  open,
  onOpenChange,
  updates = [],
  products = [],
  onConfirm,
  loading,
  selectedDistributorId,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (updates && updates.length > 0) {
      setSelectedIds(updates.map((u: any) => u.id));
    } else {
      setSelectedIds([]);
    }
  }, [updates]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === updates.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(updates.map((u: any) => u.id));
    }
  };

  const handleConfirm = () => {
    const filteredUpdates = updates.filter((u: any) => selectedIds.includes(u.id));
    onConfirm(filteredUpdates);
  };

  const isAllSelected = updates.length > 0 && selectedIds.length === updates.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[88vh] flex flex-col p-6">
        <DialogHeader className="pb-2 flex-shrink-0">
          <DialogTitle className="text-xl font-bold">
            Verificar conciliación de precios y productos
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Revisa el emparejamiento entre la descripción del archivo y tu catálogo antes de aplicar cambios en la base de datos.
          </p>
        </DialogHeader>

        {/* CONTENEDOR CON SCROLL ÚNICO Y ALTURA DELIMITADA */}
        <div className="relative flex-1 min-h-0 overflow-y-auto border rounded-md my-2 shadow-sm [&>div]:overflow-visible">
          <Table className="relative w-full border-collapse">
            {/* CABECERA FIJA: Delega sticky y fondo opaco a cada th hijo */}
            <TableHeader className="sticky top-0 z-30 shadow-sm [&_th]:sticky [&_th]:top-0 [&_th]:bg-slate-900 dark:[&_th]:bg-slate-800">
              <TableRow className="hover:bg-transparent border-slate-700">
                <TableHead className="w-10 text-slate-100">
                  <Checkbox 
                    checked={isAllSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Seleccionar todos"
                    className="border-slate-300 data-[state=checked]:bg-indigo-500 data-[state=checked]:border-indigo-500"
                  />
                </TableHead>
                <TableHead className="min-w-[220px] font-bold text-slate-100 text-xs uppercase tracking-wider">
                  Texto en Archivo
                </TableHead>
                <TableHead className="min-w-[210px] font-bold text-slate-100 text-xs uppercase tracking-wider">
                  Tu Producto en Catálogo
                </TableHead>
                <TableHead className="text-right font-bold text-slate-100 text-xs uppercase tracking-wider">
                  Precio Actual
                </TableHead>
                <TableHead className="w-8 text-center text-slate-100"></TableHead>
                <TableHead className="text-right font-bold text-slate-100 text-xs uppercase tracking-wider">
                  Nuevo Precio
                </TableHead>
                <TableHead className="text-center font-bold text-slate-100 text-xs uppercase tracking-wider">
                  Variación
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {updates.map((update: any, index: number) => {
                const product = products.find((p: any) => p.id === update.id);
                const currentPrice = product?.purchasePrices?.[selectedDistributorId] ?? 0;
                const diff = update.newPrice - currentPrice;
                const percentage = currentPrice > 0 ? (diff / currentPrice) * 100 : 0;
                const isSelected = selectedIds.includes(update.id);

                return (
                  <TableRow 
                    key={`${update.id}-${index}`} 
                    className={cn(
                      "transition-opacity",
                      !isSelected && "opacity-40 bg-muted/20"
                    )}
                  >
                    {/* Checkbox */}
                    <TableCell>
                      <Checkbox 
                        checked={isSelected} 
                        onCheckedChange={() => toggleSelect(update.id)} 
                      />
                    </TableCell>

                    {/* PRODUCTO DETECTADO EN ARCHIVO */}
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold text-sm text-foreground leading-snug">
                          {update.supplierName || '—'}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {update.supplierCode && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">
                              Cód: {update.supplierCode}
                            </span>
                          )}
                          {update.matchType === 'codigo' ? (
                            <Badge variant="outline" className="text-[10px] py-0 text-emerald-600 border-emerald-300 bg-emerald-50">
                              <CheckCircle2 className="h-2.5 w-2.5 mr-1 inline" /> Código Exacto
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] py-0 text-blue-600 border-blue-200 bg-blue-50">
                              <Sparkles className="h-2.5 w-2.5 mr-1 inline" /> {update.confidence}% Similitud
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* PRODUCTO DEL CATÁLOGO */}
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-md text-foreground leading-snug">
                          {product?.name || update.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono mt-0.5">
                          ID: {update.id}
                        </span>
                      </div>
                    </TableCell>

                    {/* Precio Actual */}
                    <TableCell className="text-right text-md text-muted-foreground font-medium tabular-nums">
                      {currentPrice > 0 ? `$ ${currentPrice.toLocaleString()}` : <span className="italic text-md">Sin Dato</span>}
                    </TableCell>

                    <TableCell className="text-center p-0">
                      <ArrowRight className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                    </TableCell>

                    {/* Nuevo Precio */}
                    <TableCell className="text-right font-black text-md text-foreground tracking-tight tabular-nums">
                      $ {update.newPrice.toLocaleString()}
                    </TableCell>

                    {/* BADGE DE VARIACIÓN */}
                    <TableCell className="text-center">
                      {currentPrice === 0 ? (
                        <Badge variant="secondary" className="text-[12px] bg-slate-100 text-slate-700 border">
                          Nuevo
                        </Badge>
                      ) : percentage > 1 ? (
                        <Badge 
                          variant="outline" 
                          className="text-[12px] font-semibold bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900"
                        >
                          +{percentage.toFixed(1)}%
                        </Badge>
                      ) : percentage < -1 ? (
                        <Badge 
                          variant="outline" 
                          className="text-[12px] font-semibold bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900"
                        >
                          {percentage.toFixed(1)}%
                        </Badge>
                      ) : (
                        <Badge 
                          variant="secondary" 
                          className="text-[12px] font-medium bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                        >
                          {percentage > 0 ? "+" : ""}{percentage.toFixed(1)}%
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="pt-2 flex-shrink-0 flex items-center justify-between sm:justify-between w-full">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Descartar
          </Button>

          <Button 
            onClick={handleConfirm} 
            disabled={loading || selectedIds.length === 0}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {loading ? "Actualizando..." : `Actualizar ${selectedIds.length} ${selectedIds.length === 1 ? 'producto' : 'productos'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}