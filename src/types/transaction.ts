
import type { Timestamp } from 'firebase/firestore';

// Define the structure for individual items within a sale
export interface SaleDetail {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
}

export interface Transaction {
  id: string;
  userId: string;
  type: 'purchase' | 'payment';
  description: string;
  amount: number; // Absolute amount (total for sales, payment amount for payments)
  balanceAfter: number;
  timestamp: Timestamp | Date; // Allow both Firestore Timestamp and Date object
  addedBy: string; // UID of user who added
  addedByName?: string; // Name/email of user who added
  isAdminAction: boolean;

  // Sale specific details (optional)
  saleDetails?: SaleDetail[]; // Array of items sold

  // Cancellation fields
  isCancelled?: boolean;
  cancelledAt?: Timestamp | Date | null; // Allow null when not cancelled
  cancelledBy?: string | null; // UID of admin who cancelled
  cancelledByName?: string | null; // Name/email of admin who cancelled
  cancellationReason?: string | null; // Optional reason for cancellation

  // Modification fields
  isModified?: boolean;
  modifiedAt?: Timestamp | Date | null; // Allow null
  modifiedBy?: string | null; // UID of admin who modified
  modifiedByName?: string | null; // Name/email of admin who modified
  modificationReason?: string | null; // Optional reason for modification
  originalData?: Omit<Transaction, 'id' | 'originalData' | 'isModified' | 'modifiedAt' | 'modifiedBy' | 'modifiedByName' | 'modificationReason' | 'isCancelled' | 'cancelledAt' | 'cancelledBy' | 'cancelledByName' | 'cancellationReason' | 'isRestored' | 'restoredAt' | 'restoredBy' | 'restoredByName' | 'saleDetails'> | null; // Store previous state before modification

  // Restoration fields
  isRestored?: boolean;
  restoredAt?: Timestamp | Date | null; // Allow null
  restoredBy?: string | null; // UID of admin who restored
  restoredByName?: string | null; // Name/email of admin who restored
}

