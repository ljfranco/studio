
import type { Timestamp } from 'firebase/firestore';

export interface PurchasePrice {
  distributorId: string;
  price: number;
}

export interface Product {
  id: string; // Corresponds to barcode
  name: string;
  quantity: number;
  sellingPrice: number;
  purchasePrices?: Record<string, number>; // Map of distributorId -> purchase price
  createdAt?: Timestamp | Date;
  updatedAt?: Timestamp | Date;
}
