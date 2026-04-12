import type { NextPageWithLayout } from '@/types';
import { NextSeo } from 'next-seo';
import Layout from '@/layouts/_layout';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useState, useEffect } from 'react';

// ─── Inline style tokens ──────────────────────────────────────────────────────

const customStyles: Record<string, React.CSSProperties> = {
  glassPanel: {
    background: 'rgba(11, 18, 33, 0.4)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
  },
  bgGridAnimated: {
    backgroundSize: '50px 50px',
    backgroundImage: `
      linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px)
    `,
    maskImage: 'linear-gradient(to bottom, black 20%, transparent 80%)' as any,
    WebkitMaskImage: 'linear-gradient(to bottom, black 20%, transparent 80%)' as any,
  },
  clipHex: {
    clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
  },
  codeBlock: {
    background: 'rgba(11, 18, 33, 0.5)',
    padding: '16px',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.05)',
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: '12px',
    color: '#64748b',
    overflow: 'hidden' as const,
    position: 'relative' as const,
  },
};

// ─── SVG Icon helper ──────────────────────────────────────────────────────────

const FeatherIcon = ({
  name,
  className = '',
  style = {},
}: {
  name: string;
  className?: string;
  style?: React.CSSProperties;
}) => {
  const icons: Record<string, React.ReactNode> = {
    box: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <path d="M12 2l8.66 5v10L12 22l-8.66-5V7L12 2z" />
      </svg>
    ),
    'arrow-up-right': (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <line x1="7" y1="17" x2="17" y2="7" />
        <polyline points="7 7 17 7 17 17" />
      </svg>
    ),
    'book-open': (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
    'eye-off': (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    ),
    shield: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    'zap-off': (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <polyline points="12.41 6.75 13 2 10.57 4.92" />
        <polyline points="18.57 12.91 21 10 15.66 10" />
        <polyline points="8 8 3 14 12 14 11 22 16 16" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    ),
    lock: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    cpu: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
        <rect x="9" y="9" width="6" height="6" />
        <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
        <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
        <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
        <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
      </svg>
    ),
    'shield-off': (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <path d="M19.69 14a6.9 6.9 0 0 0 .31-2V5l-8-3-3.16 1.18" />
        <path d="M4.73 4.73L4 5v7c0 6 8 10 8 10a20.29 20.29 0 0 0 5.62-4.38" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    ),
    briefcase: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    ),
    'check-circle': (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    layers: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </svg>
    ),
    activity: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    'trending-up': (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
    check: (
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
    twitter: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" />
      </svg>
    ),
    github: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
      </svg>
    ),
    disc: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  };
  return (icons[name] as React.ReactElement) || null;
};

// ─── Background Effects ───────────────────────────────────────────────────────

const BackgroundEffects = () => (
  <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
    <div style={{ ...customStyles.bgGridAnimated, position: 'absolute', inset: 0, opacity: 0.4 }} />
    <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: 384, height: 384, background: '#0ea5e9', borderRadius: '50%', mixBlendMode: 'screen', filter: 'blur(128px)', opacity: 0.2, animation: 'blob 7s infinite' }} />
    <div style={{ position: 'absolute', top: '20%', right: '-10%', width: 384, height: 384, background: '#6366f1', borderRadius: '50%', mixBlendMode: 'screen', filter: 'blur(128px)', opacity: 0.2, animation: 'blob 7s infinite 2s' }} />
    <div style={{ position: 'absolute', bottom: '-20%', left: '20%', width: 500, height: 500, background: '#0284c7', borderRadius: '50%', mixBlendMode: 'screen', filter: 'blur(150px)', opacity: 0.1, animation: 'blob 7s infinite 4s' }} />
  </div>
);

// ─── Hero Section ─────────────────────────────────────────────────────────────

