import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { ChangePasswordModal } from "./ChangePasswordModal";

const linkBase =
  "block rounded-md px-3 py-2 text-sm font-medium transition-colors";
const linkIdle = "text-slate-300 hover:bg-slate-800 hover:text-white";
const linkActive = "bg-indigo-600 text-white";

function Item({
  to,
  label,
  end,
  onNavigate,
}: {
  to: string;
  label: string;
  end?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}
    >
      {label}
    </NavLink>
  );
}

export function AdminLayout() {
  const { user, logout, firms, activeFirmId, setActiveFirmId } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const isSuper = user?.role === "super_admin";
  // Firm-scoped pages target the active firm (which may be the primary firm
  // or a membership-firm the operator switched into).
  const firmId = activeFirmId ?? user?.firm_id ?? "";
  const showSwitcher = firms.length > 1;

  // Mobile drawer state. Closed by default; auto-close whenever the route
  // changes so tapping a link returns focus to the page content.
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    setDrawerOpen(false);
  }, [loc.pathname]);

  const closeDrawer = () => setDrawerOpen(false);
  const [pwOpen, setPwOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-100">
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between bg-slate-900 text-white px-4 py-3 shadow">
        <button
          type="button"
          onClick={() => setDrawerOpen((v) => !v)}
          className="p-2 -ml-2 rounded-md hover:bg-slate-800"
          aria-label={drawerOpen ? "Lukk meny" : "Åpne meny"}
          aria-expanded={drawerOpen}
        >
          {drawerOpen ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
        <div className="font-semibold">Betala Link</div>
        <div className="w-9" />
      </header>

      {/* Mobile backdrop */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

      <aside
        className={`bg-slate-900 text-white flex flex-col
          fixed inset-y-0 left-0 w-72 max-w-[85vw] z-50
          transform transition-transform duration-200 ease-out
          ${drawerOpen ? "translate-x-0" : "-translate-x-full"}
          md:relative md:translate-x-0 md:w-64 md:min-h-screen md:sticky md:top-0 md:z-auto md:max-w-none`}
      >
        <div className="hidden md:block px-5 py-5 border-b border-slate-800">
          <div className="text-lg font-bold">Betala Link</div>
          <div className="text-xs text-slate-400">Admin portal</div>
        </div>

        {showSwitcher && (
          <div className="px-3 pt-3">
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1">
              Aktivt firma
            </label>
            <select
              value={activeFirmId ?? ""}
              onChange={(e) => {
                const id = e.target.value;
                setActiveFirmId(id);
                // Send the user to the dashboard so any /firms/:firmId/...
                // route they were on gets re-rendered against the new firm.
                nav("/admin");
              }}
              className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {firms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {f.is_primary ? " ★" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <Item to="/admin" label="Dashboard" end onNavigate={closeDrawer} />
          {isSuper && <Item to="/admin/firms" label="Firmaer" onNavigate={closeDrawer} />}
          {isSuper && <Item to="/admin/catalog" label="Produktkatalog" onNavigate={closeDrawer} />}
          {firmId && <Item to={`/admin/firms/${firmId}/products`} label="Produkter" onNavigate={closeDrawer} />}
          {firmId && <Item to={`/admin/firms/${firmId}/assets`} label="Enheter" onNavigate={closeDrawer} />}
          {firmId && (
            <Item to={`/admin/firms/${firmId}/scan`} label="📷 Festival-skann" onNavigate={closeDrawer} />
          )}
          {firmId && <Item to={`/admin/firms/${firmId}/locations`} label="Lokasjoner" onNavigate={closeDrawer} />}
          {firmId && (
            <Item to={`/admin/firms/${firmId}/register`} label="Hurtigregistrering" onNavigate={closeDrawer} />
          )}
          {firmId && <Item to={`/admin/firms/${firmId}/accessories`} label="Tilbehør" onNavigate={closeDrawer} />}
          <Item
            to={isSuper && !firmId ? "/admin/tickets" : `/admin/firms/${firmId}/tickets`}
            label="Henvendelser"
            onNavigate={closeDrawer}
          />
          <Item to="/admin/users" label="Brukere" onNavigate={closeDrawer} />
          <Item to="/admin/labels" label="Etiketter" onNavigate={closeDrawer} />
          <Item to="/admin/test-email" label="Test e-post" onNavigate={closeDrawer} />
        </nav>

        <div className="p-3 border-t border-slate-800 text-xs text-slate-400 space-y-2">
          <div className="truncate">{user?.email}</div>
          <div className="uppercase tracking-wide text-[10px]">
            {user?.role === "super_admin" ? "Super Admin" : "Firm Admin"}
          </div>
          <button
            onClick={() => setPwOpen(true)}
            className="w-full bg-slate-800 hover:bg-slate-700 rounded-md py-1.5 text-white"
          >
            Endre passord
          </button>
          <button
            onClick={() => {
              logout();
              nav("/admin/login");
            }}
            className="w-full bg-slate-800 hover:bg-slate-700 rounded-md py-1.5 text-white"
          >
            Logg ut
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto min-w-0">
        <Outlet />
      </main>

      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}
