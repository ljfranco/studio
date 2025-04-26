'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useFirebase } from './FirebaseContext';

interface AuthContextProps {
  user: User | null;
  loading: boolean;
  role: 'user' | 'admin' | null;
}

const AuthContext = createContext<AuthContextProps>({
  user: null,
  loading: true,
  role: null,
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Fetch user role from Firestore
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            setRole(userData.role || 'user'); // Default to 'user' if role not found
          } else {
             // Handle case where user document doesn't exist (optional: create it)
             console.warn(`User document not found for UID: ${currentUser.uid}`);
             setRole('user'); // Default role if doc missing
          }
        } catch (error) {
          console.error("Error fetching user role:", error);
          setRole('user'); // Default role on error
        }
      } else {
        setRole(null); // No user, no role
      }
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [auth, db]);

  return (
    <AuthContext.Provider value={{ user, loading, role }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
