import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "tagly.theme";

function readStored(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

function applyClass(mode: ThemeMode) {
  const root = document.documentElement;
  const dark = mode === "dark" || (mode === "system" && systemPrefersDark());
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

interface ThemeCtx {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (m: ThemeMode) => void;
  cycle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStored());
  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    mode === "dark" || (mode === "system" && systemPrefersDark()) ? "dark" : "light"
  );

  useEffect(() => {
    applyClass(mode);
    setResolved(mode === "dark" || (mode === "system" && systemPrefersDark()) ? "dark" : "light");
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  // Track OS-level changes when in system mode.
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      applyClass("system");
      setResolved(systemPrefersDark() ? "dark" : "light");
    };
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, [mode]);

  const value = useMemo<ThemeCtx>(() => {
    const order: ThemeMode[] = ["light", "dark", "system"];
    return {
      mode,
      resolved,
      setMode: setModeState,
      cycle: () => setModeState((m) => order[(order.indexOf(m) + 1) % order.length]),
    };
  }, [mode, resolved]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

const ICONS: Record<ThemeMode, string> = { light: "☀️", dark: "🌙", system: "🖥️" };
const LABELS: Record<ThemeMode, string> = { light: "Lyst", dark: "Mørkt", system: "System" };

/** Compact button used in sidebars/headers. Cycles light → dark → system. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { mode, cycle } = useTheme();
  return (
    <button
      type="button"
      onClick={cycle}
      title={`Tema: ${LABELS[mode]} (klikk for å bytte)`}
      aria-label={`Bytt tema – nåværende: ${LABELS[mode]}`}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md text-sm transition-colors ${className}`}
    >
      <span aria-hidden>{ICONS[mode]}</span>
      <span className="text-xs">{LABELS[mode]}</span>
    </button>
  );
}

/**
 * Floating toggle for unauthenticated/public pages (Login, Forgot, Reset, ProductPage)
 * which don't have a sidebar. Renders fixed top-right.
 */
export function FloatingThemeToggle() {
  return (
    <ThemeToggle className="fixed top-3 right-3 z-50 px-2.5 py-1.5 bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 shadow-sm backdrop-blur" />
  );
}
