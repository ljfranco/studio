
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react'; // Added useMemo
import { useAuth } from '@/context/AuthContext';
import { useFirebase } from '@/context/FirebaseContext';
import { collection, query, where, orderBy, onSnapshot, Timestamp, getDocs, doc, writeBatch, getDoc } from 'firebase/firestore'; // Removed startOfDay/endOfDay from firestore imports
import { format, startOfDay, endOfDay } from 'date-fns'; // Import startOfDay and endOfDay from date-fns
import { es } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { formatCurrency, cn } from '@/lib/utils';
import { Pencil, Trash2, ShoppingBag, Info, RotateCcw, RefreshCw, DollarSign } from 'lucide-react'; // Added DollarSign
import SaleForm from './SaleForm'; // For editing
import CancelTransactionDialog from '../CancelTransactionDialog'; // For cancelling
import RestoreTransactionDialog from '../RestoreTransactionDialog'; // For restoring
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog'; // Added DialogClose
import { useToast } from '@/hooks/use-toast';
import type { Transaction, SaleDetail } from '@/types/transaction';
import type { UserData } from '@/types/user'; // Import UserData type
import { Card, CardContent } from '@/components/ui/card'; // Import Card for total display


// --- Helper function to get user names ---
const fetchUserNames = async (db: any, userIds: string[]): Promise<Record<string, string>> => {
    if (userIds.length === 0) return {};
    const userMap: Record<string, string> = {};
    // Fetch in chunks if necessary, but for daily sales, the list might be manageable
    const usersRef = collection(db, 'users');
    // Firestore 'in' query supports up to 30 elements per query
    // For larger lists, chunk the userIds array
    const MAX_IDS_PER_QUERY = 30;
    for (let i = 0; i < userIds.length; i += MAX_IDS_PER_QUERY) {
        const chunk = userIds.slice(i, i + MAX_IDS_PER_QUERY);
        if (chunk.length > 0) {
            const q = query(usersRef, where('__name__', 'in', chunk)); // '__name__' is the document ID field
            const userSnap = await getDocs(q);
            userSnap.forEach(doc => {
                userMap[doc.id] = doc.data().name || 'N/A';
            });
        }
    }

    return userMap;
};


