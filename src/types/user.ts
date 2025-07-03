
import type { Timestamp, FieldValue } from 'firebase/firestore';

export interface UserData {
  id: string; // Corresponds to Firebase Auth UID
  uid?: string; // Redundant but sometimes included
  name: string;
  email: string;
  address?: string | null;
  phone?: string | null;
  role: 'user' | 'admin';
  balance: number;
  isEnabled: boolean;
  createdAt?: Timestamp | Date;
  isGeneric?: boolean; // Flag for generic user
  favorites?: string[]; // Array of favorite functionality IDs
  updatedAt?: Timestamp | Date | FieldValue; // Added for tracking last update time
}
