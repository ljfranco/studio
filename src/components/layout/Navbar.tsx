'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useFirebase } from '@/context/FirebaseContext';
import { Button } from '@/components/ui/button';
import { LogOut, User, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation'; // Import useRouter
import { useToast } from '@/hooks/use-toast';

export const Navbar: React.FC = () => {
  const { user, loading, role } = useAuth();
  const { auth } = useFirebase();
  const router = useRouter(); // Get router instance
  const { toast } = useToast();

  const handleSignOut = async () => {
    try {
      await auth.signOut();
      toast({
          title: "Sesión Cerrada",
          description: "Has cerrado sesión exitosamente.",
      });
      router.push('/'); // Redirect to home page after sign out
    } catch (error) {
      console.error("Sign out error:", error);
       toast({
          title: "Error",
          description: "No se pudo cerrar la sesión. Intenta de nuevo.",
          variant: "destructive",
       });
    }
  };

  return (
    <nav className="bg-secondary shadow-md">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <Link href="/" className="text-xl font-bold text-primary hover:text-primary/80 transition-colors">
          Cuenta Clara
        </Link>

        {!loading && (
          <div className="flex items-center space-x-4">
            {user && role === 'admin' && (
               <Link href="/admin" passHref>
                 <Button variant="ghost" size="sm">
                   <ShieldCheck className="mr-2 h-4 w-4" /> Admin Panel
                 </Button>
               </Link>
            )}
            {user ? (
               <>
                 <span className="text-sm text-muted-foreground hidden sm:inline">
                    Hola, {user.displayName || user.email}
                 </span>
                 <Button onClick={handleSignOut} variant="outline" size="sm">
                   <LogOut className="mr-2 h-4 w-4" />
                   Salir
                 </Button>
               </>
            ) : (
               <Link href="/" passHref>
                  <Button variant="default" size="sm">
                     <User className="mr-2 h-4 w-4" />
                     Ingresar / Registrarse
                  </Button>
               </Link>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};
