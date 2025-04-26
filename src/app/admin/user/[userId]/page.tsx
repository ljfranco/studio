
import React from 'react';
import UserDetailView from '@/components/admin/UserDetailView';

// This page component receives the userId from the URL parameters
export default function UserDetailPage({ params }: { params: { userId: string } }) {
  const { userId } = params;

  // Pass the userId to the UserDetailView component
  return <UserDetailView userId={userId} />;
}