const DailySalesList: React.FC = () => {
    const { user: adminUser, role } = useAuth();
    const { db } = useFirebase();
    const { toast } = useToast();
    const [sales, setSales] = useState<Transaction[]>([]);
    const [userNames, setUserNames] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [isRecalculating, setIsRecalculating] = useState(false);

    const [isEditSaleDialogOpen, setIsEditSaleDialogOpen] = useState(false);
    const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
    const [isRestoreDialogOpen, setIsRestoreDialogOpen] = useState(false);
    const [isSaleDetailOpen, setIsSaleDetailOpen] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

    // Memoize startOfToday and endOfToday
    const todayRange = useMemo(() => {
        const today = new Date();
        return {
            start: startOfDay(today),
            end: endOfDay(today),
        };
    }, []); // Empty dependency array means this runs only once on mount

    const startOfToday = todayRange.start;
    const endOfToday = todayRange.end;

    // Effect to fetch daily sales using snapshot listener
    useEffect(() => {
        if (!adminUser || role !== 'admin') {
            setLoading(false);
            return;
        }

        setLoading(true);
        console.log("Setting up snapshot listener for daily sales...");

        const transactionsColRef = collection(db, 'transactions');
        // Use memoized startOfToday and endOfToday in the query
        const q = query(
            transactionsColRef,
            where('timestamp', '>=', Timestamp.fromDate(startOfToday)),
            where('timestamp', '<=', Timestamp.fromDate(endOfToday)),
            where('type', '==', 'purchase'), // Filter for purchases (sales are type purchase for user)
            orderBy('timestamp', 'desc') // Order by most recent first
        );

        const unsubscribe = onSnapshot(q, async (querySnapshot) => {
            console.log(`Snapshot received with ${querySnapshot.docs.length} docs for daily sales.`);
            const fetchedSales = querySnapshot.docs
                .map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                } as Transaction))
                .filter(tx => tx.saleDetails && tx.saleDetails.length > 0); // Ensure it's a sale transaction

            // Set sales state - this might be the source of the loop if not handled carefully
            // Let's ensure we only update if the data actually changes shallowly
            setSales(currentSales => {
                 // Simple check: if lengths differ or IDs differ, update
                 if (fetchedSales.length !== currentSales.length ||
                     fetchedSales.some((sale, index) => sale.id !== currentSales[index]?.id) ||
                     // Add a check for modification/cancellation status if needed
                     fetchedSales.some((sale, index) => sale.isCancelled !== currentSales[index]?.isCancelled || sale.isModified !== currentSales[index]?.isModified)
                 ) {
                    console.log("Sales data changed, updating state.");
                    return fetchedSales;
                 }
                 console.log("Sales data hasn't changed, skipping state update.");
                 return currentSales; // Return previous state if no change detected
            });


            // Fetch user names for the sales
            const userIds = Array.from(new Set(fetchedSales.map(sale => sale.userId)));
             if (userIds.length > 0) {
                 try {
                    console.log("Fetching names for user IDs:", userIds);
                    const names = await fetchUserNames(db, userIds);
                    // Set user names state only if it changes to avoid potential loops
                    setUserNames(currentNames => {
                        if (JSON.stringify(names) !== JSON.stringify(currentNames)) {
                             console.log("Updating user names state.");
                             return names;
                        }
                        console.log("User names haven't changed, skipping state update.");
                        return currentNames;
                    });
                 } catch (fetchError) {
                     console.error("Error fetching user names:", fetchError);
                     toast({ title: 'Error', description: 'No se pudieron cargar los nombres de los clientes.', variant: 'destructive' });
                 }
             } else {
                 setUserNames({}); // Clear names if no sales
             }

            setLoading(false);
        }, (error) => {
            console.error("Error in snapshot listener for daily sales:", error);
            toast({ title: 'Error', description: 'Error al actualizar las ventas del día.', variant: 'destructive' });
            setSales([]); // Clear sales on error
            setUserNames({});
            setLoading(false);
        });

        // Cleanup function
        return () => {
            console.log("Unsubscribing from daily sales snapshot listener.");
            unsubscribe();
        };
        // Only depend on stable values now
    }, [db, adminUser, role, startOfToday, endOfToday, toast]);


    // --- Calculate Total Sales ---
    const totalSalesAmount = useMemo(() => {
        return sales
            .filter(sale => !sale.isCancelled) // Only include non-cancelled sales
            .reduce((sum, sale) => sum + sale.amount, 0);
    }, [sales]); // Recalculate whenever sales change


    // --- Recalculate Balance for Affected Users ---
    const recalculateBalancesForAffectedUsers = useCallback(async (affectedUserIds: string[], showToast: boolean = true) => {
        if (!db || !adminUser || role !== 'admin' || affectedUserIds.length === 0) return;

        setIsRecalculating(true);
        const uniqueUserIds = Array.from(new Set(affectedUserIds));
        console.log(`Recalculating balances for users: ${uniqueUserIds.join(', ')}`);

        try {
            const batch = writeBatch(db); // Use a batch for efficiency

            for (const userId of uniqueUserIds) {
                const transactionsColRef = collection(db, 'transactions');
                const q = query(transactionsColRef, where('userId', '==', userId), orderBy('timestamp', 'asc'));
                const querySnapshot = await getDocs(q);

                let currentBalance = 0;

                querySnapshot.forEach((docSnap) => {
                    const transaction = { id: docSnap.id, ...docSnap.data() } as Transaction;
                    let transactionAmount = 0;

                    if (!transaction.isCancelled) {
                        transactionAmount = transaction.type === 'purchase' ? -transaction.amount : transaction.amount;
                    }
                    currentBalance += transactionAmount;

                    if (transaction.balanceAfter !== currentBalance) {
                        batch.update(docSnap.ref, { balanceAfter: currentBalance });
                    }
                });

                const userDocRef = doc(db, 'users', userId);
                // Check if user doc exists before updating (optional, but safer)
                 const userSnap = await getDoc(userDocRef); // Read outside batch for check
                 if (userSnap.exists()) {
                    // Only update if the balance is actually different
                    if (userSnap.data().balance !== currentBalance) {
                         batch.update(userDocRef, { balance: currentBalance }); // Update final balance on user doc
                    }
                 } else {
                      console.warn(`User document ${userId} not found during batch balance update.`);
                 }
            }

            await batch.commit();

            if (showToast) {
                toast({
                    title: "Éxito",
                    description: `Saldos recalculados para ${uniqueUserIds.length} usuario(s).`,
                });
            }
            console.log("Recalculation complete for affected users.");

        } catch (error) {
            console.error("Error recalculating balances:", error);
            if (showToast) {
                toast({
                    title: "Error",
                    description: `No se pudo recalcular todos los saldos. ${error instanceof Error ? error.message : String(error)}`,
                    variant: "destructive",
                });
            }
        } finally {
            setIsRecalculating(false);
        }
    }, [db, toast, adminUser, role]);


    // --- Action Handlers ---
    const handleEditSale = (transaction: Transaction) => {
        setSelectedTransaction(transaction);
        setIsEditSaleDialogOpen(true);
    };

    const handleCancel = (transaction: Transaction) => {
        setSelectedTransaction(transaction);
        setIsCancelDialogOpen(true);
    };

    const handleRestore = (transaction: Transaction) => {
        if (!transaction.isCancelled) return;
        setSelectedTransaction(transaction);
        setIsRestoreDialogOpen(true);
    };

    const handleOpenSaleDetail = (transaction: Transaction) => {
        setSelectedTransaction(transaction);
        setIsSaleDetailOpen(true);
    };

    const handleDialogClose = () => {
        setIsEditSaleDialogOpen(false);
        setIsCancelDialogOpen(false);
        setIsRestoreDialogOpen(false);
        setIsSaleDetailOpen(false);
        setSelectedTransaction(null);
    };

    // --- Success Callback for Dialogs ---
     const handleActionSuccess = useCallback(() => {
         if (selectedTransaction) {
             // Trigger recalculation *after* dialog closes and state updates from listener
             // Use a small timeout to ensure Firestore listener has likely updated sales state
             setTimeout(() => {
                console.log("Action successful, triggering recalculation...");
                recalculateBalancesForAffectedUsers([selectedTransaction.userId], false);
             }, 100); // Adjust delay if needed
         }
         // No need to manually refetch sales here, the snapshot listener will update the state
         handleDialogClose(); // Ensure dialog closes after action
     }, [selectedTransaction, recalculateBalancesForAffectedUsers, handleDialogClose]);


    if (loading) {
        return <div className="flex justify-center items-center h-40"><LoadingSpinner size="lg" /></div>;
    }

    if (!adminUser || role !== 'admin') {
        return <p className="text-center text-destructive">Acceso denegado.</p>;
    }


    return (
        <>
            <div className="flex justify-between items-start mb-4 gap-4">
                {/* Recalculate Button */}
                <Button onClick={() => recalculateBalancesForAffectedUsers(sales.map(s => s.userId), true)} variant="outline" disabled={isRecalculating} className="shrink-0">
                    {isRecalculating ? <LoadingSpinner size="sm" className="mr-2" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Recalcular Saldos
                </Button>

                 {/* Total Sales Display */}
                 <Card className="bg-primary/10 border-primary flex-grow">
                    <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-primary">Total Ventas del Día (Confirmadas)</p>
                             <DollarSign className="h-5 w-5 text-primary" />
                        </div>
                        <p className="text-2xl font-bold text-primary">{formatCurrency(totalSalesAmount)}</p>
                    </CardContent>
                </Card>
            </div>


            {sales.length === 0 && !loading ? (
                <p className="text-center text-muted-foreground mt-6">No se registraron ventas hoy.</p>
             ) : (
                <div className="overflow-x-auto border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Hora</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Descripción</TableHead>
                                <TableHead className="text-right">Monto</TableHead>
                                <TableHead className="text-center">Estado</TableHead>
                                <TableHead className="text-center px-1">Detalle</TableHead>
                                <TableHead className="text-center px-1">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sales.map((sale) => {
                                const saleTime = sale.timestamp instanceof Timestamp ? sale.timestamp.toDate() : new Date();
                                const formattedTime = format(saleTime, 'HH:mm:ss', { locale: es });
                                const customerName = userNames[sale.userId] || sale.userId;
                                const isCancelled = sale.isCancelled ?? false;

                                return (
                                    <TableRow key={sale.id} className={cn(isCancelled && "opacity-60")}>
                                        <TableCell className={cn("whitespace-nowrap text-xs", isCancelled && "line-through")}>{formattedTime}</TableCell>
                                        <TableCell className={cn(isCancelled && "line-through")}>{customerName}</TableCell>
                                        <TableCell className={cn(isCancelled && "line-through")}>{sale.description}</TableCell>
                                        <TableCell className={cn("text-right font-medium", isCancelled ? 'text-muted-foreground line-through' : 'text-destructive')}>
                                            {formatCurrency(sale.amount)}
                                        </TableCell>
                                        <TableCell className="text-center">
                                             <span className={cn("text-xs px-2 py-0.5 rounded-full",
                                                isCancelled ? "bg-muted text-muted-foreground border border-dashed" : "bg-green-100 text-green-800")}>
                                                {isCancelled ? 'Cancelada' : 'Confirmada'}
                                            </span>
                                            {/* Optionally show modified/restored status */}
                                            {sale.isModified && !isCancelled && <Info className="h-3 w-3 inline-block ml-1 text-blue-500" title="Modificada"/>}
                                            {sale.isRestored && <Info className="h-3 w-3 inline-block ml-1 text-orange-500" title="Restaurada"/>}
                                        </TableCell>
                                        <TableCell className="text-center px-1">
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenSaleDetail(sale)} title="Ver Detalle">
                                                <ShoppingBag className="h-4 w-4 text-primary" />
                                            </Button>
                                        </TableCell>
                                        <TableCell className="text-center px-1 space-x-1">
                                            {!isCancelled ? (
                                                <>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleEditSale(sale)}
                                                        aria-label={`Editar venta ${sale.id}`}
                                                        className="h-7 w-7"
                                                        disabled={isRecalculating}
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleCancel(sale)}
                                                        aria-label={`Cancelar venta ${sale.id}`}
                                                        className="h-7 w-7 text-destructive hover:text-destructive/90"
                                                         disabled={isRecalculating}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </>
                                            ) : (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleRestore(sale)}
                                                    aria-label={`Restaurar venta ${sale.id}`}
                                                    className="h-7 w-7 text-green-600 hover:text-green-700"
                                                    disabled={isRecalculating}
                                                >
                                                    <RotateCcw className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            )}


            {/* Edit Sale Dialog */}
            <Dialog open={isEditSaleDialogOpen} onOpenChange={(open) => { if (!open) handleDialogClose(); }}>
                <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col"> {/* Responsive adjustments */}
                     <DialogHeader>
                        <DialogTitle>Modificar Venta</DialogTitle>
                        <DialogDescription>
                            Modifica los productos o cantidades de esta venta. Se cancelará la venta original y se creará una nueva.
                        </DialogDescription>
                     </DialogHeader>
                     {/* Make SaleForm scrollable */}
                     <div className="flex-grow overflow-y-auto pr-2"> {/* Add padding-right for scrollbar */}
                         {selectedTransaction && selectedTransaction.saleDetails && (
                            <SaleForm
                                saleToEdit={selectedTransaction}
                                onClose={handleDialogClose}
                                onSuccessCallback={handleActionSuccess}
                            />
                         )}
                     </div>
                </DialogContent>
            </Dialog>

            {/* Cancel/Restore Dialogs */}
            {selectedTransaction && (
                <>
                    <CancelTransactionDialog
                        isOpen={isCancelDialogOpen}
                        onClose={handleDialogClose}
                        transaction={selectedTransaction}
                        adminUser={adminUser}
                        onSuccessCallback={handleActionSuccess}
                    />
                    <RestoreTransactionDialog
                        isOpen={isRestoreDialogOpen}
                        onClose={handleDialogClose}
                        transaction={selectedTransaction}
                        adminUser={adminUser}
                        onSuccessCallback={handleActionSuccess}
                    />
                </>
            )}

             {/* Sale Detail Dialog */}
             <Dialog open={isSaleDetailOpen} onOpenChange={handleDialogClose}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Detalle de Venta</DialogTitle>
                        {selectedTransaction && <DialogDescription>Venta ID: {selectedTransaction.id.substring(0,8)}... | Total: {formatCurrency(selectedTransaction.amount)}</DialogDescription>}
                    </DialogHeader>
                    {selectedTransaction?.saleDetails && (
                        <div className="max-h-[60vh] overflow-y-auto mt-4">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Producto</TableHead>
                                        <TableHead className="text-center">Cant.</TableHead>
                                        <TableHead className="text-right">P. Unit.</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {selectedTransaction.saleDetails.map((item) => (
                                        <TableRow key={item.productId}>
                                            <TableCell>{item.productName} <span className='text-xs text-muted-foreground'>({item.productId})</span></TableCell>
                                            <TableCell className="text-center">{item.quantity}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(item.totalPrice)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                     <DialogClose asChild>
                        <Button type="button" variant="outline" className="mt-4">Cerrar</Button>
                    </DialogClose>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default DailySalesList;

