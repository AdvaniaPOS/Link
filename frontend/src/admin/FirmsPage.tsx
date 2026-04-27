import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type FirmOut } from "./client";
import { Button, Card, ErrorBanner, Field, Input, Modal, PageHeader, Table, Td, Th, useToggle } from "./ui";

export function FirmsPage() {
  const [firms, setFirms] = useState<FirmOut[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<FirmOut | null>(null);
  const modal = useToggle();

  async function reload() {
    try {
      setFirms(await api.listFirms());
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    void reload();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Slette dette firmaet og ALLE produkter, enheter og henvendelser?")) return;
    try {
      await api.deleteFirm(id);
      void reload();
    } catch (e) {
      setError(e);
    }
  }

  function openNew() {
    setEditing(null);
    modal.on();
  }
  function openEdit(f: FirmOut) {
    setEditing(f);
    modal.on();
  }

  return (
    <div className="p-8">
      <PageHeader
        title="Firmaer"
        actions={<Button onClick={openNew}>+ Nytt firma</Button>}
      />
      <ErrorBanner error={error} />

      {firms.length === 0 ? (
        <Card className="p-8 text-center text-slate-500">Ingen firmaer ennå.</Card>
      ) : (
        <Table>
          <thead className="bg-slate-50">
            <tr>
              <Th>Navn</Th>
              <Th>Brand</Th>
              <Th>Support-e-post</Th>
              <Th>Opprettet</Th>
              <Th>Handlinger</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {firms.map((f) => (
              <tr key={f.id}>
                <Td>
                  <div className="font-medium text-slate-900">{f.name}</div>
                  <div className="text-xs text-slate-400 font-mono">{f.id}</div>
                </Td>
                <Td>
                  <span
                    className="inline-block w-5 h-5 rounded border border-slate-200 align-middle mr-2"
                    style={{ backgroundColor: f.brand_color }}
                  />
                  <span className="font-mono text-xs">{f.brand_color}</span>
                </Td>
                <Td>{f.support_email_target}</Td>
                <Td className="text-xs text-slate-500">
                  {new Date(f.created_at).toLocaleDateString()}
                </Td>
                <Td>
                  <div className="flex gap-2">
                    <Link
                      to={`/admin/firms/${f.id}/products`}
                      className="text-sm text-indigo-600 hover:text-indigo-800"
                    >
                      Produkter
                    </Link>
                    <Link
                      to={`/admin/firms/${f.id}/assets`}
                      className="text-sm text-indigo-600 hover:text-indigo-800"
                    >
                      Enheter
                    </Link>
                    <Link
                      to={`/admin/firms/${f.id}/tickets`}
                      className="text-sm text-indigo-600 hover:text-indigo-800"
                    >
                      Henvendelser
                    </Link>
                    <button
                      onClick={() => openEdit(f)}
                      className="text-sm text-slate-600 hover:text-slate-900"
                    >
                      Rediger
                    </button>
                    <button
                      onClick={() => handleDelete(f.id)}
                      className="text-sm text-red-600 hover:text-red-800"
                    >
                      Slett
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <FirmModal
        open={modal.open}
        onClose={modal.off}
        firm={editing}
        onSaved={() => {
          modal.off();
          void reload();
        }}
      />
    </div>
  );
}

function FirmModal({
  open,
  onClose,
  firm,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  firm: FirmOut | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("#0F172A");
  const [logo, setLogo] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [footerAddress, setFooterAddress] = useState("");
  const [footerPhone, setFooterPhone] = useState("");
  const [footerEmail, setFooterEmail] = useState("");
  const [footerWebsite, setFooterWebsite] = useState("");
  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!open) return;
    setName(firm?.name ?? "");
    setBrand(firm?.brand_color ?? "#0F172A");
    setLogo(firm?.logo_url ?? "");
    setSupportEmail(firm?.support_email_target ?? "");
    setFooterAddress(firm?.footer_address ?? "");
    setFooterPhone(firm?.footer_phone ?? "");
    setFooterEmail(firm?.footer_email ?? "");
    setFooterWebsite(firm?.footer_website ?? "");
    setDiscordEnabled(firm?.discord_enabled ?? false);
    setDiscordWebhookUrl(firm?.discord_webhook_url ?? "");
    setError(null);
  }, [open, firm]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name,
        brand_color: brand,
        logo_url: logo || null,
        support_email_target: supportEmail,
        footer_address: footerAddress || null,
        footer_phone: footerPhone || null,
        footer_email: footerEmail || null,
        footer_website: footerWebsite || null,
        discord_enabled: discordEnabled,
        discord_webhook_url: discordWebhookUrl || null,
      };
      if (firm) await api.updateFirm(firm.id, payload);
      else await api.createFirm(payload);
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={firm ? "Rediger firma" : "Nytt firma"}>
      <ErrorBanner error={error} />
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Navn">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand-farge">
            <Input type="color" value={brand} onChange={(e) => setBrand(e.target.value)} />
          </Field>
          <Field label="Hex">
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
          </Field>
        </div>
        <Field label="Logo URL (valgfritt)">
          <Input value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://..." />
        </Field>
        <Field label="Support-e-post">
          <Input
            type="email"
            required
            value={supportEmail}
            onChange={(e) => setSupportEmail(e.target.value)}
          />
        </Field>
        <fieldset className="border-t border-slate-200 pt-3 space-y-3">
          <legend className="text-sm font-semibold text-slate-700">
            Bunntekst (vises på produktsiden)
          </legend>
          <Field label="Adresse">
            <Input
              value={footerAddress}
              onChange={(e) => setFooterAddress(e.target.value)}
              placeholder="C.F. Tietgens Boulevard 30A, 5220 Odense SØ"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefon">
              <Input
                value={footerPhone}
                onChange={(e) => setFooterPhone(e.target.value)}
                placeholder="+45 66 14 06 66"
              />
            </Field>
            <Field label="E-post (offentlig)">
              <Input
                type="email"
                value={footerEmail}
                onChange={(e) => setFooterEmail(e.target.value)}
                placeholder="info@firma.no"
              />
            </Field>
          </div>
          <Field label="Nettside">
            <Input
              type="url"
              value={footerWebsite}
              onChange={(e) => setFooterWebsite(e.target.value)}
              placeholder="https://firma.no"
            />
          </Field>
        </fieldset>
        <fieldset className="border-t border-slate-200 pt-3 space-y-3">
          <legend className="text-sm font-semibold text-slate-700">
            Discord-varsling
          </legend>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={discordEnabled}
              onChange={(e) => setDiscordEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <span>Aktiver Discord-varsling for dette firmaet</span>
          </label>
          <Field label="Discord webhook URL (standard for firmaet)">
            <Input
              type="url"
              value={discordWebhookUrl}
              onChange={(e) => setDiscordWebhookUrl(e.target.value)}
              placeholder="https://discord.com/api/webhooks/…"
              disabled={!discordEnabled}
            />
          </Field>
          <p className="text-xs text-slate-500">
            Sendes for nye support- og tilbehørsbestillinger. Hver kasse kan
            overstyre denne URL-en for å sende til en annen kanal.
          </p>
        </fieldset>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Avbryt
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Lagrer…" : "Lagre"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
