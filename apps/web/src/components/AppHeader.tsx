'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useTheme } from '@/shared/theme';
import { clay } from '@/shared/theme/clay';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from '@/features/account/hooks/useAccount';
import { MobileNavSheet } from './MobileNavSheet';
import { APP_HEADER_HEIGHT } from '@/shared/constants/layout';

export interface AppHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  backHref?: string;
  actions?: React.ReactNode;
  showMenu?: boolean;
  activeSpaceId?: string | null;
  onOpenSpaces?: () => void;
  className?: string;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  subtitle,
  showBack = false,
  onBack,
  backHref,
  actions,
  showMenu = true,
  activeSpaceId,
  className = '',
}) => {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const [navSheetOpen, setNavSheetOpen] = useState(false);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  };

  const userInitial = (
    profile?.displayName?.charAt(0) ||
    user?.email?.charAt(0) ||
    'U'
  ).toUpperCase();

  return (
    <>
      <header
        className={`sticky top-0 z-30 w-full flex items-center justify-between border-b px-3 transition-colors ${className}`}
        style={{
          height: `calc(${APP_HEADER_HEIGHT}px + env(safe-area-inset-top, 0px))`,
          paddingTop: 'env(safe-area-inset-top, 0px)',
          backgroundColor: colors.surface,
          borderColor: colors.line,
        }}
        data-testid="app-header"
      >
        {/* Left (Start): Back button + Title */}
        <div className="flex items-center min-w-0 flex-1 gap-2 ps-1 pe-2">
          {showBack && (
            <button
              type="button"
              onClick={handleBack}
              aria-label="Back"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center -ms-2 rounded-xl text-ink hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all cursor-pointer border-0 bg-transparent shrink-0"
              data-testid="header-back-button"
            >
              <ChevronLeft size={24} className="rtl:rotate-180" color={colors.ink} strokeWidth={2.5} />
            </button>
          )}

          <div className="flex-1 min-w-0">
            {typeof title === 'string' ? (
              <h1 className="text-base sm:text-lg font-bold text-ink truncate leading-tight" title={title}>
                {title}
              </h1>
            ) : (
              <div className="min-w-0 truncate">{title}</div>
            )}
            {subtitle && (
              <p className="text-xs text-muted truncate mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Right (End): Actions + Avatar Menu Button (never wrap or overflow) */}
        <div className="flex items-center gap-2 shrink-0 flex-nowrap ps-1 pe-1">
          {actions && <div className="flex items-center gap-1.5 flex-nowrap shrink-0">{actions}</div>}

          {showMenu && (
            <button
              type="button"
              onClick={() => setNavSheetOpen(true)}
              aria-label="Navigation menu"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl cursor-pointer border-0 font-bold transition-transform active:scale-95 shrink-0"
              style={clay({ color: colors.accent, radius: 14, depth: 0.6 })}
              data-testid="header-menu-button"
            >
              <span className="text-white text-sm font-bold">{userInitial}</span>
            </button>
          )}
        </div>
      </header>

      {showMenu && (
        <MobileNavSheet
          visible={navSheetOpen}
          onClose={() => setNavSheetOpen(false)}
          activeSpaceId={activeSpaceId}
        />
      )}
    </>
  );
};
