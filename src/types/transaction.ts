import type { Timestamp } from 'firebase/firestore';

export interface Transaction {
  id: string;
  userId: string;
  type: 'purchase' | 'payment';
  description: string;
  amount: number; // Absolute amount
  balanceAfter: number;
  timestamp: Timestamp | Date; // Allow both Firestore Timestamp and Date object
  addedBy: string; // UID of user who added
  addedByName?: string; // Name/email of user who added
  isAdminAction: boolean;

  // Cancellation fields
  isCancelled?: boolean;
  cancelledAt?: Timestamp | Date;
  cancelledBy?: string; // UID of admin who cancelled
  cancelledByName?: string; // Name/email of admin who cancelled

  // Modification fields
  isModified?: boolean;
  modifiedAt?: Timestamp | Date;
  modifiedBy?: string; // UID of admin who modified
  modifiedByName?: string; // Name/email of admin who modified
  modificationReason?: string; // Optional reason for modification
  originalData?: Omit<Transaction, 'id' | 'originalData' | 'isModified' | 'modifiedAt' | 'modifiedBy' | 'modifiedByName' | 'modificationReason' | 'isCancelled' | 'cancelledAt' | 'cancelledBy' | 'cancelledByName'>; // Store previous state before modification
}
