
import type { Timestamp } from 'firebase/firestore';

export interface Distributor {
  id: string;
  name: string;
  contactPerson?: string; // Optional
  phone?: string; // Optional
  email?: string; // Optional
  createdAt?: Timestamp | Date;
  updatedAt?: Timestamp | Date;
}
