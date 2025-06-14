
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useFirebase } from '@/context/FirebaseContext';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { UserCheck, UserX, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react'; // Added Role Icons
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"; // Import DropdownMenu
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils'; // Import cn

interface UserData {
  id: string;
  name: string;
  address?: string; // Optional field
  phone?: string; // Optional field
  email: string;
  role: 'user' | 'admin';
  isEnabled: boolean; // Status field
}

const UserManagementTable: React.FC = () => {
  const { user: adminUser, loading: authLoading, role: adminRole } = useAuth();
  const { db } = useFirebase();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [actionType, setActionType] = useState<'enable' | 'disable' | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false); // Renamed for clarity
  const [isUpdatingRole, setIsUpdatingRole] = useState(false); // State for role update

  useEffect(() => {
    if (!adminUser || adminRole !== 'admin') {
      setLoadingData(false);
      return;
    }

    setLoadingData(true);
    const usersColRef = collection(db, 'users');
    const q = query(usersColRef, orderBy('name'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedUsers = querySnapshot.docs
        .map(doc => ({
          id: doc.id,
          name: doc.data().name || 'N/A',
          address: doc.data().address || '-',
          phone: doc.data().phone || '-',
          email: doc.data().email || 'N/A',
          role: doc.data().role || 'user',
          isEnabled: doc.data().isEnabled !== undefined ? doc.data().isEnabled : true,
        } as UserData))
        .filter(u => u.id !== adminUser.uid);

      setUsers(fetchedUsers);
      setLoadingData(false);
    }, (error) => {
      console.error("Error fetching users:", error);
      toast({ title: 'Error', description: 'No se pudieron cargar los usuarios.', variant: 'destructive' });
      setUsers([]);
      setLoadingData(false);
    });

    return () => unsubscribe();
  }, [adminUser, adminRole, db, toast]);

  const handleToggleUserStatus = async () => {
    if (!selectedUser || actionType === null) return;

    setIsUpdatingStatus(true);
    const newStatus = actionType === 'enable';
    const userDocRef = doc(db, 'users', selectedUser.id);

    try {
      await updateDoc(userDocRef, { isEnabled: newStatus });
      toast({
        title: 'Éxito',
        description: `Usuario ${selectedUser.name} ${newStatus ? 'habilitado' : 'deshabilitado'}.`,
      });
      setDialogOpen(false);
      setSelectedUser(null);
      setActionType(null);
    } catch (error) {
      console.error(`Error updating user status for ${selectedUser.id}:`, error);
      toast({
        title: 'Error',
        description: `No se pudo actualizar el estado del usuario. ${error instanceof Error ? error.message : ''}`,
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

   const handleSetRole = async (userId: string, userName: string, newRole: 'user' | 'admin') => {
    if (isUpdatingRole) return; // Prevent double clicks

    setIsUpdatingRole(true);
    const userDocRef = doc(db, 'users', userId);

    try {
      await updateDoc(userDocRef, { role: newRole });
      toast({
        title: 'Éxito',
        description: `Rol de ${userName} actualizado a ${newRole === 'admin' ? 'Administrador' : 'Usuario'}.`,
      });
    } catch (error) {
      console.error(`Error updating role for ${userId}:`, error);
      toast({
        title: 'Error',
        description: `No se pudo actualizar el rol del usuario. ${error instanceof Error ? error.message : ''}`,
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const openConfirmationDialog = (user: UserData, type: 'enable' | 'disable') => {
    setSelectedUser(user);
    setActionType(type);
    setDialogOpen(true);
  };


  if (authLoading || loadingData) {
    return <div className="flex justify-center items-center h-[calc(100vh-15rem)]"><LoadingSpinner size="lg" /></div>;
  }

  if (!adminUser || adminRole !== 'admin') {
    return <p className="text-center text-destructive">Acceso denegado.</p>;
  }

  const isUpdating = isUpdatingStatus || isUpdatingRole; // Combine loading states

  return (
    <>
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-2xl">Gestionar Usuarios</CardTitle>
          <CardDescription>Administra la información, estado y roles de los usuarios.</CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-center text-muted-foreground">No hay otros usuarios registrados.</p>
          ) : (
            <div className="overflow-x-auto"> {/* Added overflow-x-auto */}
              <Table className="min-w-full"> {/* Added min-w-full */}
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[150px]">Nombre</TableHead> {/* Added min-width */}
                    <TableHead className="min-w-[200px]">Dirección</TableHead> {/* Added min-width */}
                    <TableHead className="min-w-[120px]">Teléfono</TableHead> {/* Added min-width */}
                    <TableHead>Rol</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-center min-w-[100px]">Acciones</TableHead> {/* Added min-width */}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium whitespace-nowrap">{user.name}</TableCell> {/* Added whitespace-nowrap */}
                      <TableCell className="whitespace-nowrap">{user.address}</TableCell> {/* Added whitespace-nowrap */}
                      <TableCell className="whitespace-nowrap">{user.phone}</TableCell> {/* Added whitespace-nowrap */}
                      <TableCell>
                         <Badge variant={user.role === 'admin' ? 'destructive' : 'secondary'} className="capitalize">
                            {user.role === 'admin' ? 'Admin' : 'Usuario'}
                         </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.isEnabled ? 'default' : 'outline'} className={cn(user.isEnabled ? 'bg-green-600 text-white' : '', "whitespace-nowrap")}> {/* Added whitespace-nowrap */}
                          {user.isEnabled ? 'Habilitado' : 'Deshabilitado'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center space-x-1">
                        {/* Enable/Disable Button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 ${user.isEnabled ? 'text-destructive hover:text-destructive/90' : 'text-green-600 hover:text-green-700'}`}
                          onClick={() => openConfirmationDialog(user, user.isEnabled ? 'disable' : 'enable')}
                          title={user.isEnabled ? 'Deshabilitar Usuario' : 'Habilitar Usuario'}
                          disabled={isUpdating} // Disable during any update
                        >
                          {user.isEnabled ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                        </Button>

                         {/* Role Management Dropdown */}
                         <DropdownMenu>
                           <DropdownMenuTrigger asChild disabled={isUpdating}>
                               <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-primary hover:text-primary/90"
                                title="Gestionar Roles"
                                disabled={isUpdating} // Disable during any update
                               >
                                <ShieldAlert className="h-4 w-4" />
                               </Button>
                           </DropdownMenuTrigger>
                           <DropdownMenuContent align="end">
                             {user.role !== 'admin' && (
                               <DropdownMenuItem
                                 onSelect={() => handleSetRole(user.id, user.name, 'admin')}
                                 disabled={isUpdatingRole}
                               >
                                <ShieldCheck className="mr-2 h-4 w-4" />
                                Hacer Administrador
                               </DropdownMenuItem>
                             )}
                             {user.role !== 'user' && (
                               <DropdownMenuItem
                                 onSelect={() => handleSetRole(user.id, user.name, 'user')}
                                 disabled={isUpdatingRole}
                               >
                                 <ShieldX className="mr-2 h-4 w-4" />
                                 Hacer Usuario
                               </DropdownMenuItem>
                             )}
                           </DropdownMenuContent>
                         </DropdownMenu>

                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog for Enable/Disable */}
      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar Acción?</AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === 'disable'
                ? `¿Estás seguro de que quieres deshabilitar al usuario ${selectedUser?.name}? El usuario no podrá iniciar sesión.`
                : `¿Estás seguro de que quieres habilitar al usuario ${selectedUser?.name}? El usuario podrá volver a iniciar sesión.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDialogOpen(false)} disabled={isUpdatingStatus}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleUserStatus}
              disabled={isUpdatingStatus}
              className={cn(actionType === 'disable' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : 'bg-green-600 text-white hover:bg-green-700')}
            >
              {isUpdatingStatus ? <LoadingSpinner size="sm" className="mr-2"/> : (actionType === 'disable' ? 'Sí, Deshabilitar' : 'Sí, Habilitar')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default UserManagementTable;

