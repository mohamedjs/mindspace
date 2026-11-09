/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  APP_HEADER_HEIGHT,
  CANVAS_DOCK_HEIGHT,
  MIN_TOUCH_TARGET,
  MIN_TEXT_SIZE,
  checkHeaderDockClearance,
} from '@/shared/constants/layout';
import { AppHeader } from '@/components/AppHeader';
import { MobileNavSheet } from '@/components/MobileNavSheet';
import { CanvasMobileDock } from '@/features/canvas/components/CanvasMobileDock';
import { CreateSpaceModal } from '@/features/canvas/components/CreateSpaceModal';

const pushMock = jest.fn();
const backMock = jest.fn();
const signOutMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    back: backMock,
    replace: jest.fn(),
  }),
  usePathname: () => '/space/s1',
}));

jest.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'mobile@mindspace.test' },
    signOut: signOutMock,
  }),
}));

jest.mock('@/features/account/hooks/useAccount', () => ({
  useProfile: () => ({
    data: { displayName: 'Mobile Tester', email: 'mobile@mindspace.test' },
    isLoading: false,
  }),
}));

jest.mock('@/features/credits/hooks/useCredits', () => ({
  useBalance: () => ({
    data: { creditsBalance: 750, creditsReserved: 0 },
    isLoading: false,
  }),
  creditsToEgp: (c: number) => String(c),
  estimateMinutes: (c: number) => Math.round(c / 10),
}));

jest.mock('@/features/billing/hooks/useBilling', () => ({
  useActiveSubscription: () => ({
    data: { planId: 'pro_byok', currentPeriodEnd: '2026-12-01' },
    isLoading: false,
  }),
  usePlans: () => ({
    data: [
      { id: 'free', name: 'Free', isByok: false },
      { id: 'pro_byok', name: 'Pro BYOK', isByok: true },
    ],
    isLoading: false,
  }),
}));

jest.mock('@/shared/theme', () => {
  const actual = jest.requireActual('@/shared/theme');
  return {
    ...actual,
    useTheme: () => ({
      colors: actual.palettes.light,
      scheme: 'light',
      preference: 'light',
      setPreference: jest.fn(),
      handDrawnEnabled: false,
      setHandDrawnEnabled: jest.fn(),
      canvasBackgroundEnabled: true,
      setCanvasBackgroundEnabled: jest.fn(),
      showChildNotes: true,
      setShowChildNotes: jest.fn(),
      notesView: 'canvas',
      setNotesView: jest.fn(),
      noteSize: 'medium',
      setNoteSize: jest.fn(),
    }),
  };
});

