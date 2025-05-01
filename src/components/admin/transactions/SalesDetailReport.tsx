
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useFirebase } from '@/context/FirebaseContext';
import { collection, query, where, orderBy, onSnapshot, Timestamp, getDocs } from 'firebase/firestore';
import { format, startOfDay, endOfDay, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import type { DateRange } from "react-day-picker"; // Keep DateRange type
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { formatCurrency, cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label"; // Import Label
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";
import type { Transaction, SaleDetail } from '@/types/transaction';
import type { UserData } from '@/types/user';
import { fetchUserNames } from './DailySalesList'; // Reuse helper function

// Special ID for the generic customer
const CONSUMIDOR_FINAL_ID = 'consumidor-final-id';
const CONSUMIDOR_FINAL_NAME = 'Consumidor Final';

interface GroupedSale {
    userId: string;
    userName: string;
    totalAmount: number;
    sales: Transaction[];
}

const SalesDetailReport: React.FC = () => {
    const { user: adminUser, role } = useAuth();
    const { db } = useFirebase();
    const [sales, setSales] = useState<Transaction[]>([]);
    const [userNames, setUserNames] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Use state for individual from and to dates
    const [fromDate, setFromDate] = useState<Date | undefined>(startOfDay(new Date()));
    const [toDate, setToDate] = useState<Date | undefined>(endOfDay(new Date()));

    // Derive dateRange for useEffect dependency
    const dateRange = useMemo(() => ({ from: fromDate, to: toDate }), [fromDate, toDate]);


    useEffect(() => {
        if (!adminUser || role !== 'admin') {
            setLoading(false);
            setError("Acceso denegado.");
            return;
        }

        // Fetch only if both dates are selected
        if (!dateRange || !dateRange.from || !dateRange.to) {
             setSales([]);
             setUserNames({});
             setLoading(false); // Stop loading if no valid range
             setError("Por favor, selecciona un rango de fechas válido.");
             return;
        }

        setLoading(true);
        setError(null); // Reset error on new fetch

        const startDate = startOfDay(dateRange.from);
        const endDate = endOfDay(dateRange.to);

        // Ensure startDate is not after endDate
        if (startDate > endDate) {
            setError("La fecha 'Desde' no puede ser posterior a la fecha 'Hasta'.");
            setLoading(false);
            setSales([]);
            setUserNames({});
            return;
        }


        const transactionsColRef = collection(db, 'transactions');
        const q = query(
            transactionsColRef,
            where('timestamp', '>=', Timestamp.fromDate(startDate)),
            where('timestamp', '<=', Timestamp.fromDate(endDate)),
            where('type', '==', 'purchase'), // Sales are 'purchase' for user balance
            where('isCancelled', '!=', true), // Exclude cancelled sales
            orderBy('timestamp', 'asc') // Order chronologically for grouping consistency
        );

        const unsubscribe = onSnapshot(q, async (querySnapshot) => {
            const fetchedSales = querySnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as Transaction))
                .filter(tx => tx.saleDetails && tx.saleDetails.length > 0); // Ensure it's a sale

            setSales(currentSales => {
                // Basic check to prevent infinite loops if snapshot fires unnecessarily
                if (JSON.stringify(fetchedSales) !== JSON.stringify(currentSales)) {
                    return fetchedSales;
                }
                return currentSales;
            });

            const userIds = Array.from(new Set(fetchedSales.map(sale => sale.userId)));
            if (userIds.length > 0) {
                try {
                    const names = await fetchUserNames(db, userIds);
                     setUserNames(currentNames => {
                         if (JSON.stringify(names) !== JSON.stringify(currentNames)) {
                             return names;
                         }
                         return currentNames;
                     });
                } catch (fetchError) {
                    console.error("Error fetching user names:", fetchError);
                    setError("No se pudieron cargar los nombres de los clientes.");
                }
            } else {
                setUserNames({});
            }
            setLoading(false);
        }, (err) => {
            console.error("Error fetching sales:", err);
            setError("Error al cargar las ventas.");
            setSales([]);
            setUserNames({});
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db, adminUser, role, dateRange]); // Re-run effect when dateRange changes

    // Group sales by user and calculate totals
    const { groupedSales, subtotalConsumidorFinal, subtotalRegistered, grandTotal } = useMemo(() => {
        const groups: Record<string, GroupedSale> = {};
        let subCF = 0;
        let subReg = 0;
        let grand = 0;

        sales.forEach(sale => {
            const userId = sale.userId;
            const userName = userNames[userId] || (userId === CONSUMIDOR_FINAL_ID ? CONSUMIDOR_FINAL_NAME : `Usuario ${userId.substring(0, 5)}...`);
            const amount = sale.amount;

            if (!groups[userId]) {
                groups[userId] = { userId, userName, totalAmount: 0, sales: [] };
            }
            groups[userId].totalAmount += amount;
            groups[userId].sales.push(sale);

            // Add to totals
            grand += amount;
            if (userId === CONSUMIDOR_FINAL_ID) {
                subCF += amount;
            } else {
                subReg += amount;
            }
        });

        // Sort groups: Consumidor Final first, then others alphabetically
        const sortedGroups = Object.values(groups).sort((a, b) => {
            if (a.userId === CONSUMIDOR_FINAL_ID) return -1;
            if (b.userId === CONSUMIDOR_FINAL_ID) return 1;
            return a.userName.localeCompare(b.userName);
        });


        return {
            groupedSales: sortedGroups,
            subtotalConsumidorFinal: subCF,
            subtotalRegistered: subReg,
            grandTotal: grand,
        };
    }, [sales, userNames]);


    if (!adminUser || role !== 'admin') {
        return <p className="text-center text-destructive">Acceso denegado.</p>;
    }

    return (
        <div className="space-y-6">
             {/* Date Range Picker */}
             <div className="flex flex-wrap items-end gap-4 mb-6">
                {/* From Date */}
                <div className="flex flex-col gap-1">
                    <Label htmlFor="from-date">Desde</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                        <Button
                            id="from-date"
                            variant={"outline"}
                            className={cn(
                            "w-[150px] justify-start text-left font-normal", // Adjusted width
                            !fromDate && "text-muted-foreground"
                            )}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {fromDate ? format(fromDate, "dd/MM/yyyy", {locale: es}) : <span>Selecciona</span>}
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                            mode="single"
                            selected={fromDate}
                            onSelect={setFromDate}
                            initialFocus
                            locale={es}
                        />
                        </PopoverContent>
                    </Popover>
                 </div>

                 {/* To Date */}
                 <div className="flex flex-col gap-1">
                    <Label htmlFor="to-date">Hasta</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                        <Button
                            id="to-date"
                            variant={"outline"}
                            className={cn(
                            "w-[150px] justify-start text-left font-normal", // Adjusted width
                            !toDate && "text-muted-foreground"
                            )}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {toDate ? format(toDate, "dd/MM/yyyy", {locale: es}) : <span>Selecciona</span>}
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                            mode="single"
                            selected={toDate}
                            onSelect={setToDate}
                            initialFocus
                            locale={es}
                            // Optionally disable dates before fromDate
                            disabled={fromDate ? { before: fromDate } : undefined}
                        />
                        </PopoverContent>
                    </Popover>
                 </div>
             </div>

             {/* Loading and Error States */}
             {loading && (
                 <div className="flex justify-center items-center h-40"><LoadingSpinner size="lg" /></div>
             )}
             {error && !loading && (
                 <p className="text-center text-destructive">{error}</p>
             )}

             {/* Sales Data Display */}
            {!loading && !error && (
                <>
                    {groupedSales.length === 0 ? (
                        <p className="text-center text-muted-foreground mt-6">No se encontraron ventas para el período seleccionado.</p>
                    ) : (
                        <>
                            <Accordion type="multiple" className="w-full">
                                {groupedSales.map((group) => (
                                    <AccordionItem value={group.userId} key={group.userId}>
                                        <AccordionTrigger className="hover:no-underline">
                                            <div className="flex justify-between w-full pr-4">
                                                <span className="font-medium">{group.userName}</span>
                                                <span className="text-primary font-semibold">{formatCurrency(group.totalAmount)}</span>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                         <TableHead className="w-[110px]">Fecha</TableHead>
                                                         <TableHead className="w-[80px]">Hora</TableHead>
                                                         <TableHead>Descripción</TableHead>
                                                         <TableHead className="text-right w-[100px]">Monto</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {group.sales.map((sale) => {
                                                         const saleTimestamp = sale.timestamp instanceof Timestamp ? sale.timestamp.toDate() : new Date();
                                                         return (
                                                            <TableRow key={sale.id}>
                                                                <TableCell className="text-xs text-muted-foreground">
                                                                    {format(saleTimestamp, 'dd/MM/yyyy')}
                                                                </TableCell>
                                                                <TableCell className="text-xs text-muted-foreground">
                                                                    {format(saleTimestamp, 'HH:mm:ss')}
                                                                </TableCell>
                                                                <TableCell>{sale.description}</TableCell>
                                                                <TableCell className="text-right font-medium text-destructive">{formatCurrency(sale.amount)}</TableCell>
                                                            </TableRow>
                                                        );
                                                    })}
                                                </TableBody>
                                            </Table>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>

                            <Separator className="my-6" />

                            {/* Totals Section */}
                            <Card className="bg-secondary/50">
                                <CardHeader>
                                    <CardTitle className="text-lg">Resumen del Período</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">Subtotal Consumidor Final:</span>
                                        <span className="font-medium">{formatCurrency(subtotalConsumidorFinal)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">Subtotal Clientes Registrados:</span>
                                        <span className="font-medium">{formatCurrency(subtotalRegistered)}</span>
                                    </div>
                                    <Separator />
                                    <div className="flex justify-between items-center text-xl">
                                        <span className="font-semibold text-primary">Total General Ventas:</span>
                                        <span className="font-bold text-primary">{formatCurrency(grandTotal)}</span>
                                    </div>
                                </CardContent>
                            </Card>
                        </>
                    )}
                </>
            )}
        </div>
    );
};

// Export the fetchUserNames function if it's used elsewhere, otherwise keep it internal
export { fetchUserNames };
export default SalesDetailReport;
