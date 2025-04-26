'use client';

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Conditionally import Devtools
const ReactQueryDevtools = process.env.NODE_ENV === 'development'
  ? React.lazy(() =>
      import('@tanstack/react-query-devtools').then((mod) => ({
        default: mod.ReactQueryDevtools,
      }))
    )
  : () => null; // Render nothing in production

function ReactQueryProvider({ children }: React.PropsWithChildren) {
  const [client] = React.useState(
    new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5 * 1000, // Keep data fresh for 5 seconds
        },
      },
    })
  );
  const [showDevtools, setShowDevtools] = React.useState(false);

  // Workaround to show devtools in development without causing hydration errors
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      setShowDevtools(true);
    }
  }, []);

  return (
    <QueryClientProvider client={client}>
      {children}
      {showDevtools && (
         <React.Suspense fallback={null}>
            <ReactQueryDevtools initialIsOpen={false} />
         </React.Suspense>
      )}
    </QueryClientProvider>
  );
}

export default ReactQueryProvider;
