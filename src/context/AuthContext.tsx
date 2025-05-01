'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore'; // Added onSnapshot
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
  const unsubscribeUserDocRef = useRef<(() => void) | null>(null); // Ref to hold the user doc unsubscribe function

  useEffect(() => {
    console.log("AuthContext: Setting up onAuthStateChanged listener.");
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
       console.log("AuthContext: Auth state changed. User:", currentUser?.uid);
      setUser(currentUser);

      // Clean up previous user doc listener if it exists
      if (unsubscribeUserDocRef.current) {
        console.log("AuthContext: Cleaning up previous user doc listener.");
        unsubscribeUserDocRef.current();
        unsubscribeUserDocRef.current = null;
      }

      if (currentUser) {
        // Fetch user role and favorites from Firestore and listen for changes
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          console.log(`AuthContext: Setting up snapshot listener for user ${currentUser.uid}`);

          // Subscribe to user document changes
          unsubscribeUserDocRef.current = onSnapshot(userDocRef, (userDocSnap) => {
             console.log(`AuthContext: Snapshot received for user ${currentUser.uid}. Exists:`, userDocSnap.exists());
            if (userDocSnap.exists()) {
              const userData = userDocSnap.data() as UserData; // Cast to UserData
              const newRole = userData.role || 'user';
              const newFavorites = userData.favorites || [];

              // Update state only if values have actually changed
              setRole(prevRole => {
                if (newRole !== prevRole) {
                   console.log(`AuthContext: Role updated for ${currentUser.uid}:`, newRole);
                  return newRole;
                }
                return prevRole;
              });

              setFavorites(prevFavorites => {
                 // Use JSON comparison for simplicity, ensure consistent order if possible
                 // or use a deep comparison library for more robust checking.
                 const stringifiedNew = JSON.stringify(newFavorites.sort());
                 const stringifiedOld = JSON.stringify((prevFavorites || []).sort());
                 if (stringifiedNew !== stringifiedOld) {
                    console.log(`AuthContext: Favorites updated for ${currentUser.uid}:`, newFavorites);
                    return newFavorites;
                 }
                 return prevFavorites;
              });

            } else {
              console.warn(`AuthContext: User document not found for UID: ${currentUser.uid}`);
              setRole('user'); // Default role
              setFavorites([]); // Default favorites
            }
          }, (error) => { // Add error handling for the snapshot listener
             console.error(`AuthContext: Error in snapshot listener for user ${currentUser.uid}:`, error);
             setRole('user'); // Default role on error
             setFavorites([]); // Default favorites on error
          });

        } catch (error) {
          console.error("AuthContext: Error setting up snapshot listener:", error);
          setRole('user');
          setFavorites([]);
        } finally {
             // Ensure loading is set to false once initial data fetch attempt is done for the logged-in user
             if(loading) setLoading(false);
        }
      } else {
        // No user logged in
        setRole(null);
        setFavorites(null);
        setLoading(false); // Set loading false if no user
      }
    });

    // Cleanup auth subscription on component unmount
    return () => {
        console.log("AuthContext: Cleaning up auth state listener.");
        unsubscribeAuth();
        // Clean up user doc listener if it's still active
        if (unsubscribeUserDocRef.current) {
            console.log("AuthContext: Cleaning up user doc listener on unmount.");
            unsubscribeUserDocRef.current();
            unsubscribeUserDocRef.current = null;
        }
    };
  // Only depend on auth and db which are stable references from Firebase context
  }, [auth, db]);

  return (
    <AuthContext.Provider value={{ user, loading, role, favorites }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
