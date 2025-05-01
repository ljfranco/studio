
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useFirebase } from './FirebaseContext';
import type { UserData } from '@/types/user'; // Import UserData type

interface AuthContextProps {
  user: User | null;
  loading: boolean;
  role: 'user' | 'admin' | null;
  favorites: string[] | null; // Add favorites array
}

const AuthContext = createContext<AuthContextProps>({
  user: null,
  loading: true,
  role: null,
  favorites: null, // Initialize favorites as null
});

export const useAuth = () => useContext(AuthContext);

interface AuthProviderProps {
  children: ReactNode;
}

const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const { auth, db } = useFirebase();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<'user' | 'admin' | null>(null);
  const [favorites, setFavorites] = useState<string[] | null>(null); // State for favorites

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Fetch user role and favorites from Firestore
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data() as UserData; // Cast to UserData
            setRole(userData.role || 'user');
            setFavorites(userData.favorites || []); // Get favorites or default to empty array
          } else {
             console.warn(`User document not found for UID: ${currentUser.uid}`);
             setRole('user');
             setFavorites([]); // Default if doc missing
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
          setRole('user');
          setFavorites([]); // Default on error
        }
      } else {
        setRole(null);
        setFavorites(null); // No user, no role or favorites
      }
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [auth, db]);

  return (
    <AuthContext.Provider value={{ user, loading, role, favorites }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
