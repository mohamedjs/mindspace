'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const pathname = usePathname();

  // /record and /sign-in are full-bleed with no sidebar
  const isFullBleed = pathname === '/record' || pathname === '/sign-in';

  if (isFullBleed) {
    return <main className="flex-1 flex flex-col min-h-screen">{children}</main>;
  }

  return (
    <div className="flex flex-row h-screen w-screen overflow-hidden bg-board">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-3 focus:bg-accent focus:text-white"
      >
        Skip to content
      </a>

      <Sidebar />

      <main id="main-content" className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
        {children}
      </main>
    </div>
  );
};
