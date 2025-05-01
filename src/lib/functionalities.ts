
import type { LucideIcon } from 'lucide-react';
import { Users, ListChecks, Package, FileText, LineChart, Receipt, Settings, Home, ShoppingCart, Banknote, Truck, CalendarDays } from 'lucide-react';

export interface AppFunctionality {
  id: string; // Unique identifier
  name: string; // Display name
  route: string; // Next.js route
  icon: LucideIcon; // Lucide icon component
  requiredRole: 'user' | 'admin' | 'any'; // Role needed to access
}

// Define all possible functionalities, including sub-pages that can be favorited
export const ALL_FUNCTIONALITIES: AppFunctionality[] = [
    // Admin specific sections/pages
    // { id: 'admin-panel', name: 'Panel Admin', route: '/admin', icon: Home, requiredRole: 'admin' }, // Removed as per request
    { id: 'manage-users', name: 'Gestionar Usuarios', route: '/admin/users', icon: Users, requiredRole: 'admin' },
    { id: 'view-accounts', name: 'Estados de Cuenta', route: '/admin/accounts', icon: ListChecks, requiredRole: 'admin' },
    { id: 'manage-inventory', name: 'Inventario y Precios', route: '/admin/inventory', icon: Package, requiredRole: 'admin' }, // Main Inventory page
    // { id: 'register-transactions', name: 'Registrar Transacciones (General)', route: '/admin/transactions', icon: FileText, requiredRole: 'admin' }, // Keep or remove? Removing parent for now.
    { id: 'sales-detail', name: 'Detalle de Ventas', route: '/admin/sales-detail', icon: Receipt, requiredRole: 'admin' },
    // { id: 'view-reports', name: 'Reportes', route: '/admin/reports', icon: LineChart, requiredRole: 'admin' },

    // Specific Transaction Actions (Sub-functionalities)
    { id: 'register-sale', name: 'Registrar Venta', route: '/admin/transactions/sale', icon: ShoppingCart, requiredRole: 'admin' },
    { id: 'register-collection', name: 'Registrar Cobranza', route: '/admin/transactions/collection', icon: Banknote, requiredRole: 'admin' },
    { id: 'register-purchase', name: 'Registrar Compra Stock', route: '/admin/transactions/purchase', icon: Truck, requiredRole: 'admin' },
    { id: 'daily-sales', name: 'Ventas del Día', route: '/admin/transactions/daily-sales', icon: CalendarDays, requiredRole: 'admin' },


    // User specific (can also be accessed by admin)
    // { id: 'user-dashboard', name: 'Mi Cuenta', route: '/', icon: Home, requiredRole: 'user' }, // Removed

    // Any role
    // { id: 'user-profile', name: 'Mi Perfil', route: '/profile', icon: Settings, requiredRole: 'any' }, // Removed as per request
];

// Function to get functionalities accessible by the current user's role
export const getAccessibleFunctionalities = (role: 'user' | 'admin' | null): AppFunctionality[] => {
    if (!role) return []; // No role, no accessible functionalities

    // Filter based on role, excluding 'user-profile' and 'admin-panel' explicitly if they were still here
    return ALL_FUNCTIONALITIES.filter(func => {
         // Always exclude user-profile from being favoritable
        if (func.id === 'user-profile') return false;
        // Check role access
        return func.requiredRole === 'any' || func.requiredRole === role;
    });
};
