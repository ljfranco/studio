
'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore'; // Import Firestore functions
import { useFirebase } from '@/context/FirebaseContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { sendPasswordReset } from '@/lib/firebaseAuthHelpers';

const signInSchema = z.object({
  email: z.string().email({ message: 'Correo electrónico inválido.' }),
  password: z.string().min(6, { message: 'La contraseña debe tener al menos 6 caracteres.' }),
});

type SignInFormValues = z.infer<typeof signInSchema>;

const SignInForm: React.FC = () => {
  const { auth, db } = useFirebase(); // Get Firestore instance
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (values: SignInFormValues) => {
    setIsLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, values.email, values.password);
      const user = userCredential.user;

      // **Check if user is enabled in Firestore**
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists() && userDocSnap.data()?.isEnabled === false) {
        // User exists but is disabled
        await auth.signOut(); // Sign the user out immediately
        toast({
          title: 'Acceso Denegado',
          description: 'Tu cuenta ha sido deshabilitada por un administrador.',
          variant: 'destructive',
        });
        setIsLoading(false); // Set loading false explicitly
        return; // Stop further execution
      }

      // If enabled or doc doesn't exist (should not happen with current signup flow)
      toast({
        title: '¡Éxito!',
        description: 'Has ingresado correctamente.',
      });
      setIsLoading(false); // Set loading false on success

    } catch (error: any) {
      console.error("Sign in error:", error);
      let errorMessage = 'Error al ingresar. Verifica tus credenciales.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMessage = 'Correo electrónico o contraseña incorrectos.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'El formato del correo electrónico no es válido.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Error de red. Por favor, revisa tu conexión.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Demasiados intentos fallidos. Intenta más tarde.';
      }
      // Add other specific error codes if needed

      toast({
        title: 'Error de Ingreso',
        description: errorMessage,
        variant: 'destructive',
      });
      setIsLoading(false); // Set loading false on error
    }
    // Removed finally block to explicitly handle isLoading in each branch
  };

  const handlePasswordReset = async () => {
    const email = form.getValues('email');
    if (!email) {
      toast({
        title: 'Correo requerido',
        description: 'Por favor, ingresá tu correo electrónico para recuperar tu contraseña.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await sendPasswordReset(auth, email);
      toast({
        title: 'Correo enviado',
        description: 'Te enviamos un enlace para restablecer tu contraseña.',
      });
    } catch (error: any) {
      console.error("Password reset error:", error);
      let message = 'Ocurrió un error al enviar el correo.';

      if (error.code === 'auth/user-not-found') {
        message = 'No existe una cuenta con ese correo.';
      }

      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    }
  };


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Correo Electrónico</FormLabel>
              <FormControl>
                <Input placeholder="tu@email.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contraseña</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="text-right">
          <button
            type="button"
            onClick={handlePasswordReset}
            className="text-sm text-primary underline hover:opacity-80"
          >
            ¿Olvidaste tu contraseña?
          </button>
        </div>
        <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={isLoading}>
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Ingresar'}
        </Button>
      </form>
    </Form>
  );
};

export default SignInForm;