const HeroSection = ({ onEnterApp }: { onEnterApp: () => void }) => (
  <section
    className="w-full px-6 md:px-12 flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-20"
    style={{ minHeight: '100vh', maxWidth: '1440px', paddingTop: '128px', paddingBottom: '80px', margin: '0 auto' }}
  >
    <div className="lg:w-1/2 flex flex-col items-start" style={{ position: 'relative', zIndex: 20 }}>
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-full mb-6 w-fit"
        style={{ border: '1px solid rgba(14, 165, 233, 0.2)', background: 'rgba(14, 165, 233, 0.1)', animation: 'slideUpFade 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
      >
        <span className="relative flex" style={{ width: 8, height: 8 }}>
          <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#0ea5e9', opacity: 0.75, animation: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite' }} />
          <span style={{ position: 'relative', display: 'inline-flex', borderRadius: '50%', width: 8, height: 8, background: '#0ea5e9' }} />
        </span>
        <span className="text-xs font-medium uppercase tracking-widest" style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#0ea5e9' }}>
          Live on Aleo Testnet
        </span>
      </div>

      <h1
        className="text-5xl md:text-7xl font-bold leading-tight tracking-tight mb-6"
        style={{ lineHeight: 1.1, animation: 'slideUpFade 0.8s cubic-bezier(0.16, 1, 0.3, 1) 100ms forwards', opacity: 0 }}
      >
        <span className="block text-white">Confidential</span>
        <span className="block pb-2" style={{ background: 'linear-gradient(to right, #0ea5e9, #bae6fd, #6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
          Money Markets
        </span>
      </h1>

      <p
        className="text-lg md:text-xl font-light leading-relaxed mb-10"
        style={{ color: '#94a3b8', maxWidth: '560px', animation: 'slideUpFade 0.8s cubic-bezier(0.16, 1, 0.3, 1) 200ms forwards', opacity: 0, fontFamily: "'IBM Plex Sans', sans-serif" }}
      >
        Supply, borrow, and manage capital on the Aleo blockchain with zero-knowledge privacy. Xyra eliminates MEV and protects your strategies while maintaining absolute on-chain solvency.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-6 w-full sm:w-auto" style={{ animation: 'slideUpFade 0.8s cubic-bezier(0.16, 1, 0.3, 1) 300ms forwards', opacity: 0 }}>
        <button
          id="hero-enter-app-btn"
          onClick={onEnterApp}
          className="group relative px-8 py-4 font-semibold rounded-xl overflow-hidden w-full sm:w-auto flex justify-center items-center gap-2"
          style={{ background: 'rgba(14, 165, 233, 0.1)', color: '#38bdf8', border: '1px solid rgba(14, 165, 233, 0.3)', transition: 'border-color 0.3s', fontFamily: "'IBM Plex Sans', sans-serif" }}
        >
          <span className="relative z-10 flex items-center gap-2">
            Enter Protocol
            <FeatherIcon name="arrow-up-right" style={{ width: 16, height: 16 }} />
          </span>
        </button>
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
          <a
            href="/docs"
            className="text-sm flex items-center gap-2 transition-colors hover:text-slate-400"
            style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#64748b' }}
          >
            <FeatherIcon name="book-open" style={{ width: 16, height: 16 }} /> Read Documentation
          </a>
          <a
            href="/whitepaper"
            className="text-sm flex items-center gap-2 transition-colors hover:text-slate-400"
            style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#64748b' }}
          >
            <FeatherIcon name="book-open" style={{ width: 16, height: 16 }} /> Technical Whitepaper
          </a>
        </div>
      </div>
    </div>

    <div className="lg:w-1/2 relative w-full mt-12 lg:mt-0 overflow-hidden" style={{ height: '500px' }}>
      <div className="absolute rounded-full pointer-events-none" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 300, height: 300, border: '1px solid rgba(255,255,255,0.05)', animation: 'spin 40s linear infinite' }} />
      <div className="absolute rounded-full pointer-events-none" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 400, height: 400, border: '1px dashed rgba(255,255,255,0.05)', animation: 'spin 60s linear reverse infinite' }} />

      <div className="absolute rounded-2xl p-5 z-30" style={{ ...customStyles.glassPanel, top: '5%', right: '5%', width: 256, borderTop: '1px solid rgba(14, 165, 233, 0.3)', boxShadow: '0 10px 30px -10px rgba(14,165,233,0.2)', animation: 'float 6s ease-in-out infinite' }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-lg" style={{ background: '#0B1221' }}>
            <FeatherIcon name="eye-off" style={{ width: 16, height: 16, color: '#0ea5e9' }} />
          </div>
          <h3 className="text-sm font-semibold text-white">Private reserves</h3>
        </div>
        <div className="space-y-2">
          <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: '#0B1221' }}>
            <div className="h-full rounded-full" style={{ width: '75%', background: '#0ea5e9' }} />
          </div>
          <p className="text-xs" style={{ color: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace" }}>Confidentiality: Active</p>
        </div>
      </div>

      <div className="absolute rounded-2xl p-5 z-20" style={{ ...customStyles.glassPanel, top: '40%', left: '5%', width: 288, borderLeft: '1px solid rgba(99, 102, 241, 0.3)', animation: 'float 8s ease-in-out infinite' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <FeatherIcon name="shield" style={{ width: 16, height: 16, color: '#6366f1' }} /> ZK Risk Engine
          </h3>
          <span className="text-xs px-2 py-1 rounded" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, background: 'rgba(34, 197, 94, 0.1)', color: '#4ade80' }}>Secure</span>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: '#94a3b8' }}>
          Collateral checks and liquidations proven mathematically without revealing absolute positions.
        </p>
      </div>

      <div className="absolute rounded-2xl p-5 z-30" style={{ ...customStyles.glassPanel, bottom: '10%', right: '10%', width: 240, background: 'rgba(255,255,255,0.01)', animation: 'float 4s ease-in-out infinite' }}>
        <div className="flex items-start gap-3">
          <FeatherIcon name="zap-off" style={{ width: 20, height: 20, color: '#facc15', marginTop: 2 }} />
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">MEV-Free Design</h3>
            <p className="text-xs" style={{ color: '#475569', fontFamily: "'IBM Plex Mono', monospace" }}>Zero front-running.</p>
          </div>
        </div>
      </div>
    </div>
  </section>
);

