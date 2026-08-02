"use client";

import * as React from "react";

type Theme = "dark" | "light";

interface UIState {
  theme: Theme;
  toggleTheme: () => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;
  compactTables: boolean;
  setCompactTables: (v: boolean) => void;
}

const UIStateContext = React.createContext<UIState | null>(null);

const THEME_KEY = "biggbee-crm-theme";
const SIDEBAR_KEY = "biggbee-crm-sidebar-collapsed";
const COMPACT_KEY = "biggbee-crm-compact-tables";

export function UIStateProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = React.useState<Theme>("dark");
  const [sidebarCollapsed, setSidebarCollapsedState] = React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [compactTables, setCompactTablesState] = React.useState(false);

  // One-time sync from localStorage after hydration. This must stay in an effect (not a lazy
  // initializer) so the hydration render matches the server HTML; the setState-in-effect rule
  // is intentionally waived for this canonical read-external-store-on-mount case.
  React.useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_KEY) as Theme | null;
    const storedSidebar = window.localStorage.getItem(SIDEBAR_KEY);
    const storedCompact = window.localStorage.getItem(COMPACT_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (storedTheme) setTheme(storedTheme);
    if (storedSidebar) setSidebarCollapsedState(storedSidebar === "true");
    if (storedCompact) setCompactTablesState(storedCompact === "true");
  }, []);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const setSidebarCollapsed = React.useCallback((v: boolean) => {
    setSidebarCollapsedState(v);
    window.localStorage.setItem(SIDEBAR_KEY, String(v));
  }, []);

  const setCompactTables = React.useCallback((v: boolean) => {
    setCompactTablesState(v);
    window.localStorage.setItem(COMPACT_KEY, String(v));
  }, []);

  const toggleTheme = React.useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);

  const value: UIState = {
    theme,
    toggleTheme,
    sidebarCollapsed,
    setSidebarCollapsed,
    mobileNavOpen,
    setMobileNavOpen,
    compactTables,
    setCompactTables,
  };

  return <UIStateContext.Provider value={value}>{children}</UIStateContext.Provider>;
}

export function useUIState() {
  const ctx = React.useContext(UIStateContext);
  if (!ctx) throw new Error("useUIState must be used within UIStateProvider");
  return ctx;
}
