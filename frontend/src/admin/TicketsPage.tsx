import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type TicketOut, type TicketStatus } from "./client";
import { useAuth } from "./AuthContext";
import { StatusBadge } from "./DashboardPage";
import { Button, Card, ErrorBanner, PageHeader, Select, Table, Td, Th } from "./ui";

export function TicketsPage() {
  const { firmId } = useParams<{ firmId: string }>();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<TicketOut[]>([]);
  const [filter, setFilter] = useState<TicketStatus | "">("");
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState<TicketOut | null>(null);

  async function reload() {
    try {
      const data = firmId
        ? await api.listFirmTickets(firmId, filter || undefined)
        : await api.listAllTickets(filter || undefined);
      setTickets(data);
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmId, filter]);

  async function retry(id: string) {
    try {
      await api.retryTicket(id);
      await reload();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <div className="p-8">
      <PageHeader
        title={firmId ? "Henvendelser" : "Alle henvendelser"}
        actions={
          <Select value={filter} onChange={(e) => setFilter(e.target.value as TicketStatus | "")}
            className="!w-auto">
            <option value="">Alle statuser</option>
            <option value="pending">Venter</option>
            <option value="sent">Sendt</option>
            <option value="failed">Feilet</option>
          </Select>
        }
      />
      <ErrorBanner error={error} />

      {tickets.length === 0 ? (
        <Card className="p-8 text-center text-slate-500">Ingen henvendelser.</Card>
      ) : (
        <Table>
          <thead className="bg-slate-50">
            <tr>
              <Th>Status</Th>
              <Th>Kunde</Th>
              <Th>Melding</Th>
              <Th>Opprettet</Th>
              <Th>Handlinger</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tickets.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <Td>
                  <StatusBadge status={t.status} />
                </Td>
                <Td>
                  <div className="font-medium">{t.customer_name || "—"}</div>
                  <div className="text-xs text-slate-500">{t.customer_email}</div>
                </Td>
                <Td className="max-w-md">
                  <div className="line-clamp-2 text-sm">{t.message}</div>
                </Td>
                <Td className="text-xs text-slate-500 whitespace-nowrap">
                  {new Date(t.created_at).toLocaleString()}
                </Td>
                <Td>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setOpen(t)}
                      className="text-sm text-indigo-600 hover:text-indigo-800"
                    >
                      Detaljer
                    </button>
                    {t.status !== "sent" && (user?.role === "super_admin" || user?.firm_id) && (
                      <button
                        onClick={() => retry(t.id)}
                        className="text-sm text-amber-700 hover:text-amber-900"
                      >
                        Prøv igjen
                      </button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {open && <TicketDrawer ticket={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function TicketDrawer({ ticket, onClose }: { ticket: TicketOut; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex justify-end" onClick={onClose}>
      <div
        className="bg-white w-full max-w-md h-full overflow-y-auto p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Henvendelse</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">
            ×
          </button>
        </div>
        <div>
          <StatusBadge status={ticket.status} />
        </div>
        <Row label="Kunde" value={ticket.customer_name || "—"} />
        <Row label="E-post" value={ticket.customer_email} />
        <Row label="Telefon" value={ticket.customer_phone || "—"} />
        <Row
          label="Foretrekker svar via"
          value={ticket.contact_preference === "phone" ? "Telefon" : "E-post"}
        />
        <Row label="Opprettet" value={new Date(ticket.created_at).toLocaleString()} />
        {ticket.sent_at && <Row label="Sendt" value={new Date(ticket.sent_at).toLocaleString()} />}
        {ticket.resend_message_id && (
          <Row label="Resend ID" value={ticket.resend_message_id} mono />
        )}
        <div>
          <div className="text-xs uppercase text-slate-500 mb-1">Melding</div>
          <pre className="bg-slate-50 rounded-md p-3 text-sm whitespace-pre-wrap">{ticket.message}</pre>
        </div>
        {ticket.attachment_url && (
          <Row label="Vedlegg" value={ticket.attachment_url} />
        )}
        {ticket.last_error && (
          <div>
            <div className="text-xs uppercase text-red-600 mb-1">Siste feil</div>
            <pre className="bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-800 whitespace-pre-wrap">
              {ticket.last_error}
            </pre>
          </div>
        )}
        <Button variant="secondary" onClick={onClose} className="w-full justify-center">
          Lukk
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
