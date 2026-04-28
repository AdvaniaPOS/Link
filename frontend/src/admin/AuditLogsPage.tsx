import { FormEvent, useEffect, useState } from "react";
import { api, type AuditLogOut } from "./client";
import { Button, Card, ErrorBanner, Field, Input, PageHeader, Table, Td, Th } from "./ui";

export function AuditLogsPage() {
  const [rows, setRows] = useState<AuditLogOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [target, setTarget] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 100;

  async function load(reset = false) {
    setLoading(true);
    setError(null);
    try {
      const off = reset ? 0 : offset;
      const data = await api.listAuditLogs({
        action: action || undefined,
        actor_email: actor || undefined,
        target_id: target || undefined,
        limit,
        offset: off,
      });
      setRows(data);
      if (reset) setOffset(0);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onFilter(e: FormEvent) {
    e.preventDefault();
    void load(true);
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Audit-logg" />
      <Card>
        <form
          onSubmit={onFilter}
          className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
        >
          <Field label="Handling">
            <Input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="auth.login_failed"
            />
          </Field>
          <Field label="Aktør (e-post)">
            <Input
              value={actor}
              onChange={(e) => setActor(e.target.value.toLowerCase())}
              placeholder="bruker@firma.no"
            />
          </Field>
          <Field label="Mål-ID">
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="UUID el.l."
            />
          </Field>
          <Button type="submit" disabled={loading}>
            {loading ? "Laster…" : "Filtrer"}
          </Button>
        </form>
      </Card>

      <ErrorBanner error={error} />

      <Table>
        <thead className="bg-slate-50">
          <tr>
            <Th>Tid</Th>
            <Th>Handling</Th>
            <Th>Aktør</Th>
            <Th>Mål</Th>
            <Th>IP</Th>
            <Th>Detaljer</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 && !loading && (
            <tr>
              <Td className="text-slate-400">Ingen treff</Td>
              <Td>{""}</Td>
              <Td>{""}</Td>
              <Td>{""}</Td>
              <Td>{""}</Td>
              <Td>{""}</Td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id}>
              <Td>{new Date(r.created_at).toLocaleString("nb-NO")}</Td>
              <Td><code className="text-xs">{r.action}</code></Td>
              <Td>{r.actor_email ?? "—"}</Td>
              <Td>
                {r.target_type ? (
                  <span className="text-xs">
                    {r.target_type}
                    <br />
                    <code className="text-slate-500">{r.target_id ?? ""}</code>
                  </span>
                ) : (
                  "—"
                )}
              </Td>
              <Td>{r.ip ?? "—"}</Td>
              <Td className="max-w-xs">
                {r.extra ? (
                  <code className="text-xs text-slate-500 break-all">
                    {JSON.stringify(r.extra)}
                  </code>
                ) : (
                  "—"
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <div className="flex justify-between items-center">
        <Button
          variant="secondary"
          disabled={loading || offset === 0}
          onClick={() => {
            const next = Math.max(0, offset - limit);
            setOffset(next);
            void load();
          }}
        >
          ← Forrige
        </Button>
        <div className="text-xs text-slate-500">
          Viser {offset + 1}–{offset + rows.length}
        </div>
        <Button
          variant="secondary"
          disabled={loading || rows.length < limit}
          onClick={() => {
            setOffset(offset + limit);
            void load();
          }}
        >
          Neste →
        </Button>
      </div>
    </div>
  );
}
