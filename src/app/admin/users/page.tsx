'use client';
import React, { useState } from 'react';
import UserManagementTable from '@/components/admin/UserManagementTable';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, UserPlus } from 'lucide-react';
import SignUpForm from '@/components/auth/SignUpForm';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function AdminUsersPage() {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4 p-6">
      <div className="flex justify-between items-center">
        <Link href="/admin" passHref>
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver al Panel
          </Button>
        </Link>

        {/* MODAL DE CREACIÓN */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <UserPlus className="mr-2 h-4 w-4" /> Nuevo Usuario
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Agregar nuevo usuario al sistema</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <SignUpForm 
                isAdmin={true} 
                onSuccess={() => setOpen(false)} 
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <UserManagementTable />
    </div>
  );
}