// ─── Architecture Section ─────────────────────────────────────────────────────

const ArchitectureSection = () => {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  return (
    <section className="w-full px-6 md:px-12 py-20" style={{ maxWidth: '1440px', margin: '0 auto' }}>
      <div className="mb-16 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-sm tracking-widest font-semibold mb-3 uppercase flex items-center gap-2" style={{ color: '#0ea5e9', fontFamily: "'IBM Plex Mono', monospace" }}>
            <span style={{ width: 32, height: 1, background: '#0ea5e9', display: 'inline-block' }} /> Architecture
          </h2>
          <h3 className="text-3xl md:text-5xl font-bold text-white">Built for Privacy First</h3>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: '#94a3b8', maxWidth: '28rem' }}>
          Xyra leverages Aleo&apos;s record model and snarkVM to execute state transitions off-chain while verifying proofs on-chain, ensuring absolute privacy.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main card */}
        <div
          className="rounded-3xl p-8 md:p-12 relative overflow-hidden lg:col-span-7"
          style={{ ...customStyles.glassPanel, transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)', ...(hoveredCard === 'main' ? { background: 'rgba(11, 18, 33, 0.6)', borderColor: 'rgba(14, 165, 233, 0.3)', transform: 'translateY(-5px)', boxShadow: '0 20px 40px -10px rgba(14, 165, 233, 0.15)' } : {}) }}
          onMouseEnter={() => setHoveredCard('main')}
          onMouseLeave={() => setHoveredCard(null)}
        >
          <div style={{ position: 'absolute', top: 0, right: 0, width: 256, height: 256, background: hoveredCard === 'main' ? 'rgba(14, 165, 233, 0.2)' : 'rgba(14, 165, 233, 0.1)', borderRadius: '50%', filter: 'blur(80px)', transition: 'background 0.3s' }} />
          <div className="relative flex flex-col h-full justify-between" style={{ zIndex: 10 }}>
            <div>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-8" style={{ background: '#0B1221', border: '1px solid rgba(255,255,255,0.05)', color: '#0ea5e9', transition: 'transform 0.3s', transform: hoveredCard === 'main' ? 'scale(1.1)' : 'scale(1)' }}>
                <FeatherIcon name="lock" style={{ width: 24, height: 24 }} />
              </div>
              <h4 className="text-2xl font-bold text-white mb-4">Record-Based Balances</h4>
              <p className="leading-relaxed" style={{ color: '#94a3b8', maxWidth: '32rem' }}>
                Unlike account-based models where every balance is public, Xyra uses Aleo&apos;s record model. Your supplied assets, borrowed amounts, and collateral ratios exist only as private records known to you.
              </p>
            </div>
            <div className="mt-8 rounded-xl overflow-hidden relative" style={customStyles.codeBlock}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: '#0ea5e9' }} />
              <div style={{ paddingLeft: 12 }}>
                <span style={{ color: '#0ea5e9' }}>record</span> UserPosition {'{'}<br />
                &nbsp;&nbsp;owner: address.private,<br />
                &nbsp;&nbsp;supplied_usdc: u64.private,<br />
                &nbsp;&nbsp;borrowed_eth: u64.private,<br />
                {'}'}
              </div>
            </div>
          </div>
        </div>

        {/* Right column cards */}
        <div className="flex flex-col gap-6 lg:col-span-5">
          <div
            className="rounded-3xl p-8 flex-1"
            style={{ ...customStyles.glassPanel, transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)', ...(hoveredCard === 'offchain' ? { background: 'rgba(11, 18, 33, 0.6)', borderColor: 'rgba(14, 165, 233, 0.3)', transform: 'translateY(-5px)', boxShadow: '0 20px 40px -10px rgba(14, 165, 233, 0.15)' } : {}) }}
            onMouseEnter={() => setHoveredCard('offchain')}
            onMouseLeave={() => setHoveredCard(null)}
          >
            <div className="flex justify-between items-start mb-6">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: '#0B1221', border: '1px solid rgba(255,255,255,0.05)', color: '#6366f1', transition: 'transform 0.3s', transform: hoveredCard === 'offchain' ? 'rotate(12deg)' : 'rotate(0)' }}>
                <FeatherIcon name="cpu" style={{ width: 20, height: 20 }} />
              </div>
              <span className="px-2 py-1 rounded uppercase tracking-wider" style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: '#64748b', background: '#0B1221' }}>Computation</span>
            </div>
            <h4 className="text-xl font-bold text-white mb-3">Off-chain Risk Engine</h4>
            <p className="text-sm leading-relaxed" style={{ color: '#94a3b8' }}>
              Interest calculation and health factor checks occur off-chain. Only the zero-knowledge proof of correct execution is posted to Aleo, saving gas and hiding strategy.
            </p>
          </div>

          <div
            className="rounded-3xl p-8 flex-1 relative overflow-hidden"
            style={{ ...customStyles.glassPanel, transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)', ...(hoveredCard === 'liquidations' ? { background: 'rgba(11, 18, 33, 0.6)', borderColor: 'rgba(14, 165, 233, 0.3)', transform: 'translateY(-5px)', boxShadow: '0 20px 40px -10px rgba(14, 165, 233, 0.15)' } : {}) }}
            onMouseEnter={() => setHoveredCard('liquidations')}
            onMouseLeave={() => setHoveredCard(null)}
          >
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, transparent, rgba(239,68,68,0.05))', opacity: hoveredCard === 'liquidations' ? 1 : 0, transition: 'opacity 0.3s' }} />
            <div className="flex justify-between items-start mb-6 relative" style={{ zIndex: 10 }}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: '#0B1221', border: '1px solid rgba(255,255,255,0.05)', color: '#f87171', transition: 'transform 0.3s', transform: hoveredCard === 'liquidations' ? 'translateY(-4px)' : 'translateY(0)' }}>
                <FeatherIcon name="shield-off" style={{ width: 20, height: 20 }} />
              </div>
              <span className="px-2 py-1 rounded uppercase tracking-wider" style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: '#64748b', background: '#0B1221' }}>Protection</span>
            </div>
            <h4 className="text-xl font-bold text-white mb-3 relative" style={{ zIndex: 10 }}>Liquidations without MEV</h4>
            <p className="text-sm leading-relaxed relative" style={{ color: '#94a3b8', zIndex: 10 }}>
              Public liquidation auctions lead to predatory MEV. Xyra uses protocol-controlled, private keepers to execute liquidations fairly, preserving value for borrowers.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

