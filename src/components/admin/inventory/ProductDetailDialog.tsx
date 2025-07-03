'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatCurrency, cn } from '@/lib/utils';
import type { Product } from '@/types/product';
import type { Distributor } from '@/types/distributor';
import { Ban } from 'lucide-react';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';

interface ProductDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  distributors: Distributor[];
}

const ProductDetailDialog: React.FC<ProductDetailDialogProps> = ({
  isOpen,
  onClose,
  product,
  distributors,
}) => {
  if (!product) return null;

  const calculateSuggestedPrice = (p: Product): number | null => {
    if (p.lastPurchasePrice === undefined || p.lastPurchasePrice === null || p.margin === undefined || p.margin === null) {
      return null;
    }
    const marginMultiplier = 1 + (p.margin / 100);
    return p.lastPurchasePrice * marginMultiplier;
  };

  const suggestedPrice = calculateSuggestedPrice(product);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
          <DialogDescription>Detalles completos del producto.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 items-center gap-4">
            <p className="text-sm font-medium">Código:</p>
            <p className="text-sm font-mono text-right">{product.id}</p>
          </div>
          <div className="grid grid-cols-2 items-center gap-4">
            <p className="text-sm font-medium">Cantidad en Stock:</p>
            <p className="text-sm text-right">{product.quantity ?? 0}</p>
          </div>
          <div className="grid grid-cols-2 items-center gap-4">
            <p className="text-sm font-medium">Stock Mínimo:</p>
            <p className="text-sm text-right">{product.minStock ?? 0}</p>
          </div>
          <div className="grid grid-cols-2 items-center gap-4">
            <p className="text-sm font-medium">Último Precio de Compra:</p>
            <p className="text-sm text-right">{formatCurrency(product.lastPurchasePrice ?? 0)}</p>
          </div>
          <div className="grid grid-cols-2 items-center gap-4">
            <p className="text-sm font-medium">Margen:</p>
            <p className="text-sm text-right">{product.margin ?? 0}%</p>
          </div>
          <div className="grid grid-cols-2 items-center gap-4">
            <p className="text-sm font-medium">Precio de Venta Sugerido:</p>
            <p className="text-sm text-right text-blue-600">
              {suggestedPrice !== null ? formatCurrency(suggestedPrice) : 'N/A'}
            </p>
          </div>
          <div className="grid grid-cols-2 items-center gap-4">
            <p className="text-sm font-medium">Precio de Venta:</p>
            <p className="text-lg font-bold text-right text-primary">{formatCurrency(product.sellingPrice ?? 0)}</p>
          </div>

          <h4 className="text-md font-semibold mt-4">Precios por Distribuidor:</h4>
          {distributors.length > 0 ? (
            <Table>
              <TableBody>
                {distributors.map(dist => {
                  const purchasePrice = product.purchasePrices?.[dist.id];
                  return (
                    <TableRow key={dist.id}>
                      <TableCell className="font-medium py-1">{dist.name}</TableCell>
                      <TableCell className="text-right py-1">
                        {purchasePrice !== undefined && purchasePrice !== null ? formatCurrency(purchasePrice) : <Ban className="h-4 w-4 mx-auto text-muted-foreground" />}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No hay distribuidores registrados.</p>
          )}
        </div>
        <Button onClick={onClose} className="w-full mt-4">Cerrar</Button>
      </DialogContent>
    </Dialog>
  );
};

export default ProductDetailDialog;