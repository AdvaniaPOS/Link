import { useRef, useState } from "react";
import { submitSupport, uploadAttachment, type AssetPublic } from "../api";

interface Props {
  asset: AssetPublic;
}

export function SupportForm({ asset }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [contactPref, setContactPref] = useState<"email" | "phone">("email");
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const res = await uploadAttachment(asset.id, file);
      setAttachmentUrl(res.url);
      setAttachmentName(res.filename);
      setPreviewUrl(URL.createObjectURL(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  function clearAttachment() {
    setAttachmentUrl(null);
    setAttachmentName(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    try {
      await submitSupport(asset.id, {
        customer_name: name,
        customer_email: email,
        customer_phone: phone || undefined,
        contact_preference: contactPref,
        message,
        attachment_url: attachmentUrl ?? undefined,
      });
      setStatus("ok");
      setMessage("");
      clearAttachment();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (status === "ok") {
    return (
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-emerald-800">
        Takk! Henvendelsen er sendt til {asset.firm.name}. Vi tar kontakt så snart som mulig.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          className="border rounded-md px-3 py-2"
          placeholder="Navn*"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="border rounded-md px-3 py-2"
          type="email"
          required
          placeholder="E-post*"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <input
        className="border rounded-md px-3 py-2 w-full"
        type="tel"
        required={contactPref === "phone"}
        placeholder={contactPref === "phone" ? "Telefon" : "Telefon (valgfritt)"}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium text-slate-700 mb-1">
          Hvordan vil du bli kontaktet?
        </legend>
        <div className="flex gap-2">
          <ContactChip
            label="E-post"
            value="email"
            current={contactPref}
            onChange={setContactPref}
            brand={asset.firm.brand_color}
          />
          <ContactChip
            label="Telefon"
            value="phone"
            current={contactPref}
            onChange={setContactPref}
            brand={asset.firm.brand_color}
          />
        </div>
      </fieldset>

      <textarea
        className="border rounded-md px-3 py-2 w-full min-h-[120px]"
        required
        placeholder="Beskriv problemet eller bestillingen…"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />

      <div className="space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploading}
            className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            📷 Ta bilde
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            🖼️ Last opp bilde
          </button>
        </div>
        {uploading && (
          <p className="text-xs text-slate-500">Laster opp bilde…</p>
        )}
        {attachmentUrl && previewUrl && (
          <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-2">
            <img
              src={previewUrl}
              alt="vedlegg"
              className="h-16 w-16 rounded object-cover border border-slate-200"
            />
            <div className="flex-1 min-w-0 text-xs text-slate-700 truncate">
              {attachmentName ?? "Bilde"}
            </div>
            <button
              type="button"
              onClick={clearAttachment}
              className="text-xs text-red-600 hover:underline"
            >
              Fjern
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full text-white font-semibold py-2.5 rounded-md disabled:opacity-60"
        style={{ backgroundColor: asset.firm.brand_color }}
      >
        {status === "sending" ? "Sender…" : "Meld feil"}
      </button>
    </form>
  );
}

function ContactChip({
  label,
  value,
  current,
  onChange,
  brand,
}: {
  label: string;
  value: "email" | "phone";
  current: "email" | "phone";
  onChange: (v: "email" | "phone") => void;
  brand: string;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={
        "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition " +
        (active
          ? "text-white border-transparent"
          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50")
      }
      style={active ? { backgroundColor: brand } : undefined}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}
