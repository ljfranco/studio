import type { Metadata, Viewport } from 'next';
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

const APP_NAME = "EasyManage";
const APP_DEFAULT_TITLE = "Easy Manage";
const APP_TITLE_TEMPLATE = "%s - PWA App";
const APP_DESCRIPTION = "Easy Manage te ayudara con la gestion de tu comercio. transacciones, inventario, entre otras funcionalidades.";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_DEFAULT_TITLE,
    template: APP_TITLE_TEMPLATE,
  },
  description: APP_DESCRIPTION,
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_DEFAULT_TITLE,
    // startUpImage: [],
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: {
      default: APP_DEFAULT_TITLE,
      template: APP_TITLE_TEMPLATE,
    },
    description: APP_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: {
      default: APP_DEFAULT_TITLE,
      template: APP_TITLE_TEMPLATE,
    },
    description: APP_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: '#00b3b3',
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