// ─── Features Section ─────────────────────────────────────────────────────────

const featureCards = [
  { icon: 'briefcase', title: 'Institutional Grade', desc: 'Manage corporate treasuries on the Aleo blockchain without broadcasting capital moves to competitors or the public.' },
  { icon: 'check-circle', title: 'Provable Solvency', desc: 'Despite hidden user balances, on-chain reserve totals and protocol solvency are mathematically proven via ZK.' },
  { icon: 'layers', title: 'Composable Yield', desc: 'Supplied assets generate private yield-bearing tokens, composable with other Aleo DeFi protocols.' },
  { icon: 'shield', title: 'Compliance Rails', desc: 'Optional zK-KYC integrations on the Aleo blockchain allow whitelisted pools without exposing underlying identity data.' },
  { icon: 'activity', title: 'Dynamic Rates', desc: 'Per-reserve borrow and supply rates from utilization (Aave-style linear curve), with on-chain parameters and oracle-backed prices.' },
  { icon: 'trending-up', title: 'Future ZK Credit', desc: 'Foundation built to support uncollateralized lending via private on-chain reputation and credit scoring.' },
];

const FeaturesSection = () => {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <section className="w-full py-24 mt-12 relative overflow-hidden" style={{ background: 'rgba(11, 18, 33, 0.3)', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 500, height: 500, background: 'rgba(99, 102, 241, 0.05)', borderRadius: '50%', filter: 'blur(100px)', pointerEvents: 'none' }} />
      <div className="max-w-screen-xl mx-auto px-6 md:px-12">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Protocol Features</h2>
          <p className="text-sm max-w-xl mx-auto" style={{ color: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace" }}>
            Built on the Aleo blockchain for institutions and power users demanding financial privacy.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featureCards.map((card, idx) => (
            <div
              key={idx}
              className="group relative rounded-2xl cursor-pointer"
              style={{ padding: '1px', background: hovered === idx ? 'linear-gradient(to bottom, rgba(14,165,233,0.5), transparent)' : 'linear-gradient(to bottom, rgba(255,255,255,0.1), transparent)', transition: 'all 0.5s' }}
              onMouseEnter={() => setHovered(idx)}
              onMouseLeave={() => setHovered(null)}
            >
              <div className="rounded-2xl p-8 h-full relative overflow-hidden" style={{ background: '#050B14' }}>
                <div style={{ color: hovered === idx ? '#0ea5e9' : '#94a3b8', marginBottom: 24, transition: 'color 0.3s' }}>
                  <FeatherIcon name={card.icon} style={{ width: 24, height: 24 }} />
                </div>
                <h3 className="text-lg font-bold text-white mb-3">{card.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#94a3b8' }}>{card.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ─── Roadmap Section ──────────────────────────────────────────────────────────

const RoadmapSection = () => (
  <section className="w-full mx-auto px-6 py-24" style={{ maxWidth: '1000px' }}>
    <div className="text-center mb-16">
      <h2 className="text-3xl font-bold text-white mb-4">Development Roadmap</h2>
      <div className="mx-auto rounded-full" style={{ width: 64, height: 4, background: '#0ea5e9', boxShadow: '0 0 10px rgba(14, 165, 233, 0.5)' }} />
    </div>

    <div className="relative overflow-hidden p-2 sm:p-4">
      <div className="hidden md:block" style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 1, background: 'rgba(255,255,255,0.2)' }} />

      {/* Phase 1 */}
      <div className="mb-12 flex justify-between items-start md:items-center w-full gap-3">
        <div className="hidden md:block" style={{ width: '40%' }} />
        <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ zIndex: 20, background: '#0B1221', width: 32, height: 32, border: '2px solid #0ea5e9', boxShadow: '0 0 0 4px rgba(0,0,0,0.5)' }}>
          <div style={{ width: 12, height: 12, background: '#0ea5e9', borderRadius: '50%', animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' }} />
        </div>
        <div className="rounded-2xl px-4 sm:px-6 py-5 w-[calc(100%-44px)] md:w-[40%]" style={{ ...customStyles.glassPanel, borderLeft: '4px solid #0ea5e9' }}>
          <h4 className="mb-1 text-xs tracking-widest" style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#0ea5e9' }}>PHASE 1 (CURRENT)</h4>
          <h3 className="mb-3 font-bold text-lg text-white">Private Lending Core</h3>
          <ul className="text-sm space-y-2" style={{ color: '#94a3b8' }}>
            <li className="flex items-start gap-2"><FeatherIcon name="check" style={{ width: 12, height: 12, color: '#0ea5e9', marginTop: 4, flexShrink: 0 } as React.CSSProperties} /> Dual-pool Aave-style (ALEO + stables, one program)</li>
            <li className="flex items-start gap-2"><FeatherIcon name="check" style={{ width: 12, height: 12, color: '#0ea5e9', marginTop: 4, flexShrink: 0 } as React.CSSProperties} /> Utilization-based rates &amp; compound indices</li>
            <li className="flex items-start gap-2"><FeatherIcon name="check" style={{ width: 12, height: 12, color: '#0ea5e9', marginTop: 4, flexShrink: 0 } as React.CSSProperties} /> Cross-collateral portfolio health</li>
            <li className="flex items-start gap-2"><FeatherIcon name="check" style={{ width: 12, height: 12, color: '#0ea5e9', marginTop: 4, flexShrink: 0 } as React.CSSProperties} /> Flash loans (ALEO path; more reserves planned)</li>
            <li className="flex items-start gap-2"><FeatherIcon name="check" style={{ width: 12, height: 12, color: '#0ea5e9', marginTop: 4, flexShrink: 0 } as React.CSSProperties} /> Aleo testnet + live app</li>
          </ul>
        </div>
      </div>

      {/* Phase 2 */}
      <div className="mb-12 flex md:flex-row-reverse justify-between items-start md:items-center w-full gap-3">
        <div className="hidden md:block" style={{ width: '40%' }} />
        <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ zIndex: 20, background: '#0B1221', width: 32, height: 32, border: '2px solid #6366f1', boxShadow: '0 0 0 4px rgba(0,0,0,0.5)' }} />
        <div className="rounded-2xl px-4 sm:px-6 py-5 w-[calc(100%-44px)] md:w-[40%]" style={{ ...customStyles.glassPanel, borderRight: '4px solid #6366f1', opacity: 0.8 }}>
          <h4 className="mb-1 text-xs tracking-widest" style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#6366f1' }}>PHASE 2</h4>
          <h3 className="mb-3 font-bold text-lg text-white">Mainnet &amp; scale</h3>
          <ul className="text-sm space-y-2" style={{ color: '#94a3b8' }}>
            <li className="flex items-start gap-2"><div style={{ width: 4, height: 4, background: '#6366f1', borderRadius: '50%', marginTop: 8, flexShrink: 0 }} /> Mainnet-ready deployment &amp; security review</li>
            <li className="flex items-start gap-2"><div style={{ width: 4, height: 4, background: '#6366f1', borderRadius: '50%', marginTop: 8, flexShrink: 0 }} /> Hardened oracles &amp; expanded risk parameters</li>
            <li className="flex items-start gap-2"><div style={{ width: 4, height: 4, background: '#6366f1', borderRadius: '50%', marginTop: 8, flexShrink: 0 }} /> More reserves &amp; deeper liquidity</li>
          </ul>
        </div>
      </div>

      {/* Phase 3 */}
      <div className="mb-12 flex justify-between items-start md:items-center w-full gap-3">
        <div className="hidden md:block" style={{ width: '40%' }} />
        <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ zIndex: 20, background: '#0B1221', width: 32, height: 32, border: '2px solid #a855f7', boxShadow: '0 0 0 4px rgba(0,0,0,0.5)' }} />
        <div className="rounded-2xl px-4 sm:px-6 py-5 w-[calc(100%-44px)] md:w-[40%]" style={{ ...customStyles.glassPanel, borderLeft: '4px solid #a855f7', opacity: 0.6 }}>
          <h4 className="mb-1 text-xs tracking-widest" style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#c084fc' }}>PHASE 3</h4>
          <h3 className="mb-3 font-bold text-lg text-white">Institutional &amp; Credit</h3>
          <ul className="text-sm space-y-2" style={{ color: '#94a3b8' }}>
            <li className="flex items-start gap-2"><div style={{ width: 4, height: 4, background: '#a855f7', borderRadius: '50%', marginTop: 8, flexShrink: 0 }} /> ZK credit scoring</li>
            <li className="flex items-start gap-2"><div style={{ width: 4, height: 4, background: '#a855f7', borderRadius: '50%', marginTop: 8, flexShrink: 0 }} /> Permissioned institutional pools</li>
            <li className="flex items-start gap-2"><div style={{ width: 4, height: 4, background: '#a855f7', borderRadius: '50%', marginTop: 8, flexShrink: 0 }} /> Undercollateralized lending</li>
          </ul>
        </div>
      </div>
    </div>
  </section>
);

