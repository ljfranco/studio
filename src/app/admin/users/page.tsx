
import React from 'react';
import UserManagementTable from '@/components/admin/UserManagementTable'; // Import the new component
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

// Page for User Management, rendering the UserManagementTable
export default function AdminUsersPage() {
  return (
    <div className="space-y-4">
      <Link href="/admin" passHref>
        <Button variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver al Panel
        </Button>
      </Link>
      <UserManagementTable />
    </div>
  );
}
