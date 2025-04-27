import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats a number as currency (USD-like format, adaptable).
 * Shows positive amounts in default text color (or primary), negative in destructive.
 * @param amount - The number to format.
 * @param currencySymbol - The currency symbol (default: '$').
 * @param decimalSeparator - The decimal separator (default: '.').
 * @param thousandsSeparator - The thousands separator (default: ',').
 * @returns The formatted currency string.
 */
export function formatCurrency(
    amount: number,
    currencySymbol: string = '$',
    decimalSeparator: string = '.',
    thousandsSeparator: string = ','
): string {
    const isNegative = amount < 0;
    // Format the absolute value
    const absoluteAmount = Math.abs(amount);
    const fixedAmount = absoluteAmount.toFixed(2);
    const parts = fixedAmount.split('.');
    const integerPart = parts[0];
    const decimalPart = parts[1];

    const formattedInteger = integerPart.replace(
        /\B(?=(\d{3})+(?!\d))/g,
        thousandsSeparator
    );

    // Add symbol and sign only if negative for amounts, balance handled by CSS class
    const sign = isNegative ? '-' : '';


    return `${sign}${currencySymbol}${formattedInteger}${decimalSeparator}${decimalPart}`;
}
