
'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useFirebase } from '@/context/FirebaseContext';
import { Button } from '@/components/ui/button';
import { LogOut, User, ShieldCheck, Home, Settings } from 'lucide-react'; // Added icons
import { useRouter } from 'next/navigation'; // Import useRouter
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"; // Import Avatar components

// Helper to get initials from name
const getInitials = (name?: string | null): string => {
    if (!name) return '??';
    const names = name.split(' ');
    let initials = names[0].substring(0, 1).toUpperCase();
    if (names.length > 1) {
      initials += names[names.length - 1].substring(0, 1).toUpperCase();
    }
    return initials;
};


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
    <nav className="bg-card border-b shadow-sm"> {/* Adjusted background and added border */}
      <div className="container mx-auto px-4 py-2 flex justify-between items-center"> {/* Adjusted padding */}
        <Link href="/" className="text-xl font-bold text-primary hover:text-primary/80 transition-colors">
          Cuenta Clara
        </Link>

        {!loading && (
          <div className="flex items-center space-x-3"> {/* Reduced space */}
            {user ? (
               <DropdownMenu>
                 <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-9 w-9 rounded-full"> {/* Slightly smaller avatar button */}
                        <Avatar className="h-9 w-9"> {/* Match button size */}
                         {/* Add AvatarImage if you have user profile images */}
                         {/* <AvatarImage src={user.photoURL || undefined} alt={user.displayName || 'User'} /> */}
                         <AvatarFallback>{getInitials(user.displayName)}</AvatarFallback>
                        </Avatar>
                    </Button>
                 </DropdownMenuTrigger>
                 <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                        <div className="flex flex-col space-y-1">
                         <p className="text-sm font-medium leading-none">{user.displayName || "Usuario"}</p>
                         <p className="text-xs leading-none text-muted-foreground">
                            {user.email}
                         </p>
                        </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                        <Link href="/">
                         <Home className="mr-2 h-4 w-4" />
                         <span>Dashboard</span>
                        </Link>
                    </DropdownMenuItem>
                    {role === 'admin' && (
                         <DropdownMenuItem asChild>
                           <Link href="/admin">
                             <ShieldCheck className="mr-2 h-4 w-4" />
                             <span>Panel Admin</span>
                           </Link>
                         </DropdownMenuItem>
                    )}
                     <DropdownMenuItem asChild>
                       <Link href="/profile">
                         <Settings className="mr-2 h-4 w-4" />
                         <span>Perfil</span>
                       </Link>
                     </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Salir</span>
                    </DropdownMenuItem>
                 </DropdownMenuContent>
               </DropdownMenu>
            ) : (
               <Link href="/" passHref>
                  <Button variant="outline" size="sm"> {/* Use outline for consistency */}
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
