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

import Navbar from '@/components/ui/Navbar';

interface LayoutProps { }

export default function Layout({
  children,
}: React.PropsWithChildren<LayoutProps>) {
  const router = useRouter();
  const isDashboard = router.pathname === '/dashboard';
  const isDocs = router.pathname === '/docs';
  const isWhitepaper = router.pathname === '/whitepaper';
  const wideOverflow = isDocs || isWhitepaper;

  return (
    <DashboardViewProvider>
      <div
        className={`text-base-content flex min-h-screen flex-col ${wideOverflow ? 'overflow-x-visible' : 'overflow-x-hidden'} ${isDashboard ? 'bg-[#030712]' : 'bg-[#030712]'}`}
      >
        <Navbar />
        <main
          className={`flex flex-grow flex-col pt-32 ${wideOverflow ? 'overflow-x-visible' : 'overflow-x-hidden'} ${isDashboard ? 'bg-[#030712] min-h-[calc(100vh-4rem)]' : 'bg-[#030712]'}`}
        >
          {children}
        </main>
        {/* {!isDashboard && <Footer />} */}
      </div>
    </DashboardViewProvider>
  );
}
