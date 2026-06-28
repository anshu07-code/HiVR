"use client";

// Theme provider: persists the chosen mode to localStorage AND syncs to
// users.theme_preference when logged in. Three modes — Light, Dark, and
// Eye-shield — no Auto/Automatic. The default is "light".

import * as React from "react";

export type ThemeMode = "light" | "dark" | "eye_shield";
export type ResolvedMode = "light" | "dark" | "eye_shield";

const STORAGE_KEY = "hivr-theme";

type ThemeContextValue = {
  mode: ThemeMode;
  resolved: ResolvedMode;
  setMode: (m: ThemeMode) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function applyClass(resolved: ResolvedMode) {
  const root = document.documentElement;
  root.classList.remove("light", "dark", "eye-shield");
  if (resolved === "light") root.classList.add("light");
  else if (resolved === "dark") root.classList.add("dark");
  else if (resolved === "eye_shield") root.classList.add("eye-shield");
}

export function ThemeProvider({ children, defaultMode = "light" as ThemeMode }: {
  children: React.ReactNode;
  defaultMode?: ThemeMode;
}) {
  const [mode, setModeState] = React.useState<ThemeMode>(defaultMode);

  // Initial load: prefer localStorage, fall back to default
  React.useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (stored && (stored === "light" || stored === "dark" || stored === "eye_shield")) {
      setModeState(stored);
    }
  }, []);

  // Apply class whenever mode changes
  React.useEffect(() => {
    applyClass(mode);
  }, [mode]);

  const setMode = React.useCallback((m: ThemeMode) => {
    setModeState(m);
    try { localStorage.setItem(STORAGE_KEY, m); } catch {}
    // Server sync — best-effort, no need to block the UI
    fetch("/api/me/theme", { method: "POST", body: JSON.stringify({ theme: m }) }).catch(() => {});
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, resolved: mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
