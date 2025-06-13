'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/context/AuthContext';
import { useFirebase } from '@/context/FirebaseContext';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox'; // Import Checkbox
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Star } from 'lucide-react'; // Added Star
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
import { getAccessibleFunctionalities, AppFunctionality } from '@/lib/functionalities'; // Import functionalities and helper

// Schema for profile update validation including favorites
const profileSchema = z.object({
  name: z.string().min(2, { message: 'El nombre debe tener al menos 2 caracteres.' }).max(50),
  address: z.string().max(150, 'La dirección no puede exceder los 150 caracteres.').optional().or(z.literal('')),
  phone: z.string().max(30, 'El teléfono no puede exceder los 30 caracteres.').optional().or(z.literal('')),
  favorites: z.array(z.string()).optional(), // Array of functionality IDs
  businessName: z.string().max(100).optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const UserProfileForm: React.FC = () => {
  const { user, loading: authLoading, role, favorites: currentFavorites } = useAuth();
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
      favorites: [], // Initialize favorites
    },
  });

  // Get functionalities accessible by the current user's role
  const accessibleFunctionalities = useMemo(() => getAccessibleFunctionalities(role), [role]);

  // Fetch current user data and populate form
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
            favorites: data.favorites || [], // Populate favorites from Firestore
          });
        } else {
          form.reset({
            name: user.displayName || '',
            address: '',
            phone: '',
            favorites: [], // Default empty favorites
          });
          console.warn("User document not found in Firestore for profile.");
        }
        if (role === 'admin') {
          const appSettingsRef = doc(db, 'appSettings', 'businessName');
          const appSettingsSnap = await getDoc(appSettingsRef);
          if (appSettingsSnap.exists()) {
            const appSettingsData = appSettingsSnap.data();
            form.setValue('businessName', appSettingsData.name || '');
          }
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

    if (!authLoading) {
      fetchUserData();
    }
    // Add currentFavorites to dependencies to react to external changes if needed
  }, [user, db, form, toast, authLoading, currentFavorites]);

  const onSubmit = async (values: ProfileFormValues) => {
    if (!user) return;
    setIsLoading(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      // Make sure favorites is always an array, even if undefined from form values
      const favoritesToSave = values.favorites || [];
      const updateData: Partial<UserData> & { favorites: string[] } = { // Ensure favorites is included
        name: values.name,
        address: values.address?.trim() || null,
        phone: values.phone?.trim() || null,
        favorites: favoritesToSave, // Save the selected favorites
        updatedAt: serverTimestamp(),
      };

      // Remove null fields before updating
      Object.keys(updateData).forEach(key => {
        if ((updateData as any)[key] === null) {
          delete (updateData as any)[key];
        }
      });


      await updateDoc(userDocRef, updateData);

      if (role === 'admin' && values.businessName?.trim()) {
        const appSettingsRef = doc(db, 'appSettings', 'businessName');
        await updateDoc(appSettingsRef, {
          name: values.businessName.trim(),
        });
      }


      // Update Firebase Auth profile display name if it changed
      if (auth.currentUser && auth.currentUser.displayName !== values.name) {
        await updateProfile(auth.currentUser, { displayName: values.name });
        console.log("Auth profile display name updated.");
        // Trigger a refresh of AuthContext data (implementation depends on AuthContext)
        // For now, a page refresh might be needed or implement refresh in AuthContext
      }

      toast({
        title: '¡Éxito!',
        description: 'Tu perfil ha sido actualizado.',
      });
      // The AuthContext listener should now automatically pick up the changes in the user document (including favorites)
      // and update the context state, causing the Navbar to re-render with the new favorites.

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
        {/* Personal Info Fields */}
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
            <Input type="email" value={user.email || ''} disabled readOnly className="bg-muted cursor-not-allowed" />
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
                <Input placeholder="+54 9 11 12345678" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <hr className="my-6" />

        {role === 'admin' && (
          <FormField
            control={form.control}
            name="businessName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre del Negocio</FormLabel>
                <FormControl>
                  <Input placeholder="Ej: EasyManage" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}


        <hr className="my-6" />

        {/* Favorite Functionalities Section */}
        <div>
          <h3 className="text-lg font-medium mb-3">Funcionalidades Favoritas</h3>
          <p className="text-sm text-muted-foreground mb-4">Selecciona las funciones que usas con más frecuencia para un acceso rápido desde el menú.</p>
          <FormField
            control={form.control}
            name="favorites"
            render={() => (
              <FormItem className="space-y-3">
                {accessibleFunctionalities.map((item) => (
                  <FormField
                    key={item.id}
                    control={form.control}
                    name="favorites"
                    render={({ field }) => {
                      return (
                        <FormItem
                          key={item.id}
                          className="flex flex-row items-center space-x-3 space-y-0 p-3 border rounded-md hover:bg-accent/50"
                        >
                          <FormControl>
                            <Checkbox
                              checked={field.value?.includes(item.id)}
                              onCheckedChange={(checked) => {
                                return checked
                                  ? field.onChange([...(field.value || []), item.id])
                                  : field.onChange(
                                    (field.value || []).filter(
                                      (value) => value !== item.id
                                    )
                                  )
                              }}
                            />
                          </FormControl>
                          <div className='flex items-center gap-2'>
                            <item.icon className="h-4 w-4 text-muted-foreground" />
                            <FormLabel className="font-normal cursor-pointer">
                              {item.name}
                            </FormLabel>
                          </div>
                        </FormItem>
                      )
                    }}
                  />
                ))}
                <FormMessage />
              </FormItem>
            )}
          />
        </div>


        <div className="flex justify-end pt-4 border-t mt-6">
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
