import type { Metadata } from 'next';
import { Inter } from 'next/font/google'; // Use a standard Google Font like Inter
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseProvider } from '@/context/FirebaseContext';
import ReactQueryProvider from '@/context/ReactQueryProvider'; // Renamed for clarity
import AuthProvider from '@/context/AuthContext'; // Added AuthProvider
import { Navbar } from '@/components/layout/Navbar'; // Import Navbar

// Initialize the Inter font
const inter = Inter({
  variable: '--font-inter', // Define a CSS variable for the font
  subsets: ['latin'],
});

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
      {/* Apply the font variable to the body */}
      <body className={`${inter.variable} antialiased`}>
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