// ─── Footer / CTA ─────────────────────────────────────────────────────────────

const PageFooter = () => (
  <footer className="w-full relative" style={{ background: '#020408', borderTop: '1px solid rgba(255,255,255,0.05)', zIndex: 10 }}>
    <div className="mx-auto px-6 md:px-12 py-16" style={{ maxWidth: '1440px' }}>
      <div className="rounded-3xl p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden" style={customStyles.glassPanel}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(14,165,233,0.1), transparent)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 10 }}>
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">Experience Private DeFi</h2>
          <p className="text-sm" style={{ color: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace" }}>
            Interact with Xyra lending markets on Aleo Testnet today.
          </p>
        </div>
        <Link
          id="footer-enter-app-btn"
          href="/dashboard"
          className="relative inline-flex h-10 overflow-hidden rounded-full p-px focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 shrink-0"
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
              padding: '4px 20px',
              backdropFilter: 'blur(24px)',
              fontFamily: "'Space Grotesk', sans-serif",
              position: 'relative',
              zIndex: 1,
            }}
          >
            Launch Testnet App
          </span>
        </Link>
      </div>
    </div>

    <div
      className="mx-auto px-6 md:px-12 py-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6"
      style={{ maxWidth: '1440px', borderTop: '1px solid rgba(255,255,255,0.05)' }}
    >
      <div className="flex items-center gap-3">
        <img
          src="/xyra-logo.png"
          alt="Xyra Finance"
          width={28}
          height={28}
          className="h-7 w-auto object-contain shrink-0 opacity-90"
        />
        <span className="text-sm" style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#64748b' }}>
          © {new Date().getFullYear()} Xyra Finance
        </span>
      </div>
      <nav
        className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
        aria-label="Documentation"
      >
        <Link href="/docs" className="text-slate-500 hover:text-cyan-400 transition-colors">
          Documentation
        </Link>
        <Link href="/whitepaper" className="text-slate-500 hover:text-cyan-400 transition-colors">
          Whitepaper
        </Link>
      </nav>
    </div>
  </footer>
);

