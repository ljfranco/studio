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

  // Placeholder for role-based routing/component rendering
  // In a real app, you'd likely fetch the user's role from Firestore
  // based on their UID after authentication.
  // For now, we assume a 'user' role if logged in.
  // The admin view would be accessible via a specific route or determined server-side.

  // Example: Check if the user is an admin (this logic needs implementation)
  // const isAdmin = role === 'admin'; // Fetch role from Firestore or claims

  // For now, default to UserDashboard if logged in
  // Admin view will be added later via routing e.g., /admin
   return <UserDashboard />;
 //  if (role === 'admin') {
 //    return <AdminDashboard />; // Render Admin Dashboard if role is admin
 //  } else {
 //    return <UserDashboard />; // Render User Dashboard for regular users
 //  }
}
