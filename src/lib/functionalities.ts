
import type { LucideIcon } from 'lucide-react';
import { Users, ListChecks, Package, FileText, LineChart, Receipt, Settings, Home } from 'lucide-react';

export interface AppFunctionality {
  id: string; // Unique identifier
  name: string; // Display name
  route: string; // Next.js route
  icon: LucideIcon; // Lucide icon component
  requiredRole: 'user' | 'admin' | 'any'; // Role needed to access
}

export const ALL_FUNCTIONALITIES: AppFunctionality[] = [
    // Admin specific
    { id: 'admin-panel', name: 'Panel Admin', route: '/admin', icon: Home, requiredRole: 'admin' },
    { id: 'manage-users', name: 'Gestionar Usuarios', route: '/admin/users', icon: Users, requiredRole: 'admin' },
    { id: 'view-accounts', name: 'Estados de Cuenta', route: '/admin/accounts', icon: ListChecks, requiredRole: 'admin' },
    { id: 'manage-inventory', name: 'Inventario Productos', route: '/admin/inventory', icon: Package, requiredRole: 'admin' },
    { id: 'register-transactions', name: 'Registrar Transacciones', route: '/admin/transactions', icon: FileText, requiredRole: 'admin' },
    { id: 'sales-detail', name: 'Detalle de Ventas', route: '/admin/sales-detail', icon: Receipt, requiredRole: 'admin' },
    // { id: 'view-reports', name: 'Reportes', route: '/admin/reports', icon: LineChart, requiredRole: 'admin' },

    // User specific (can also be accessed by admin)
    // Removed User Dashboard as main entry point is /
    // { id: 'user-dashboard', name: 'Mi Cuenta', route: '/', icon: Home, requiredRole: 'user' },

    // Any role
    { id: 'user-profile', name: 'Mi Perfil', route: '/profile', icon: Settings, requiredRole: 'any' },
];

export const getAccessibleFunctionalities = (role: 'user' | 'admin' | null): AppFunctionality[] => {
    if (!role) return [];
    return ALL_FUNCTIONALITIES.filter(func =>
        func.requiredRole === 'any' || func.requiredRole === role
    );
};
