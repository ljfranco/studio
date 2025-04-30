
'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useFirebase } from '@/context/FirebaseContext';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PlusCircle, Pencil, Trash2 } from 'lucide-react';
import AddEditDistributorDialog from './AddEditDistributorDialog'; // Import the dialog
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"; // For delete confirmation
import { useToast } from '@/hooks/use-toast';
import type { Distributor } from '@/types/distributor';

// Fetch distributors function
const fetchDistributors = async (db: any): Promise<Distributor[]> => {
  const distributorsCol = collection(db, 'distributors');
  const snapshot = await getDocs(distributorsCol);
  return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Distributor)).sort((a, b) => a.name.localeCompare(b.name)); // Sort by name
};

// Delete distributor function
const deleteDistributor = async (db: any, distributorId: string) => {
  const distributorDocRef = doc(db, 'distributors', distributorId);
  await deleteDoc(distributorDocRef);
  // TODO: Consider implications for product purchase prices?
  // Maybe add a check or warning if the distributor has prices associated with products.
  // For simplicity now, we just delete the distributor.
};

const DistributorManagement: React.FC = () => {
  const { db } = useFirebase();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isAddEditDialogOpen, setIsAddEditDialogOpen] = useState(false);
  const [selectedDistributor, setSelectedDistributor] = useState<Distributor | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [distributorToDelete, setDistributorToDelete] = useState<Distributor | null>(null);

  // Fetch distributors using React Query
  const { data: distributors = [], isLoading, error } = useQuery<Distributor[]>({
    queryKey: ['distributors'],
    queryFn: () => fetchDistributors(db),
  });

  // Mutation for deleting a distributor
  const deleteMutation = useMutation({
    mutationFn: (distributorId: string) => deleteDistributor(db, distributorId),
    onSuccess: () => {
      toast({ title: 'Éxito', description: 'Distribuidor eliminado correctamente.' });
      queryClient.invalidateQueries({ queryKey: ['distributors'] }); // Refetch distributors
      queryClient.invalidateQueries({ queryKey: ['products'] }); // Refetch products as prices might change display
      setIsDeleteDialogOpen(false);
      setDistributorToDelete(null);
    },
    onError: (err) => {
      console.error("Error deleting distributor:", err);
      toast({ title: 'Error', description: `No se pudo eliminar el distribuidor. ${err instanceof Error ? err.message : ''}`, variant: 'destructive' });
      setIsDeleteDialogOpen(false);
      setDistributorToDelete(null);
    },
  });

  const handleAddDistributor = () => {
    setSelectedDistributor(null);
    setIsAddEditDialogOpen(true);
  };

  const handleEditDistributor = (distributor: Distributor) => {
    setSelectedDistributor(distributor);
    setIsAddEditDialogOpen(true);
  };

  const openDeleteDialog = (distributor: Distributor) => {
    setDistributorToDelete(distributor);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (distributorToDelete) {
      deleteMutation.mutate(distributorToDelete.id);
    }
  };

  if (error) {
    return <p className="text-center text-destructive">Error al cargar distribuidores: {error instanceof Error ? error.message : 'Error desconocido'}</p>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Distribuidores</CardTitle>
          <CardDescription>Gestiona tus proveedores de productos.</CardDescription>
        </div>
        <Button onClick={handleAddDistributor}>
          <PlusCircle className="mr-2 h-4 w-4" /> Agregar Distribuidor
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center h-20"><LoadingSpinner /></div>
        ) : distributors.length === 0 ? (
          <p className="text-center text-muted-foreground">No hay distribuidores registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {distributors.map((dist) => (
                  <TableRow key={dist.id}>
                    <TableCell className="font-medium">{dist.name}</TableCell>
                    <TableCell>{dist.contactPerson || '-'}</TableCell>
                    <TableCell>{dist.phone || '-'}</TableCell>
                    <TableCell>{dist.email || '-'}</TableCell>
                    <TableCell className="text-center space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEditDistributor(dist)}
                        title={`Editar ${dist.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive/90"
                        onClick={() => openDeleteDialog(dist)}
                        title={`Eliminar ${dist.name}`}
                        disabled={deleteMutation.isPending && distributorToDelete?.id === dist.id}
                      >
                         {deleteMutation.isPending && distributorToDelete?.id === dist.id ? <LoadingSpinner size="sm"/> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Add/Edit Dialog */}
      <AddEditDistributorDialog
        isOpen={isAddEditDialogOpen}
        onClose={() => setIsAddEditDialogOpen(false)}
        distributor={selectedDistributor}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar Eliminación?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de eliminar al distribuidor "{distributorToDelete?.name}". Esta acción también eliminará sus precios de compra asociados en la lista de precios. ¿Estás seguro?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDeleteDialogOpen(false)} disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? <LoadingSpinner size="sm" className="mr-2"/> : 'Sí, Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default DistributorManagement;
