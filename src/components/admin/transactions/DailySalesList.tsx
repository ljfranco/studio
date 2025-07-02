
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useFirebase } from '@/context/FirebaseContext';
import { collection, query, where, orderBy, onSnapshot, Timestamp, getDocs, doc, writeBatch, getDoc } from 'firebase/firestore';
import { format, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { formatCurrency, cn } from '@/lib/utils';
import { Pencil, Trash2, ShoppingBag, Info, RotateCcw, RefreshCw, DollarSign, MoreVertical } from 'lucide-react';
import SaleForm from './SaleForm';
import CancelTransactionDialog from '../CancelTransactionDialog';
import RestoreTransactionDialog from '../RestoreTransactionDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import type { Transaction } from '@/types/transaction';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";


// --- Helper function to get user names ---
export const fetchUserNames = async (db: any, userIds: string[]): Promise<Record<string, string>> => {
    if (userIds.length === 0) return {};
    const userMap: Record<string, string> = {};
    const usersRef = collection(db, 'users');
    const MAX_IDS_PER_QUERY = 30;
    for (let i = 0; i < userIds.length; i += MAX_IDS_PER_QUERY) {
        const chunk = userIds.slice(i, i + MAX_IDS_PER_QUERY);
        if (chunk.length > 0) {
            const q = query(usersRef, where('__name__', 'in', chunk));
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
    const isMobile = useIsMobile();

    const [isEditSaleDialogOpen, setIsEditSaleDialogOpen] = useState(false);
    const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
    const [isRestoreDialogOpen, setIsRestoreDialogOpen] = useState(false);
    const [isSaleDetailOpen, setIsSaleDetailOpen] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

    const todayRange = useMemo(() => {
        const today = new Date();
        return {
            start: startOfDay(today),
            end: endOfDay(today),
        };
    }, []);

    useEffect(() => {
        if (!adminUser || role !== 'admin') {
            setLoading(false);
            return;
        }

        setLoading(true);
        const transactionsColRef = collection(db, 'transactions');
        const q = query(
            transactionsColRef,
            where('timestamp', '>=', Timestamp.fromDate(todayRange.start)),
            where('timestamp', '<=', Timestamp.fromDate(todayRange.end)),
            where('type', '==', 'purchase'),
            orderBy('timestamp', 'desc')
        );

        const unsubscribe = onSnapshot(q, async (querySnapshot) => {
            const fetchedSales = querySnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as Transaction))
                .filter(tx => tx.saleDetails && tx.saleDetails.length > 0);

            setSales(fetchedSales);

            const userIds = Array.from(new Set(fetchedSales.map(sale => sale.userId)));
            if (userIds.length > 0) {
                try {
                    const names = await fetchUserNames(db, userIds);
                    setUserNames(names);
                } catch (fetchError) {
                    console.error("Error fetching user names:", fetchError);
                    toast({ title: 'Error', description: 'No se pudieron cargar los nombres de los clientes.', variant: 'destructive' });
                }
            } else {
                setUserNames({});
            }
            setLoading(false);
        }, (error) => {
            console.error("Error in snapshot listener for daily sales:", error);
            toast({ title: 'Error', description: 'Error al actualizar las ventas del día.', variant: 'destructive' });
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db, adminUser, role, todayRange, toast]);

    const totalSalesAmount = useMemo(() => {
        return sales
            .filter(sale => !sale.isCancelled)
            .reduce((sum, sale) => sum + sale.amount, 0);
    }, [sales]);

    const recalculateBalancesForAffectedUsers = useCallback(async (affectedUserIds: string[], showToast: boolean = true) => {
        if (!db || !adminUser || role !== 'admin' || affectedUserIds.length === 0) return;

        setIsRecalculating(true);
        const uniqueUserIds = Array.from(new Set(affectedUserIds));

        try {
            const batch = writeBatch(db);
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
                const userSnap = await getDoc(userDocRef);
                if (userSnap.exists() && userSnap.data().balance !== currentBalance) {
                    batch.update(userDocRef, { balance: currentBalance });
                }
            }
            await batch.commit();
            if (showToast) {
                toast({ title: "Éxito", description: `Saldos recalculados para ${uniqueUserIds.length} usuario(s).` });
            }
        } catch (error) {
            console.error("Error recalculating balances:", error);
            if (showToast) {
                toast({ title: "Error", description: `No se pudo recalcular todos los saldos. ${error instanceof Error ? error.message : String(error)}`, variant: "destructive" });
            }
        } finally {
            setIsRecalculating(false);
        }
    }, [db, toast, adminUser, role]);

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

    const handleActionSuccess = useCallback(() => {
        if (selectedTransaction) {
            setTimeout(() => {
                recalculateBalancesForAffectedUsers([selectedTransaction.userId], false);
            }, 100);
        }
        handleDialogClose();
    }, [selectedTransaction, recalculateBalancesForAffectedUsers]);

    if (loading) {
        return <div className="flex justify-center items-center h-40"><LoadingSpinner size="lg" /></div>;
    }

    if (!adminUser || role !== 'admin') {
        return <p className="text-center text-destructive">Acceso denegado.</p>;
    }

    const renderStatusIcons = (sale: Transaction) => (
        <TooltipProvider>
            <div className="flex items-center gap-1">
                {sale.isModified && !sale.isCancelled && (
                    <Tooltip>
                        <TooltipTrigger>
                            <Info className="h-3 w-3 text-blue-500" />
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Esta venta fue modificada.</p>
                        </TooltipContent>
                    </Tooltip>
                )}
                {sale.isRestored && (
                    <Tooltip>
                        <TooltipTrigger>
                            <Info className="h-3 w-3 text-orange-500" />
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Esta venta fue restaurada después de ser cancelada.</p>
                        </TooltipContent>
                    </Tooltip>
                )}
            </div>
        </TooltipProvider>
    );

    const renderSaleCard = (sale: Transaction) => {
        const saleTime = sale.timestamp instanceof Timestamp ? sale.timestamp.toDate() : new Date();
        const formattedTime = format(saleTime, 'HH:mm:ss', { locale: es });
        const customerName = userNames[sale.userId] || sale.userId;
        const isCancelled = sale.isCancelled ?? false;

        return (
            <Card key={sale.id} className={cn("mb-4", isCancelled && "opacity-60")}>
                <CardHeader>
                    <div className="flex justify-between items-start">
                        <div>
                            <CardTitle className={cn("text-lg", isCancelled && "line-through")}>{customerName}</CardTitle>
                            <p className={cn("text-xs text-muted-foreground", isCancelled && "line-through")}>
                                {formattedTime} - {sale.description}
                            </p>
                        </div>
                        <p className={cn("text-xl font-bold", isCancelled ? 'text-muted-foreground line-through' : 'text-destructive')}>
                            {formatCurrency(sale.amount)}
                        </p>
                    </div>
                </CardHeader>
                <CardContent className="flex justify-between items-center pt-2">
                    <div className="flex items-center gap-2">
                        <Badge variant={isCancelled ? "outline" : "default"} className={cn(isCancelled ? "border-dashed" : "bg-green-100 text-green-800")}>
                            {isCancelled ? 'Cancelada' : 'Confirmada'}
                        </Badge>
                        {renderStatusIcons(sale)}
                    </div>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenSaleDetail(sale)} title="Ver Detalle">
                            <ShoppingBag className="h-4 w-4 text-primary" />
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isRecalculating}>
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {!isCancelled ? (
                                    <>
                                        <DropdownMenuItem onClick={() => handleEditSale(sale)}>
                                            <Pencil className="mr-2 h-4 w-4" />
                                            <span>Editar</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleCancel(sale)} className="text-destructive">
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            <span>Cancelar</span>
                                        </DropdownMenuItem>
                                    </>
                                ) : (
                                    <DropdownMenuItem onClick={() => handleRestore(sale)} className="text-green-600">
                                        <RotateCcw className="mr-2 h-4 w-4" />
                                        <span>Restaurar</span>
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </CardContent>
            </Card>
        );
    };

    const renderSalesTable = () => (
        <div className="overflow-x-auto border rounded-md">
            <Table className="min-w-full">
                <TableHeader>
                    <TableRow>
                        <TableHead className="min-w-[100px]">Hora</TableHead>
                        <TableHead className="min-w-[150px]">Cliente</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="text-right min-w-[100px]">Monto</TableHead>
                        <TableHead className="text-center">Estado</TableHead>
                        <TableHead className="text-center px-1">Detalle</TableHead>
                        <TableHead className="text-center px-1 min-w-[100px]">Acciones</TableHead>
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
                                <TableCell className={cn("whitespace-nowrap", isCancelled && "line-through")}>{customerName}</TableCell>
                                <TableCell className={cn(isCancelled && "line-through")}>{sale.description}</TableCell>
                                <TableCell className={cn("text-right font-medium", isCancelled ? 'text-muted-foreground line-through' : 'text-destructive')}>
                                    {formatCurrency(sale.amount)}
                                </TableCell>
                                <TableCell className="text-center">
                                    <div className="flex items-center justify-center gap-2">
                                        <Badge variant={isCancelled ? "outline" : "default"} className={cn("text-xs", isCancelled ? "border-dashed" : "bg-green-100 text-green-800")}>
                                            {isCancelled ? 'Cancelada' : 'Confirmada'}
                                        </Badge>
                                        {renderStatusIcons(sale)}
                                    </div>
                                </TableCell>
                                <TableCell className="text-center px-1">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenSaleDetail(sale)} title="Ver Detalle">
                                        <ShoppingBag className="h-4 w-4 text-primary" />
                                    </Button>
                                </TableCell>
                                <TableCell className="text-center px-1 space-x-1">
                                    {!isCancelled ? (
                                        <>
                                            <Button variant="ghost" size="icon" onClick={() => handleEditSale(sale)} className="h-7 w-7" disabled={isRecalculating}>
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleCancel(sale)} className="h-7 w-7 text-destructive hover:text-destructive/90" disabled={isRecalculating}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </>
                                    ) : (
                                        <Button variant="ghost" size="icon" onClick={() => handleRestore(sale)} className="h-7 w-7 text-green-600 hover:text-green-700" disabled={isRecalculating}>
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
    );

    return (
        <>
            <div className="flex flex-col items-end mb-4 gap-4">
                <Button onClick={() => recalculateBalancesForAffectedUsers(sales.map(s => s.userId), true)} variant="outline" disabled={isRecalculating} className="shrink-0">
                    {isRecalculating ? <LoadingSpinner size="sm" className="mr-2" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Recalcular Saldos
                </Button>
                <Card className="bg-primary/10 border-primary w-full">
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
                isMobile ? (
                    <div>{sales.map(renderSaleCard)}</div>
                ) : (
                    renderSalesTable()
                )
            )}

            {/* Dialogs */}
            <Dialog open={isEditSaleDialogOpen} onOpenChange={(open) => !open && handleDialogClose()}>
                <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Modificar Venta</DialogTitle>
                        <DialogDescription>
                            Modifica los productos o cantidades de esta venta. Se cancelará la venta original y se creará una nueva.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-grow overflow-y-auto pr-2">
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

            {selectedTransaction && (
                <>
                    <CancelTransactionDialog isOpen={isCancelDialogOpen} onClose={handleDialogClose} transaction={selectedTransaction} adminUser={adminUser} onSuccessCallback={handleActionSuccess} />
                    <RestoreTransactionDialog isOpen={isRestoreDialogOpen} onClose={handleDialogClose} transaction={selectedTransaction} adminUser={adminUser} onSuccessCallback={handleActionSuccess} />
                </>
            )}

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
