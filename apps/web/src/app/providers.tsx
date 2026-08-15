'use client';

import React, { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Toaster } from 'sonner';
import { queryClient, createPersister } from '@/lib/query-client';
import { RepositoryProvider } from '@/providers/RepositoryProvider';
import { ThemeProvider } from '@/shared/theme';
import { AuthProvider } from '@/providers/AuthProvider';
import { AuthGate } from '@/shared/ui/AuthGate';

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const persister = createPersister();

  const content = (
    <RepositoryProvider>
      <ThemeProvider>
        <AuthProvider>
          <AuthGate>{children}</AuthGate>
          <Toaster position="top-center" richColors />
        </AuthProvider>
      </ThemeProvider>
    </RepositoryProvider>
  );

  if (!mounted || !persister) {
    return <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>;
  }

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      {content}
    </PersistQueryClientProvider>
  );
}
