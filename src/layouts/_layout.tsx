'use client';

import { useWindowScroll } from '@/hooks/use-window-scroll';
import { useIsMounted } from '@/hooks/use-is-mounted';
import React, { useState, useEffect } from 'react';
import { WalletMultiButton } from '@provablehq/aleo-wallet-adaptor-react-ui';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTheme } from 'next-themes';
import Footer from '@/components/ui/Footer';
import { DashboardViewProvider, useDashboardView } from '@/contexts/DashboardViewContext';

// ThemeSelector: simple light/dark toggle buttons using next-themes
function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  // Use a mount flag to avoid SSR mismatch
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const current = theme === 'light' ? 'light' : 'dark';

  return (
    <div className="inline-flex items-center rounded-full bg-base-200 p-1 text-[11px]">
      <button
        type="button"
        onClick={() => setTheme('light')}
        className={`px-3 py-1 rounded-full transition ${
          current === 'light' ? 'bg-base-100 text-primary font-semibold' : 'text-base-content/70'
        }`}
      >
        Light
      </button>
      <button
        type="button"
        onClick={() => setTheme('dark')}
        className={`px-3 py-1 rounded-full transition ${
          current === 'dark' ? 'bg-base-100 text-primary font-semibold' : 'text-base-content/70'
        }`}
      >
        Dark
      </button>
    </div>
  );
}

function HeaderInner() {
  const router = useRouter();
  const windowScroll = useWindowScroll();
  const isMounted = useIsMounted();
  const { view, setView } = useDashboardView();
  const isOnDashboard = router.pathname === '/dashboard';
  const isDashboard = isOnDashboard && view === 'dashboard';
  const isMarkets = isOnDashboard && view === 'markets';
  const isDocs = isOnDashboard && view === 'docs';

  const linkClass = (active: boolean) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition ${active ? 'bg-base-300 text-base-content' : 'text-base-content/70 hover:text-base-content hover:bg-base-300/50'}`;

  return (
    <nav
      className={`fixed top-0 z-30 w-full transition-all duration-300 ${
        isMounted && windowScroll.y > 10 ? 'shadow-card backdrop-blur bg-base-200/95' : 'bg-base-200'
      }`}
      style={{ zIndex: 30 }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <img
              src="/xyra-logo.png"
              alt="Xyra Finance"
              className="h-8 w-8 object-contain sm:h-9 sm:w-9"
              width={36}
              height={36}
            />
            <span className="font-bold text-lg hidden sm:inline">Xyra</span>
          </Link>
          <div className="flex items-center gap-1">
            {isOnDashboard ? (
              <>
                <button
                  type="button"
                  className={linkClass(isDashboard)}
                  onClick={() => setView('dashboard')}
                >
                  Dashboard
                </button>
                <button
                  type="button"
                  className={linkClass(isMarkets)}
                  onClick={() => setView('markets')}
                >
                  Markets
                </button>
                <button
                  type="button"
                  className={linkClass(isDocs)}
                  onClick={() => setView('docs')}
                >
                  Docs
                </button>
              </>
            ) : (
              <>
                <Link href="/dashboard" className={linkClass(false)}>Dashboard</Link>
                <Link href="/dashboard?view=markets" className={linkClass(false)}>Markets</Link>
                <Link href="/dashboard?view=docs" className={linkClass(false)}>Docs</Link>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ThemeSelector />
          {router.pathname !== '/' && (
            <div className="wallet-button-wrapper">
              <WalletMultiButton className="!bg-gradient-to-r !from-primary !to-secondary !border-0 !text-primary-content !font-semibold !px-5 !py-2 !rounded-lg !min-h-0 !h-auto" />
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

export function Header() {
  return <HeaderInner />;
}

interface LayoutProps {}

export default function Layout({
  children,
}: React.PropsWithChildren<LayoutProps>) {
  const router = useRouter();
  const isDashboard = router.pathname === '/dashboard';

  return (
    <DashboardViewProvider>
      <div className={`text-base-content flex min-h-screen flex-col ${isDashboard ? 'bg-primary' : 'bg-base-100'}`}>
        <Header />
        <main className={`flex flex-grow flex-col pt-4 sm:pt-12 bg-primary ${isDashboard ? 'min-h-[calc(100vh-4rem)]' : 'mb-12'}`}>
          {children}
        </main>
        {!isDashboard && <Footer />}
      </div>
    </DashboardViewProvider>
  );
}
