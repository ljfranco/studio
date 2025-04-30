
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
import { UserCheck, UserX, ShieldAlert, Edit } from 'lucide-react'; // Icons for actions
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
import { useToast } from '@/hooks/use-toast';

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
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (!adminUser || adminRole !== 'admin') {
      setLoadingData(false);
      return;
    }

    setLoadingData(true);
    const usersColRef = collection(db, 'users');
    // Order by name, you can change this if needed
    const q = query(usersColRef, orderBy('name'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedUsers = querySnapshot.docs
        .map(doc => ({
          id: doc.id,
          name: doc.data().name || 'N/A',
          address: doc.data().address || '-', // Handle potentially missing field
          phone: doc.data().phone || '-', // Handle potentially missing field
          email: doc.data().email || 'N/A',
          role: doc.data().role || 'user',
          isEnabled: doc.data().isEnabled !== undefined ? doc.data().isEnabled : true, // Default to true if missing
        } as UserData))
        .filter(u => u.id !== adminUser.uid); // Exclude the current admin user

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

    setIsUpdating(true);
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
      setIsUpdating(false);
    }
  };

  const openConfirmationDialog = (user: UserData, type: 'enable' | 'disable') => {
    setSelectedUser(user);
    setActionType(type);
    setDialogOpen(true);
  };

   // Placeholder function for role management - to be implemented later
   const handleManageRoles = (user: UserData) => {
    toast({
      title: 'Próximamente',
      description: `La gestión de roles para ${user.name} estará disponible pronto.`,
    });
    // Here you would typically open a dialog or navigate to a role management page
  };


  if (authLoading || loadingData) {
    return <div className="flex justify-center items-center h-[calc(100vh-15rem)]"><LoadingSpinner size="lg" /></div>;
  }

  if (!adminUser || adminRole !== 'admin') {
    return <p className="text-center text-destructive">Acceso denegado.</p>;
  }

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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Dirección</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.address}</TableCell>
                      <TableCell>{user.phone}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                         <Badge variant={user.role === 'admin' ? 'destructive' : 'secondary'} className="capitalize">
                           {user.role}
                         </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.isEnabled ? 'default' : 'outline'} className={user.isEnabled ? 'bg-green-600 text-white' : ''}>
                          {user.isEnabled ? 'Habilitado' : 'Deshabilitado'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center space-x-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 ${user.isEnabled ? 'text-destructive hover:text-destructive/90' : 'text-green-600 hover:text-green-700'}`}
                          onClick={() => openConfirmationDialog(user, user.isEnabled ? 'disable' : 'enable')}
                          title={user.isEnabled ? 'Deshabilitar Usuario' : 'Habilitar Usuario'}
                        >
                          {user.isEnabled ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                        </Button>
                         <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-primary hover:text-primary/90"
                          onClick={() => handleManageRoles(user)}
                          title="Gestionar Roles"
                          disabled // Disable until implemented
                        >
                          <ShieldAlert className="h-4 w-4" />
                        </Button>
                        {/* Add Edit User button maybe later
                         <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-blue-600 hover:text-blue-700"
                          // onClick={() => handleEditUser(user)} // To be implemented
                          title="Editar Usuario"
                          disabled // Disable until implemented
                        >
                          <Edit className="h-4 w-4" />
                        </Button> */}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
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
            <AlertDialogCancel onClick={() => setDialogOpen(false)} disabled={isUpdating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleUserStatus}
              disabled={isUpdating}
              className={actionType === 'disable' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : 'bg-green-600 text-white hover:bg-green-700'}
            >
              {isUpdating ? <LoadingSpinner size="sm" className="mr-2"/> : (actionType === 'disable' ? 'Sí, Deshabilitar' : 'Sí, Habilitar')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default UserManagementTable;
