'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { FullScreenSpinner } from './FullScreenSpinner';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublic = pathname === '/sign-in' || pathname.startsWith('/auth/');

  useEffect(() => {
    if (isLoading) return;
    if (!user && !isPublic) router.replace('/sign-in');
    if (user && pathname === '/sign-in') router.replace('/');
  }, [user, isLoading, isPublic, pathname, router]);

  if (isLoading) return <FullScreenSpinner />;
  if (!user && !isPublic) return <FullScreenSpinner />;
  return <>{children}</>;
}
