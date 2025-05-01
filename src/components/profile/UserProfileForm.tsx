
'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/context/AuthContext';
import { useFirebase } from '@/context/FirebaseContext';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth'; // To update auth profile display name
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import type { UserData } from '@/types/user';

// Schema for profile update validation
const profileSchema = z.object({
  name: z.string().min(2, { message: 'El nombre debe tener al menos 2 caracteres.' }).max(50),
  address: z.string().max(150, 'La dirección no puede exceder los 150 caracteres.').optional().or(z.literal('')),
  phone: z.string().max(30, 'El teléfono no puede exceder los 30 caracteres.').optional().or(z.literal('')),
  // Email is usually not editable directly by the user through this form
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const UserProfileForm: React.FC = () => {
  const { user, loading: authLoading, role } = useAuth();
  const { db, auth } = useFirebase();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      address: '',
      phone: '',
    },
  });

  // Fetch current user data
  useEffect(() => {
    const fetchUserData = async () => {
      if (!user) {
         setLoadingData(false);
         return;
      }
      setLoadingData(true);
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data() as UserData;
          form.reset({
            name: data.name || user.displayName || '',
            address: data.address || '',
            phone: data.phone || '',
          });
        } else {
          // Fallback if Firestore doc doesn't exist (should ideally not happen)
           form.reset({
             name: user.displayName || '',
             address: '',
             phone: '',
          });
          console.warn("User document not found in Firestore for profile.");
        }
      } catch (error) {
        console.error("Error fetching user profile data:", error);
        toast({
          title: 'Error',
          description: 'No se pudo cargar tu información de perfil.',
          variant: 'destructive',
        });
      } finally {
        setLoadingData(false);
      }
    };

    if (!authLoading) { // Fetch only when auth state is resolved
         fetchUserData();
    }
  }, [user, db, form, toast, authLoading]);

  const onSubmit = async (values: ProfileFormValues) => {
    if (!user) return;
    setIsLoading(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const updateData: Partial<UserData> = {
        name: values.name,
        address: values.address?.trim() || null,
        phone: values.phone?.trim() || null,
        // No role update here, only personal info
        updatedAt: serverTimestamp(),
      };

       // Remove null fields before updating to avoid overwriting with null if they didn't exist
       Object.keys(updateData).forEach(key => (updateData as any)[key] === null && delete (updateData as any)[key]);

      await updateDoc(userDocRef, updateData);

      // Update Firebase Auth profile display name if it changed
      if (auth.currentUser && auth.currentUser.displayName !== values.name) {
         await updateProfile(auth.currentUser, { displayName: values.name });
          // Optionally, force refresh AuthContext or trigger a re-fetch if needed
          // You might need to implement a mechanism in AuthContext to refresh user state
          console.log("Auth profile display name updated.");
      }

      toast({
        title: '¡Éxito!',
        description: 'Tu perfil ha sido actualizado.',
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar tu perfil. Intenta de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };


  if (authLoading || loadingData) {
     return <div className="flex justify-center p-10"><LoadingSpinner /></div>;
  }

   if (!user) {
    return <p className="text-center text-destructive">Necesitas iniciar sesión para ver tu perfil.</p>;
  }


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre Completo</FormLabel>
              <FormControl>
                <Input placeholder="Tu Nombre" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
         <FormItem>
            <FormLabel>Correo Electrónico</FormLabel>
            <FormControl>
                 <Input type="email" value={user.email || ''} disabled readOnly className="bg-muted cursor-not-allowed"/>
            </FormControl>
             <p className="text-xs text-muted-foreground">El correo electrónico no se puede modificar.</p>
         </FormItem>

         <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Dirección (Opcional)</FormLabel>
              <FormControl>
                <Input placeholder="Calle Falsa 123" {...field} value={field.value ?? ''} />
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
                <Input placeholder="+54 9 11 12345678" {...field} value={field.value ?? ''}/>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end pt-4">
            <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={isLoading || loadingData}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Guardar Cambios
            </Button>
        </div>
      </form>
    </Form>
  );
};

export default UserProfileForm;
