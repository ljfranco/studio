
import React from 'react';
import UserProfileForm from '@/components/profile/UserProfileForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

// Page for User Profile Management
export default function ProfilePage() {
  return (
    <div className="flex justify-center pt-8">
       <Card className="w-full max-w-2xl shadow-md">
            <CardHeader>
                <CardTitle className="text-2xl">Tu Perfil</CardTitle>
                <CardDescription>
                    Visualiza y actualiza tu información personal.
                </CardDescription>
            </CardHeader>
            <CardContent>
                 <UserProfileForm />
            </CardContent>
        </Card>
    </div>
  );
}