jest.mock('@/features/canvas/api/spaces.api', () => ({
  fetchSpaces: jest.fn().mockResolvedValue([
    { id: 's1', name: 'Product Space', emoji: 'rocket', noteCount: 12 },
    { id: 's2', name: 'Personal Notes', emoji: 'book', noteCount: 3 },
  ]),
  createSpace: jest.fn().mockResolvedValue({ id: 's3', name: 'New Space' }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('Mobile layout & clearance contracts', () => {
  it('defines guaranteed dimension constants matching spec', () => {
    expect(APP_HEADER_HEIGHT).toBe(56);
    expect(CANVAS_DOCK_HEIGHT).toBe(64);
    expect(MIN_TOUCH_TARGET).toBe(44);
    expect(MIN_TEXT_SIZE).toBe(14);
  });

  it('guarantees positive vertical clearance across 360, 390, and 768px viewports', () => {
    const viewports = [
      { name: 'Android compact (360x640)', width: 360, height: 640, safeAreaTop: 0, safeAreaBottom: 0 },
      { name: 'iPhone 14 (390x844 with safe areas)', width: 390, height: 844, safeAreaTop: 47, safeAreaBottom: 34 },
      { name: 'iPad mini / 768px (768x1024)', width: 768, height: 1024, safeAreaTop: 24, safeAreaBottom: 20 },
    ];

    for (const vp of viewports) {
      const result = checkHeaderDockClearance(vp);
      expect(result.overlaps).toBe(false);
      expect(result.clearance).toBeGreaterThan(0);
      expect(result.dockTop).toBeGreaterThan(result.headerBottom);
      // Even on smallest screen (640px), clearance should leave ample room for cards
      expect(result.clearance).toBeGreaterThan(400);
    }
  });
});

describe('AppHeader mobile contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders sticky header with safe-area height and truncating title', () => {
    render(
      <AppHeader
        title="A Very Long Space Title That Must Be Truncated On Mobile Screen"
        showBack
        onBack={backMock}
        actions={<button type="button">Action</button>}
      />,
      { wrapper: createWrapper() }
    );

    const header = screen.getByTestId('app-header');
    expect(header.className).toContain('sticky');
    expect(header.className).toContain('top-0');
    expect(header.style.height).toContain('56px');
    expect(header.style.height).toContain('safe-area-inset-top');

    // Title should truncate
    const titleEl = screen.getByRole('heading', { level: 1 });
    expect(titleEl.className).toContain('truncate');

    // Back button has RTL mirroring and triggers onBack
    const backBtn = screen.getByTestId('header-back-button');
    expect(backBtn.className).toContain('min-w-[44px]');
    expect(backBtn.className).toContain('min-h-[44px]');
    fireEvent.click(backBtn);
    expect(backMock).toHaveBeenCalledTimes(1);

    // Chevron icon has rtl:rotate-180 class
    const chevronSvg = backBtn.querySelector('svg');
    expect(chevronSvg?.className.baseVal || chevronSvg?.getAttribute('class')).toContain('rtl:rotate-180');
  });

  it('keeps header actions container shrink-0 and flex-nowrap to avoid overflow', () => {
    const { container } = render(
      <AppHeader
        title="Canvas"
        actions={<div data-testid="custom-actions">Actions</div>}
      />,
      { wrapper: createWrapper() }
    );

    const actionsContainer = container.querySelector('.shrink-0.flex-nowrap');
    expect(actionsContainer).not.toBeNull();
  });

  it('reaches Settings from AppHeader menu button in <= 2 taps', async () => {
    render(<AppHeader title="Board" />, { wrapper: createWrapper() });

    // Tap 1: Avatar menu button opens the navigation sheet
    const avatarBtn = screen.getByTestId('header-menu-button');
    expect(avatarBtn).not.toBeNull();
    fireEvent.click(avatarBtn);

    // The MobileNavSheet is now visible
    const settingsBtn = await screen.findByRole('button', { name: /settings/i });
    expect(settingsBtn).not.toBeNull();

    // Tap 2: Tap Settings
    fireEvent.click(settingsBtn);
    expect(pushMock).toHaveBeenCalledWith('/settings');
  });
});

describe('MobileNavSheet mobile contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('contains all sidebar destinations with >=44px touch targets', () => {
    render(
      <MobileNavSheet visible={true} onClose={jest.fn()} activeSpaceId="s1" />,
      { wrapper: createWrapper() }
    );

    // 1. Home
    const homeBtn = screen.getByRole('button', { name: /home/i });
    expect(homeBtn.className).toContain('min-h-[48px]');

    // 2. Spaces section & New space button
    expect(screen.getByText(/spaces/i)).not.toBeNull();
    const newSpaceBtn = screen.getByRole('button', { name: /new space/i });
    expect(newSpaceBtn.className).toContain('min-h-[44px]');

    // 3. Plans
    const plansBtn = screen.getByRole('button', { name: /plans/i });
    expect(plansBtn.className).toContain('min-h-[48px]');

    // 4. Credits & billing with balance
    const creditsBtn = screen.getByRole('button', { name: /credits & billing/i });
    expect(creditsBtn.className).toContain('min-h-[48px]');
    expect(screen.getByText('750')).not.toBeNull();

    // 5. API keys (BYOK enabled)
    const keysBtn = screen.getByRole('button', { name: /your api keys/i });
    expect(keysBtn.className).toContain('min-h-[48px]');

    // 6. Settings
    const settingsBtn = screen.getByRole('button', { name: /settings/i });
    expect(settingsBtn.className).toContain('min-h-[48px]');

    // 7. Sign out
    const signOutBtn = screen.getByRole('button', { name: /sign out/i });
    expect(signOutBtn.className).toContain('min-h-[48px]');
  });

  it('navigates to any destination in 1 tap when sheet is open', () => {
    const onClose = jest.fn();
    render(
      <MobileNavSheet visible={true} onClose={onClose} />,
      { wrapper: createWrapper() }
    );

    // Tapping Plans
    fireEvent.click(screen.getByRole('button', { name: /plans/i }));
    expect(onClose).toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith('/plans');
  });
});

describe('CanvasMobileDock mobile contracts', () => {
  it('renders dock with 64px height and >=44px touch targets', () => {
    const setToolModeMock = jest.fn();
    render(
      <CanvasMobileDock
        toolMode="pointer"
        onSetToolMode={setToolModeMock}
        selectedCount={0}
      />
    );

    const dock = screen.getByTestId('canvas-mobile-dock');
    expect(dock.style.height).toContain('64px');
    expect(dock.style.height).toContain('safe-area-inset-bottom');

    // Tool buttons: Hand, Select, Link, Edit
    const handBtn = screen.getByRole('button', { name: /hand mode/i });
    const selectBtn = screen.getByRole('button', { name: /select mode/i });
    const linkBtn = screen.getByRole('button', { name: /connect mode/i });
    const editBtn = screen.getByRole('button', { name: /write mode/i });

    for (const btn of [handBtn, selectBtn, linkBtn, editBtn]) {
      expect(btn.className).toContain('min-h-[44px]');
      expect(btn.className).toContain('min-w-[48px]');
    }

    // Raised (+) create button
    const plusBtn = screen.getByRole('button', { name: /create item/i });
    expect(plusBtn.className).toContain('w-14');
    expect(plusBtn.className).toContain('h-14');

    // Tapping raised (+) button opens the create sheet
    fireEvent.click(plusBtn);
    expect(screen.getByRole('dialog', { name: /create item/i })).not.toBeNull();
    expect(screen.getByText(/voice note/i)).not.toBeNull();
    expect(screen.getByText(/sticky note/i)).not.toBeNull();
  });
});

describe('CreateSpaceModal bottom sheet contract', () => {
  it('renders bottom sheet modal on mobile viewport', () => {
    render(
      <CreateSpaceModal
        visible={true}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />
    );

    const dialog = screen.getByRole('dialog', { name: /create new space/i });
    expect(dialog).not.toBeNull();
    // Modal card on mobile is bottom-aligned with rounded top
    expect(dialog.className).toContain('items-end');
    expect(dialog.className).toContain('sm:items-center');
  });
});
