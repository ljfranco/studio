
import React from 'react';
import AdminDashboard from '@/components/dashboard/AdminDashboard';

// This page will render the AdminDashboard component
// Access control should happen within the AdminDashboard or via middleware/layout checks

export default function AdminPage() {
  return <AdminDashboard />;
}
