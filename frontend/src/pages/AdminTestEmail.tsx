import { useState } from "react";
import { api } from "../admin/client";
import { Button, Card, ErrorBanner, Field, Input, PageHeader, Textarea } from "../admin/ui";

export function AdminTestEmail() {
  const [assetUuid, setAssetUuid] = useState("");
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const res = await api.sendTestEmail(assetUuid, {
        recipient_email: recipient || undefined,
        note: note || undefined,
      });
      setResult({
        ok: true,
        message: `Test-ticket ${res.id} satt i kø (status=${res.status}). Sjekk Celery-loggen og innboksen.`,
      });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-8">
      <PageHeader title="Send test-e-post" />
      <Card className="p-6 max-w-xl space-y-4">
        <p className="text-sm text-slate-600">
          Lager en syntetisk Ticket og kjører den gjennom samme Celery + Resend-pipeline som
          produksjon. Bruk for å verifisere DKIM/SPF-oppsett.
        </p>

        <ErrorBanner error={error} />

        <form onSubmit={send} className="space-y-4">
          <Field label="Asset UUID">
            <Input
              required
              value={assetUuid}
              onChange={(e) => setAssetUuid(e.target.value)}
              placeholder="abc-123-..."
            />
          </Field>
          <Field
            label="Mottaker (valgfritt)"
            hint="Defaulter til firmaets support_email_target"
          >
            <Input
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="din@inbox.no"
            />
          </Field>
          <Field label="Notat (valgfritt)">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>

          <Button type="submit" disabled={busy}>
            {busy ? "Sender…" : "Send test-e-post"}
          </Button>
        </form>

        {result && (
          <div className="rounded-md p-3 text-sm bg-emerald-50 border border-emerald-200 text-emerald-800">
            {result.message}
          </div>
        )}
      </Card>
    </div>
  );
}
