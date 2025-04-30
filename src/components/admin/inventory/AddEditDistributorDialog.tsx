
'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useFirebase } from '@/context/FirebaseContext';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
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
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { Distributor } from '@/types/distributor';

// Schema for distributor data
const distributorSchema = z.object({
  name: z.string().min(2, { message: 'El nombre debe tener al menos 2 caracteres.' }).max(100),
  contactPerson: z.string().max(100).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email({ message: 'Correo electrónico inválido.' }).optional().or(z.literal('')), // Allow empty string or valid email
});

type DistributorFormValues = z.infer<typeof distributorSchema>;

interface AddEditDistributorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  distributor?: Distributor | null; // Distributor data for editing
}

const AddEditDistributorDialog: React.FC<AddEditDistributorDialogProps> = ({
  isOpen,
  onClose,
  distributor,
}) => {
  const { db } = useFirebase();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);

  const isEditMode = !!distributor;

  const form = useForm<DistributorFormValues>({
    resolver: zodResolver(distributorSchema),
    defaultValues: {
      name: '',
      contactPerson: '',
      phone: '',
      email: '',
    },
  });

  // Reset form when dialog opens or distributor changes
  useEffect(() => {
    if (isOpen) {
      if (isEditMode && distributor) {
        form.reset({
          name: distributor.name,
          contactPerson: distributor.contactPerson || '',
          phone: distributor.phone || '',
          email: distributor.email || '',
        });
      } else {
        form.reset({
          name: '',
          contactPerson: '',
          phone: '',
          email: '',
        });
      }
    }
  }, [isOpen, distributor, isEditMode, form]);

  // Firestore Mutation
  const mutationFn = async (values: DistributorFormValues) => {
    const data = {
      name: values.name,
      contactPerson: values.contactPerson?.trim() || null,
      phone: values.phone?.trim() || null,
      email: values.email?.trim() || null,
      updatedAt: serverTimestamp(),
    };

    if (isEditMode && distributor) {
      const distributorRef = doc(db, 'distributors', distributor.id);
      await updateDoc(distributorRef, data);
    } else {
      await addDoc(collection(db, 'distributors'), {
        ...data,
        createdAt: serverTimestamp(),
      });
    }
  };

  const mutation = useMutation({
    mutationFn,
    onSuccess: () => {
      toast({
        title: '¡Éxito!',
        description: `Distribuidor ${isEditMode ? 'actualizado' : 'agregado'} correctamente.`,
      });
      queryClient.invalidateQueries({ queryKey: ['distributors'] });
      queryClient.invalidateQueries({ queryKey: ['products'] }); // Invalidate products too, as PriceList uses distributor names
      onClose();
    },
    onError: (error) => {
      console.error("Error saving distributor:", error);
      toast({
        title: 'Error',
        description: `No se pudo guardar el distribuidor. ${error instanceof Error ? error.message : String(error)}`,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setIsSaving(false);
    }
  });

  const onSubmit = (values: DistributorFormValues) => {
    setIsSaving(true);
    mutation.mutate(values);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Editar Distribuidor' : 'Agregar Nuevo Distribuidor'}</DialogTitle>
          <DialogDescription>
            {isEditMode ? 'Modifica los detalles del distribuidor.' : 'Ingresa los detalles del nuevo distribuidor.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del Distribuidor</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Distribuidora del Sol" {...field} disabled={isSaving} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="contactPerson"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Persona de Contacto (Opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Juan Pérez" {...field} disabled={isSaving} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Teléfono (Opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="+54 9 11..." {...field} disabled={isSaving} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email (Opcional)</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="contacto@distribuidora.com" {...field} disabled={isSaving} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isSaving}>
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isSaving} className="bg-primary hover:bg-primary/90">
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isEditMode ? 'Guardar Cambios' : 'Agregar Distribuidor')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AddEditDistributorDialog;
