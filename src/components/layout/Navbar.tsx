'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useFirebase } from '@/context/FirebaseContext';
import { Button } from '@/components/ui/button';
import { LogOut, User, ShieldCheck, Settings, Star, Home } from 'lucide-react'; // Import Star and Home icons
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ALL_FUNCTIONALITIES } from '@/lib/functionalities'; // Import functionalities list
import { ThemeToggle } from './ThemeToggle'; // Import ThemeToggle
import { cn } from '@/lib/utils'; // Import cn for conditional classes

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
  const { user, loading, role, favorites } = useAuth(); // Get favorites from context
  const { auth } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const handleSignOut = async () => {
    try {
      await auth.signOut();
      toast({
          title: "Sesión Cerrada",
          description: "Has cerrado sesión exitosamente.",
      });
      router.push('/');
    } catch (error) {
      console.error("Sign out error:", error);
       toast({
          title: "Error",
          description: "No se pudo cerrar la sesión. Intenta de nuevo.",
          variant: "destructive",
       });
    }
  };

  // Filter functionalities based on user's favorites
  const favoriteFunctionalities = React.useMemo(() => {
    if (!favorites || favorites.length === 0) return [];
    return ALL_FUNCTIONALITIES.filter(func => favorites.includes(func.id));
  }, [favorites]);

  return (
    <nav className="bg-card border-b shadow-sm">
      <div className="container mx-auto px-4 py-2 flex justify-between items-center">
        <Link href="/" className="text-xl font-bold text-primary hover:text-primary/80 transition-colors">
          EasyManage {/* Updated Name */}
        </Link>

        <div className="flex items-center space-x-3">
           {/* Theme Toggle Button */}
           <ThemeToggle />

           {/* Auth related elements */}
           {!loading && (
                <>
                    {user ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                                <Avatar className="h-9 w-9">
                                {/* <AvatarImage src={user.photoURL || undefined} alt={user.displayName || 'User'} /> */}
                                {/* Apply background and text color classes */}
                                <AvatarFallback className="bg-primary text-primary-foreground">
                                    {getInitials(user.displayName)}
                                </AvatarFallback>
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

                            {/* Conditional Menu Items based on role */}
                            {role === 'admin' ? (
                                <>
                                    {/* Admin Panel Link */}
                                    <DropdownMenuItem asChild>
                                    <Link href="/admin">
                                        <ShieldCheck className="mr-2 h-4 w-4" />
                                        <span>Panel Admin</span>
                                    </Link>
                                    </DropdownMenuItem>

                                    {/* User Profile Link (also for admin) */}
                                    <DropdownMenuItem asChild>
                                        <Link href="/profile">
                                            <Settings className="mr-2 h-4 w-4" />
                                            <span>Mi Perfil</span>
                                        </Link>
                                    </DropdownMenuItem>

                                    {/* Favorites Section for Admin */}
                                    {favoriteFunctionalities.length > 0 && (
                                        <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuLabel>Favoritos</DropdownMenuLabel>
                                        {favoriteFunctionalities.map(fav => (
                                            <DropdownMenuItem key={fav.id} asChild>
                                                <Link href={fav.route}>
                                                    {fav.icon && <fav.icon className="mr-2 h-4 w-4"/>}
                                                    <span>{fav.name}</span>
                                                </Link>
                                            </DropdownMenuItem>
                                        ))}
                                        </>
                                    )}
                                </>
                            ) : ( // User role menu items
                                <>
                                    {/* Home Link */}
                                    <DropdownMenuItem asChild>
                                        <Link href="/">
                                            <Home className="mr-2 h-4 w-4" />
                                            <span>Inicio</span>
                                        </Link>
                                    </DropdownMenuItem>

                                    {/* User Profile Link */}
                                    <DropdownMenuItem asChild>
                                        <Link href="/profile">
                                            <Settings className="mr-2 h-4 w-4" />
                                            <span>Mi Perfil</span>
                                        </Link>
                                    </DropdownMenuItem>
                                </>
                            )}


                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer">
                                <LogOut className="mr-2 h-4 w-4" />
                                <span>Salir</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    ) : (
                    <Link href="/" passHref>
                        <Button variant="outline" size="sm">
                            <User className="mr-2 h-4 w-4" />
                            Ingresar / Registrarse
                        </Button>
                    </Link>
                    )}
                </>
            )}
         </div>
      </div>
    </nav>
  );
};
