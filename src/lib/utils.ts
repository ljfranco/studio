import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats a number as currency (USD-like format, adaptable).
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
    const fixedAmount = amount.toFixed(2);
    const parts = fixedAmount.split('.');
    const integerPart = parts[0];
    const decimalPart = parts[1];

    const formattedInteger = integerPart.replace(
        /\B(?=(\d{3})+(?!\d))/g,
        thousandsSeparator
    );

    return `${currencySymbol}${formattedInteger}${decimalSeparator}${decimalPart}`;
}
