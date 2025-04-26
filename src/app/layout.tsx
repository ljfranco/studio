import type { Metadata } from 'next';
import { GeistSans } from 'next/font/google'; // Adjusted import name
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseProvider } from '@/context/FirebaseContext';
import ReactQueryProvider from '@/context/ReactQueryProvider'; // Renamed for clarity
import AuthProvider from '@/context/AuthContext'; // Added AuthProvider
import { Navbar } from '@/components/layout/Navbar'; // Import Navbar

const geistSans = GeistSans({ // Corrected font import usage
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

// Removed GeistMono as it's not explicitly requested in the style guide

export const metadata: Metadata = {
  title: 'Cuenta Clara',
  description: 'Gestiona tu estado de cuenta de forma sencilla.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es"> {/* Set language to Spanish */}
      <body className={`${geistSans.variable} antialiased`}>
        <ReactQueryProvider>
          <FirebaseProvider>
            <AuthProvider> {/* Wrap with AuthProvider */}
              <div className="flex flex-col min-h-screen">
                <Navbar />
                <main className="flex-grow container mx-auto px-4 py-8">
                  {children}
                </main>
                <Toaster />
              </div>
            </AuthProvider>
          </FirebaseProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