// ─── Main Page ────────────────────────────────────────────────────────────────

const MainPage: NextPageWithLayout = () => {
  const router = useRouter();

  // ── existing logic (untouched) ──────────────────────────────────────────────
  const handleEnterApp = () => {
    router.push('/dashboard');
  };
  // ───────────────────────────────────────────────────────────────────────────

  // Inject global keyframe animations + Google Fonts
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

      ::selection { background: rgba(14, 165, 233, 0.4); color: white; }
      ::-webkit-scrollbar { width: 8px; }
      ::-webkit-scrollbar-track { background: #030712; }
      ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: rgba(14,165,233,0.4); }

      @keyframes slideUpFade {
        0%   { opacity: 0; transform: translateY(40px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      @keyframes blob {
        0%   { transform: translate(0px, 0px) scale(1); }
        33%  { transform: translate(30px, -50px) scale(1.1); }
        66%  { transform: translate(-20px, 20px) scale(0.9); }
        100% { transform: translate(0px, 0px) scale(1); }
      }
      @keyframes float {
        0%, 100% { transform: translateY(0); }
        50%       { transform: translateY(-20px); }
      }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }
      @keyframes ping {
        75%, 100% { transform: scale(2); opacity: 0; }
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.5; }
      }
      @keyframes gridMove {
        0%   { transform: translateY(0); }
        100% { transform: translateY(50px); }
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  return (
    <>
      <NextSeo
        title="Xyra Finance – Private Lending & Borrowing on Aleo"
        description="Xyra Finance is a privacy-first money market on Aleo: private lending, borrowing, and institutional-grade credit rails powered by zero-knowledge proofs."
        openGraph={{
          title: 'Xyra Finance – Private Lending & Borrowing on Aleo',
          description:
            'Private, compliant, MEV-free money markets on Aleo. Supply, borrow, and manage capital with full confidentiality.',
        }}
      />

      <div style={{ backgroundColor: '#030712', color: '#f8fafc', minHeight: '100vh', position: 'relative', overflowX: 'hidden', fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <BackgroundEffects />

        <main className="relative flex flex-col items-center w-full" style={{ zIndex: 10 }}>
          <HeroSection onEnterApp={handleEnterApp} />

          {/* Divider */}
          <div className="w-full px-6 py-12" style={{ maxWidth: '1440px' }}>
            <div style={{ width: '100%', height: 1, background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent)' }} />
          </div>

          <ArchitectureSection />
          <FeaturesSection />
          <RoadmapSection />
        </main>

        <PageFooter />
      </div>
    </>
  );
};

MainPage.getLayout = (page) => <Layout>{page}</Layout>;
export default MainPage;
