import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseProvider } from '@/context/FirebaseContext';
import ReactQueryProvider from '@/context/ReactQueryProvider';
import AuthProvider from '@/context/AuthContext';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { ThemeProvider } from '@/components/layout/ThemeProvider'; // Import ThemeProvider

// Initialize the Inter font
const inter = Inter({
  variable: '--font-inter', // Define a CSS variable for the font
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'EasyManage', // Updated title
  description: 'Gestiona tu estado de cuenta de forma sencilla.', // Consider updating description later if needed
  manifest: '/manifest.json',
  themeColor: '#00b3b3',
  icons: {
    icon: '/assets/icon192.png',
    apple: '/assets/icon512.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Remove lang="es" for now to avoid hydration mismatch warnings if ThemeProvider adds classes server-side initially
    // It can be added back if needed, ensuring consistency between server and client render
    <html>
      {/* Apply the font variable to the body */}
      <body className={`${inter.variable} antialiased`}>
         {/* Wrap everything with ThemeProvider */}
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <ReactQueryProvider>
            <FirebaseProvider>
                <AuthProvider> {/* Wrap with AuthProvider */}
                <div className="flex flex-col min-h-screen">
                    <Navbar />
                    <main className="flex-grow container mx-auto px-4 pt-8 py-16">
                    {children}
                    </main>
                    <Toaster />
                    <Footer />
                </div>
                </AuthProvider>
            </FirebaseProvider>
            </ReactQueryProvider>
         </ThemeProvider>
      </body>
    </html>
  );
}
