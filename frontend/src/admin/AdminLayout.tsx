import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

const linkBase =
  "block rounded-md px-3 py-2 text-sm font-medium transition-colors";
const linkIdle = "text-slate-300 hover:bg-slate-800 hover:text-white";
const linkActive = "bg-indigo-600 text-white";

function Item({ to, label, end }: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}
    >
      {label}
    </NavLink>
  );
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const isSuper = user?.role === "super_admin";

  return (
    <div className="min-h-screen flex bg-slate-100">
      <aside className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="px-5 py-5 border-b border-slate-800">
          <div className="text-lg font-bold">Betala Link</div>
          <div className="text-xs text-slate-400">Admin portal</div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <Item to="/admin" label="Dashboard" end />
          {isSuper && <Item to="/admin/firms" label="Firmaer" />}
          {isSuper && <Item to="/admin/catalog" label="Produktkatalog" />}
          <Item
            to={isSuper ? "/admin/firms" : `/admin/firms/${user?.firm_id}/products`}
            label="Produkter"
          />
          <Item
            to={isSuper ? "/admin/firms" : `/admin/firms/${user?.firm_id}/assets`}
            label="Enheter"
          />
          {!isSuper && user?.firm_id && (
            <Item
              to={`/admin/firms/${user.firm_id}/register`}
              label="Hurtigregistrering"
            />
          )}
          <Item
            to={isSuper ? "/admin/firms" : `/admin/firms/${user?.firm_id}/accessories`}
            label="Tilbehør"
          />
          <Item
            to={isSuper ? "/admin/tickets" : `/admin/firms/${user?.firm_id}/tickets`}
            label="Henvendelser"
          />
          <Item to="/admin/users" label="Brukere" />
          <Item to="/admin/labels" label="Etiketter" />
          <Item to="/admin/test-email" label="Test e-post" />
        </nav>

        <div className="p-3 border-t border-slate-800 text-xs text-slate-400 space-y-2">
          <div className="truncate">{user?.email}</div>
          <div className="uppercase tracking-wide text-[10px]">
            {user?.role === "super_admin" ? "Super Admin" : "Firm Admin"}
          </div>
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

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
