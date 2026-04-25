import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function ProtectedRoute({ requireSuper = false }: { requireSuper?: boolean }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-8 text-slate-500">Laster…</div>;
  if (!user) return <Navigate to="/admin/login" state={{ from: loc.pathname }} replace />;
  if (requireSuper && user.role !== "super_admin")
    return <Navigate to="/admin" replace />;
  return <Outlet />;
}
