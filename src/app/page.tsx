'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import UserDashboard from '@/components/dashboard/UserDashboard';
import AdminDashboard from '@/components/dashboard/AdminDashboard';
import AuthPage from '@/components/auth/AuthPage';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export default function Home() {
  const { user, loading, role } = useAuth();

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><LoadingSpinner size="lg" /></div>;
  }

  if (!user) {
    return <AuthPage />;
  }

  // Render AdminDashboard if the user role is 'admin'
  if (role === 'admin') {
    return <AdminDashboard />;
  }

  // Render UserDashboard for users with the 'user' role
  if (role === 'user') {
    return <UserDashboard />;
  }

  // Fallback or handle other roles if necessary
  // For now, default to showing nothing or an error if role is unexpected
  return <p className="text-center text-muted-foreground">Rol de usuario no reconocido.</p>;

}
