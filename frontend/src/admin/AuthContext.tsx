import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, tokenStore, type MeFirmOut, type UserOut } from "./client";

const ACTIVE_FIRM_KEY = "betala_active_firm";

interface AuthCtx {
  user: UserOut | null;
  loading: boolean;
  /** Firms the current user can act in (primary + memberships, or all if super-admin). */
  firms: MeFirmOut[];
  /** Currently active firm id used by firm-scoped pages. */
  activeFirmId: string | null;
  setActiveFirmId: (id: string) => void;
  login: (email: string, password: string, totpCode?: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserOut | null>(null);
  const [firms, setFirms] = useState<MeFirmOut[]>([]);
  const [activeFirmId, setActiveFirmIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const setActiveFirmId = useCallback((id: string) => {
    setActiveFirmIdState(id);
    try {
      localStorage.setItem(ACTIVE_FIRM_KEY, id);
    } catch {
      /* ignore quota errors */
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      setUser(null);
      setFirms([]);
      setActiveFirmIdState(null);
      setLoading(false);
      return;
    }
    try {
      const [me, fs] = await Promise.all([api.me(), api.meFirms()]);
      setUser(me);
      setFirms(fs);

      // Pick active firm: stored value if it's still accessible, else
      // primary, else first available.
      const stored = (() => {
        try {
          return localStorage.getItem(ACTIVE_FIRM_KEY);
        } catch {
          return null;
        }
      })();
      const accessibleIds = new Set(fs.map((f) => f.id));
      let next: string | null = null;
      if (stored && accessibleIds.has(stored)) next = stored;
      else if (me.firm_id && accessibleIds.has(me.firm_id)) next = me.firm_id;
      else if (fs.length > 0) next = fs[0].id;
      setActiveFirmIdState(next);
      if (next) {
        try {
          localStorage.setItem(ACTIVE_FIRM_KEY, next);
        } catch {
          /* ignore */
        }
      }
    } catch {
      tokenStore.clear();
      setUser(null);
      setFirms([]);
      setActiveFirmIdState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = async (email: string, password: string, totpCode?: string) => {
    const { access_token } = await api.login(email, password, totpCode);
    tokenStore.set(access_token);
    // Drop any stored active-firm choice so the new user gets a fresh default.
    try {
      localStorage.removeItem(ACTIVE_FIRM_KEY);
    } catch {
      /* ignore */
    }
    await refresh();
  };

  const logout = () => {
    tokenStore.clear();
    try {
      localStorage.removeItem(ACTIVE_FIRM_KEY);
    } catch {
      /* ignore */
    }
    setUser(null);
    setFirms([]);
    setActiveFirmIdState(null);
  };

  return (
    <Ctx.Provider
      value={{ user, loading, firms, activeFirmId, setActiveFirmId, login, logout, refresh }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
