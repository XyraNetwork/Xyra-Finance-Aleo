'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

export type DashboardView = 'dashboard' | 'markets' | 'docs' | 'flash';

type ContextValue = {
  view: DashboardView;
  setView: (view: DashboardView) => void;
};

const DashboardViewContext = createContext<ContextValue | undefined>(undefined);

export function DashboardViewProvider({ children }: { children: React.ReactNode }) {
  const [view, setViewState] = useState<DashboardView>('dashboard');
  const setView = useCallback((v: DashboardView) => setViewState(v), []);
  return (
    <DashboardViewContext.Provider value={{ view, setView }}>
      {children}
    </DashboardViewContext.Provider>
  );
}

export function useDashboardView() {
  const ctx = useContext(DashboardViewContext);
  if (ctx === undefined) {
    throw new Error('useDashboardView must be used within DashboardViewProvider');
  }
  return ctx;
}
