import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type FirmOut, type TicketOut } from "./client";
import { useAuth } from "./AuthContext";
import { Badge, Card, ErrorBanner, PageHeader } from "./ui";

export function DashboardPage() {
  const { user } = useAuth();
  const [firms, setFirms] = useState<FirmOut[]>([]);
  const [tickets, setTickets] = useState<TicketOut[]>([]);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const f = await api.listFirms();
        setFirms(f);
        const t =
          user.role === "super_admin"
            ? await api.listAllTickets()
            : user.firm_id
              ? await api.listFirmTickets(user.firm_id)
              : [];
        setTickets(t);
      } catch (e) {
        setError(e);
      }
    })();
  }, [user]);

  const counts = {
    pending: tickets.filter((t) => t.status === "pending").length,
    sent: tickets.filter((t) => t.status === "sent").length,
    failed: tickets.filter((t) => t.status === "failed").length,
  };

  return (
    <div className="p-8">
      <PageHeader title={`Hei, ${user?.full_name ?? user?.email}`} />
      <ErrorBanner error={error} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Stat label={user?.role === "super_admin" ? "Firmaer" : "Mitt firma"} value={firms.length} />
        <Stat label="Henvendelser totalt" value={tickets.length} />
        <Stat label="Sendt" value={counts.sent} tone="green" />
        <Stat label="Feilet" value={counts.failed} tone="red" />
      </div>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-3">Siste henvendelser</h2>
        {tickets.length === 0 ? (
          <p className="text-sm text-slate-500">Ingen henvendelser ennå.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tickets.slice(0, 8).map((t) => (
              <li key={t.id} className="py-3 flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-slate-800">
                    {t.customer_name || t.customer_email}
                  </div>
                  <div className="text-xs text-slate-500 truncate max-w-xl">{t.message}</div>
                </div>
                <div className="text-right">
                  <StatusBadge status={t.status} />
                  <div className="text-xs text-slate-400 mt-1">
                    {new Date(t.created_at).toLocaleString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <Link
            to={user?.role === "super_admin" ? "/admin/tickets" : `/admin/firms/${user?.firm_id}/tickets`}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Se alle henvendelser →
          </Link>
        </div>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number;
  tone?: "slate" | "green" | "red";
}) {
  const colors: Record<string, string> = {
    slate: "text-slate-900",
    green: "text-emerald-600",
    red: "text-red-600",
  };
  return (
    <Card className="p-5">
      <div className="text-xs uppercase text-slate-500 tracking-wide">{label}</div>
      <div className={`text-3xl font-semibold mt-1 ${colors[tone]}`}>{value}</div>
    </Card>
  );
}

export function StatusBadge({ status }: { status: TicketOut["status"] }) {
  if (status === "sent") return <Badge tone="green">Sendt</Badge>;
  if (status === "failed") return <Badge tone="red">Feilet</Badge>;
  return <Badge tone="amber">Venter</Badge>;
}
