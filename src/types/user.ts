
import type { Timestamp } from 'firebase/firestore';

export interface UserData {
  id: string; // Corresponds to Firebase Auth UID
  uid?: string; // Redundant but sometimes included
  name: string;
  email: string;
  address?: string;
  phone?: string;
  role: 'user' | 'admin';
  balance: number;
  isEnabled: boolean;
  createdAt?: Timestamp | Date;
  isGeneric?: boolean; // Flag for generic user
}
