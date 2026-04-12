import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useWalletModal } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { XyraLogo } from './icons/XyraLogo';

const customStyles: Record<string, React.CSSProperties> = {
  glassPanel: {
    background: 'linear-gradient(145deg, rgba(15,23,42,0.4) 0%, rgba(3,7,18,0.6) 100%)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.12)',
  },
  appHeader: {
    background: '#030712',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: '16px',
    padding: '10px 12px',
    width: '95%',
    maxWidth: '1240px',
    height: '64px',
    boxShadow:
      '0 0 0 1px rgba(148,163,184,0.12), 0 8px 32px -8px rgba(0, 0, 0, 0.5)',
  }
};

const Navbar = () => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const router = useRouter();
  const { setVisible } = useWalletModal();
  const { address, connected, connecting, disconnect } = useWallet();
  const configuredAdminAddress = (
    process.env.NEXT_PUBLIC_LENDING_ADMIN_ADDRESS ||
    process.env.NEXT_PUBLIC_ADMIN_ADDRESS ||
    'aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px'
  )
    .trim()
    .toLowerCase();
  const isAdminWallet = !!address && address.trim().toLowerCase() === configuredAdminAddress;

  const isLandingPage = router.pathname === '/';
  const isDashboardPage = router.pathname === '/dashboard';
  
  const useAppHeader = !isDashboardPage;
  
  // Close wallet modal when connection is successful
  useEffect(() => {
    if (connected) {
      setVisible(false);
    }
  }, [connected, setVisible]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsDropdownOpen(false);
  }, [router.pathname]);

  const baseNavItems = [
    { name: 'DASHBOARD', id: 'dashboard', href: '/dashboard' },
    { name: 'LIQUIDATION', id: 'liquidation', href: '/liquidation' },
    {
      name: 'FLASH LOAN',
      id: 'flash',
      href: '/flash',
    },
    { name: 'ADMIN', id: 'admin', href: '/admin' },
    { name: 'MARKETS', id: 'markets', href: '/markets' },
    { name: 'DOCS', id: 'docs', href: '/docs' },
    { name: 'WHITEPAPER', id: 'whitepaper', href: '/whitepaper' },
  ] as const;
  const navItems = baseNavItems.filter((item) => item.id !== 'admin' || isAdminWallet);

  const dashboardViewParam = Array.isArray(router.query.view)
    ? router.query.view[0]
    : router.query.view;

  const isNavItemActive = (id: string, href: string) => {
    if (id === 'flash') {
      return router.pathname === '/dashboard' && dashboardViewParam === 'flash';
    }
    if (id === 'liquidation') {
      return router.pathname === '/dashboard' && dashboardViewParam === 'liquidation';
    }
    if (id === 'dashboard') {
      return (
        router.pathname === '/dashboard' &&
        dashboardViewParam !== 'flash' &&
        dashboardViewParam !== 'liquidation' &&
        dashboardViewParam !== 'markets' &&
        dashboardViewParam !== 'docs'
      );
    }
    const base = href.split('?')[0];
    return router.pathname === base;
  };

  const formatAddress = (addr: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 5)}...${addr.slice(-3)}`;
  };

  const handleCopyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      // Maybe add a toast here later
    }
    setIsDropdownOpen(false);
  };

  const handleChangeWallet = () => {
    setVisible(true);
    setIsDropdownOpen(false);
  };

  const handleDisconnect = () => {
    disconnect();
    setIsDropdownOpen(false);
  };

  const NavLink = ({ item }: { item: (typeof navItems)[number] }) => {
    const isActive = isNavItemActive(item.id, item.href);
    return (
      <Link
        key={item.id}
        href={item.href}
        className="text-[11px] font-bold tracking-widest transition-all relative flex flex-col items-center justify-center h-full px-2"
        style={{
          color: isActive ? '#ffffff' : hovered === item.id ? '#ffffff' : '#94a3b8',
          fontFamily: "'Space Grotesk', 'Inter', sans-serif",
          fontWeight: isActive ? '700' : '500',
        }}
        onMouseEnter={() => setHovered(item.id)}
        onMouseLeave={() => setHovered(null)}
      >
        {item.name}
        {isActive && (
          <span
            style={{
              position: 'absolute',
              bottom: '-6px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '100%',
              height: '2px',
              background: '#22d3ee',
              boxShadow: '0 0 10px rgba(34, 211, 238, 0.6)',
              borderRadius: '2px'
            }}
          />
        )}
      </Link>
    );
  };

  return (
    <nav
      className="transition-all duration-500"
      style={{
        ...(useAppHeader ? customStyles.appHeader : {
          ...customStyles.glassPanel,
          borderRadius: '9999px',
          width: '95%',
          maxWidth: '1200px',
          padding: '10px 12px',
        }),
        position: 'fixed',
        top: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        // Keep a subtle visible outline across bright/dark page sections.
        boxShadow:
          (useAppHeader ? customStyles.appHeader.boxShadow : undefined) ??
          '0 0 0 1px rgba(148,163,184,0.12), 0 8px 28px -10px rgba(0,0,0,0.55)',
      }}
    >
      <div className="flex items-center justify-between w-full h-full">
        {/* Logo Section */}
        <Link href="/" className="flex items-center group shrink-0">
          <XyraLogo size={32} />
        </Link>

        {/* Navigation Links */}
        <div className="hidden md:flex items-center gap-10 h-full ml-12">
          {navItems.map((item) => (
            <NavLink key={item.id} item={item} />
          ))}
        </div>

        {/* Mobile nav toggle */}
        <button
          type="button"
          className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-xl border border-white/10 bg-white/5 text-slate-300"
          onClick={() => setIsMobileMenuOpen((v) => !v)}
          aria-label="Toggle navigation menu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {isMobileMenuOpen ? (
              <path d="M18 6L6 18M6 6l12 12" />
            ) : (
              <path d="M3 6h18M3 12h18M3 18h18" />
            )}
          </svg>
        </button>

        {/* Action Section */}
        <div className="flex items-center gap-2 shrink-0">
          {isLandingPage ? (
            <Link
              href="/dashboard"
              className="relative inline-flex h-10 overflow-hidden rounded-full p-px focus:outline-none"
              style={{ padding: '1px' }}
            >
              <span
                style={{
                  position: 'absolute',
                  inset: '-1000%',
                  animation: 'spin 2s linear infinite',
                  background: 'conic-gradient(from 90deg at 50% 50%, #030712 0%, #0ea5e9 50%, #030712 100%)',
                }}
              />
              <span
                className="inline-flex h-full w-full cursor-pointer items-center justify-center rounded-full text-sm font-medium text-white"
                style={{
                  background: '#0B1221',
                  padding: '4px 12px',
                  backdropFilter: 'blur(24px)',
                  fontFamily: "'Space Grotesk', sans-serif",
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                <span className="sm:hidden">Launch</span>
                <span className="hidden sm:inline">Launch App</span>
              </span>
            </Link>
          ) : (
            <div className="flex items-center gap-2 relative">
              {/* Network Badge */}
              <div 
                className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-full border border-emerald-500/20 bg-emerald-500/5"
              >
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                <span className="text-[10px] font-bold text-emerald-400 tracking-wider font-mono">
                  ALEO TESTNET
                </span>
              </div>

              {/* Wallet Button & Dropdown */}
              {connected && address ? (
                <div className="relative">
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="flex items-center gap-3 px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <div className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]" />
                    <span className="text-[12px] font-medium text-white/90 font-mono">
                      {formatAddress(address)}
                    </span>
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg" className={`opacity-50 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}>
                      <path d="M1 1L5 5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  {isDropdownOpen && (
                    <div 
                      className="absolute right-0 mt-3 w-56 rounded-2xl p-2 border border-white/10 shadow-2xl z-110"
                      style={{ 
                        background: '#030712',
                        backdropFilter: 'blur(24px)',
                      }}
                    >
                      <button
                        onClick={handleCopyAddress}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition-colors text-white/80 hover:text-white"
                      >
                        <span className="text-sm font-medium">Copy address</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      </button>

                      <button
                        onClick={handleChangeWallet}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition-colors text-white/80 hover:text-white"
                      >
                        <span className="text-sm font-medium">Change wallet</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
                          <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
                          <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
                          <path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z" />
                        </svg>
                      </button>

                      <div className="h-px bg-white/5 my-1 mx-2" />

                      <button
                        onClick={handleDisconnect}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition-colors text-white/80 hover:text-white"
                      >
                        <span className="text-sm font-medium">Disconnect</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  id="connect-wallet-btn"
                  onClick={() => setVisible(true)}
                  disabled={connecting}
                  className="px-3 sm:px-6 py-2 rounded-xl text-sm font-semibold text-white transition-all bg-[#0B1221] border border-white/10 hover:border-white/20 hover:bg-[#111827]"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {connecting ? 'Connecting...' : 'Connect'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {isMobileMenuOpen && (
        <div
          className="md:hidden absolute left-0 right-0 top-[calc(100%+10px)] rounded-2xl p-2 border border-white/10 shadow-2xl"
          style={{ background: '#030712', backdropFilter: 'blur(20px)' }}
        >
          {navItems.map((item) => {
            const isActive = isNavItemActive(item.id, item.href);
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-xl text-xs font-bold tracking-widest"
                style={{
                  color: isActive ? '#ffffff' : '#94a3b8',
                  backgroundColor: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                  fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                }}
              >
                {item.name}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
};

export default Navbar;


