import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import {
  fetchAccessories,
  fetchAsset,
  submitOrder,
  submitQuickSupport,
  type AccessoryPublic,
  type AssetPublic,
} from "../api";
import { SupportForm } from "../components/SupportForm";

type SectionKey = "support" | "info" | "warranty" | "manual" | "quick" | "accessories";

export function ProductPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const [asset, setAsset] = useState<AssetPublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<SectionKey | null>(null);
  const [accessories, setAccessories] = useState<AccessoryPublic[]>([]);

  useEffect(() => {
    if (!uuid) return;
    fetchAsset(uuid).then(setAsset).catch((e) => setError(String(e)));
    fetchAccessories(uuid).then(setAccessories).catch(() => setAccessories([]));
  }, [uuid]);

  if (error) {
    return <main className="p-8 text-red-600">Kunne ikke laste produkt: {error}</main>;
  }
  if (!asset) {
    return <main className="p-8 text-slate-500">Laster…</main>;
  }

  const brand = asset.firm.brand_color;
  const bgUrl = asset.product_model.background_url;
  const bgKind = asset.product_model.background_kind;
  const firm = asset.firm;
  const hasFooter = Boolean(
    firm.footer_address || firm.footer_phone || firm.footer_email || firm.footer_website,
  );

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Decorative background (per product type) */}
      {bgUrl ? (
        bgKind === "video" ? (
          <video
            className="fixed inset-0 w-full h-full object-cover -z-10"
            src={bgUrl}
            autoPlay
            loop
            muted
            playsInline
          />
        ) : (
          <div
            className="fixed inset-0 -z-10 bg-cover bg-center"
            style={{ backgroundImage: `url(${bgUrl})` }}
          />
        )
      ) : (
        <div
          className="fixed inset-0 -z-10"
          style={{
            background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
          }}
        />
      )}
      <div className="fixed inset-0 -z-10 bg-black/30" />

      <div className="mx-auto max-w-md min-h-screen bg-white shadow-2xl">
        {/* Brand header */}
        <header className="px-6 pt-6 pb-2 flex items-center justify-center">
          {asset.firm.logo_url ? (
            <img src={asset.firm.logo_url} alt={asset.firm.name} className="h-10 w-auto" />
          ) : (
            <div
              className="text-xl font-bold tracking-tight"
              style={{ color: brand }}
            >
              {asset.firm.name}
            </div>
          )}
        </header>

        {/* Hero image */}
        <div className="px-6 pt-4 pb-2 flex items-center justify-center min-h-[200px]">
          {asset.product_model.image_url ? (
            <img
              src={asset.product_model.image_url}
              alt={asset.product_model.name}
              className="max-h-56 w-auto object-contain"
            />
          ) : (
            <div className="h-40 w-40 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 text-sm">
              Ingen bilde
            </div>
          )}
        </div>

        {/* Title block */}
        <section className="px-6 text-center space-y-1 py-2">
          <h1 className="text-lg font-bold text-slate-900">{asset.product_model.name}</h1>
          {asset.product_model.sku && (
            <p className="text-sm text-slate-500">{asset.product_model.sku}</p>
          )}
          <p className="text-sm text-slate-700">
            <span className="font-medium">Serial:</span> {asset.serial_number}
          </p>
          {asset.location && (
            <p className="text-sm text-slate-500">{asset.location}</p>
          )}
        </section>

        {/* Action stack */}
        <section className="px-6 py-5 space-y-3">
          {asset.quick_support_enabled && uuid && (
            <QuickSupportButton uuid={uuid} />
          )}

          {accessories.length > 0 && (
            <>
              <ActionButton
                label={`Bestill tilbehør (${accessories.length})`}
                brand={brand}
                isOpen={open === "accessories"}
                onClick={() =>
                  setOpen(open === "accessories" ? null : "accessories")
                }
              />
              {open === "accessories" && uuid && (
                <div className="rounded-xl border border-slate-200 p-3 -mt-1 bg-slate-50 space-y-3">
                  {accessories.map((a) => (
                    <AccessoryCard
                      key={a.id}
                      accessory={a}
                      brand={brand}
                      uuid={uuid}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          <ActionButton
            label="Meld feil / kontakt support"
            brand={brand}
            isOpen={open === "support"}
            onClick={() => setOpen(open === "support" ? null : "support")}
          />
          {open === "support" && (
            <div className="rounded-xl border border-slate-200 p-4 -mt-1 bg-slate-50">
              <SupportForm asset={asset} />
            </div>
          )}

          <ActionButton
            label="Produktinfo"
            brand={brand}
            isOpen={open === "info"}
            onClick={() => setOpen(open === "info" ? null : "info")}
          />
          {open === "info" && (
            <div className="rounded-xl border border-slate-200 p-4 -mt-1 bg-slate-50 text-sm text-slate-700 whitespace-pre-line">
              {asset.product_model.description ?? "Ingen beskrivelse tilgjengelig."}
            </div>
          )}

          <ActionButton
            label="Garanti"
            brand={brand}
            isOpen={open === "warranty"}
            onClick={() => setOpen(open === "warranty" ? null : "warranty")}
          />
          {open === "warranty" && (
            <div className="rounded-xl border border-slate-200 p-4 -mt-1 bg-slate-50 text-sm text-slate-700 space-y-2">
              <p className="whitespace-pre-line">
                {asset.product_model.warranty_text ??
                  `Standard garantibetingelser fra ${asset.firm.name}. Ta kontakt med support for spørsmål.`}
              </p>
              {asset.product_model.warranty_url && (
                <a
                  href={asset.product_model.warranty_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium"
                  style={{ color: brand }}
                >
                  Åpne garantivilkår ↗
                </a>
              )}
            </div>
          )}

          <ActionButton
            label="Brukermanual"
            brand={brand}
            isOpen={open === "manual"}
            onClick={() => setOpen(open === "manual" ? null : "manual")}
          />
          {open === "manual" && (
            <div className="rounded-xl border border-slate-200 p-4 -mt-1 bg-slate-50 text-sm text-slate-700">
              {asset.product_model.manual_url ? (
                <a
                  href={asset.product_model.manual_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium"
                  style={{ color: brand }}
                >
                  Åpne brukermanual ↗
                </a>
              ) : (
                "Manualen er ikke lastet opp ennå."
              )}
            </div>
          )}

          {asset.product_model.quick_guide_url && (
            <>
              <ActionButton
                label="Hurtigveiledning"
                brand={brand}
                isOpen={open === "quick"}
                onClick={() => setOpen(open === "quick" ? null : "quick")}
              />
              {open === "quick" && (
                <div className="rounded-xl border border-slate-200 p-4 -mt-1 bg-slate-50 text-sm text-slate-700">
                  <a
                    href={asset.product_model.quick_guide_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium"
                    style={{ color: brand }}
                  >
                    Åpne hurtigveiledning ↗
                  </a>
                </div>
              )}
            </>
          )}
        </section>

        <footer
          className="px-6 py-6 text-center text-xs text-white space-y-2"
          style={{ backgroundColor: brand }}
        >
          <div className="text-sm font-semibold tracking-wide">{firm.name}</div>
          {hasFooter ? (
            <div className="space-y-1">
              {firm.footer_phone && (
                <div>
                  <a href={`tel:${firm.footer_phone}`} className="hover:underline">
                    ☎ {firm.footer_phone}
                  </a>
                </div>
              )}
              {firm.footer_email && (
                <div>
                  <a href={`mailto:${firm.footer_email}`} className="hover:underline">
                    ✉ {firm.footer_email}
                  </a>
                </div>
              )}
              {firm.footer_address && <div>△ {firm.footer_address}</div>}
              {firm.footer_website && (
                <div>
                  <a
                    href={firm.footer_website}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                  >
                    ↗ {firm.footer_website.replace(/^https?:\/\//, "")}
                  </a>
                </div>
              )}
            </div>
          ) : null}
          <div className="opacity-70 pt-2">Betala Link · Digital produktpass</div>
        </footer>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  brand,
  isOpen,
  onClick,
}: {
  label: string;
  brand: string;
  isOpen: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl text-white font-semibold py-3.5 px-4 flex items-center justify-between shadow-sm transition-transform active:scale-[0.99]"
      style={{ backgroundColor: brand }}
    >
      <span>{label}</span>
      <span
        className={`text-xs transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        aria-hidden
      >
        ▼
      </span>
    </button>
  );
}

function QuickSupportButton({ uuid }: { uuid: string }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      await submitQuickSupport(uuid);
      setDone(true);
      setConfirm(false);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 text-center">
        <div className="text-2xl">✅</div>
        <div className="mt-1 text-base font-semibold text-emerald-900">
          Hjelp er på vei
        </div>
        <div className="mt-1 text-sm text-emerald-700">
          Vi har varslet support direkte. Du trenger ikke gjøre noe mer.
        </div>
        <button
          type="button"
          onClick={() => setDone(false)}
          className="mt-3 text-xs text-emerald-700 underline"
        >
          Send nytt varsel
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErr(null);
          setConfirm(true);
        }}
        className="w-full rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold py-5 px-4 text-lg shadow-lg transition-transform active:scale-[0.98] flex items-center justify-center gap-2"
      >
        <span aria-hidden>🚨</span>
        <span>Trenger hjelp NÅ</span>
      </button>
      {err && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {err}
        </div>
      )}

      {confirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !busy && setConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center text-3xl">🚨</div>
            <h3 className="mt-2 text-center text-lg font-semibold text-slate-900">
              Be om hjelp nå?
            </h3>
            <p className="mt-2 text-center text-sm text-slate-600">
              Support blir varslet direkte med serienummer og lokasjon.
              Bruk kun ved reelle behov.
            </p>
            {err && (
              <div className="mt-3 text-xs text-red-600 text-center">{err}</div>
            )}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirm(false)}
                disabled={busy}
                className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm text-slate-700"
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={send}
                disabled={busy}
                className="flex-1 rounded-lg bg-red-600 hover:bg-red-700 py-2.5 text-sm font-semibold text-white"
              >
                {busy ? "Sender…" : "Ja, varsle nå"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AccessoryCard({
  accessory,
  brand,
  uuid,
}: {
  accessory: AccessoryPublic;
  brand: string;
  uuid: string;
}) {
  const [showForm, setShowForm] = useState(false);
  const [qty, setQty] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bindingOk, setBindingOk] = useState(false);

  function openConfirm(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBindingOk(false);
    setConfirmOpen(true);
  }

  async function send() {
    if (!bindingOk) return;
    setBusy(true);
    setErr(null);
    try {
      await submitOrder(uuid, {
        accessory_id: accessory.id,
        quantity: qty,
        customer_name: name,
        customer_email: email,
        customer_phone: phone || undefined,
        note: note || undefined,
      });
      setDone(true);
      setConfirmOpen(false);
    } catch (ex) {
      setErr(String(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex gap-3">
        {accessory.image_url ? (
          <img
            src={accessory.image_url}
            alt=""
            className="h-14 w-14 object-contain rounded bg-slate-50 border border-slate-200"
          />
        ) : (
          <div className="h-14 w-14 rounded bg-slate-100" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900">{accessory.name}</div>
          {accessory.description && (
            <div className="text-xs text-slate-500 line-clamp-2">{accessory.description}</div>
          )}
          <div className="text-xs text-slate-600 mt-1">
            {accessory.price_label ?? "Pris ved forespørsel"}
            {accessory.unit ? ` / ${accessory.unit}` : ""}
          </div>
        </div>
      </div>

      {done ? (
        <div className="mt-3 text-sm text-emerald-700 bg-emerald-50 rounded p-2">
          Bestilling sendt. Vi tar kontakt på {email}.
        </div>
      ) : showForm ? (
        <form onSubmit={openConfirm} className="mt-3 space-y-2">
          {err && <div className="text-xs text-red-600">{err}</div>}
          <div className="flex gap-2">
            <label className="text-xs text-slate-600 flex items-center gap-1">
              Antall
              <input
                type="number"
                min={1}
                max={999}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
                className="w-20 border border-slate-300 rounded px-2 py-1 text-sm"
              />
            </label>
          </div>
          <input
            required
            placeholder="Ditt navn*"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
          />
          <input
            required
            type="email"
            placeholder="E-post*"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
          />
          <input
            placeholder="Telefon (valgfritt)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
          />
          <textarea
            placeholder="Melding (valgfritt)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 text-sm py-2 rounded border border-slate-300 text-slate-700"
            >
              Avbryt
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 text-sm py-2 rounded text-white font-medium"
              style={{ backgroundColor: brand }}
            >
              Gå videre
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mt-3 w-full text-sm py-2 rounded-md text-white font-medium"
          style={{ backgroundColor: brand }}
        >
          Bestill
        </button>
      )}

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !busy && setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">Bekreft bestilling</h3>
            <div className="mt-3 rounded-md bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700 space-y-1">
              <div><span className="text-slate-500">Vare:</span> {accessory.name}</div>
              <div><span className="text-slate-500">Antall:</span> {qty}{accessory.unit ? ` ${accessory.unit}` : ""}</div>
              <div><span className="text-slate-500">Pris:</span> {accessory.price_label ?? "Pris ved forespørsel"}</div>
              <div><span className="text-slate-500">Navn:</span> {name}</div>
              <div><span className="text-slate-500">E-post:</span> {email}</div>
              {phone && <div><span className="text-slate-500">Telefon:</span> {phone}</div>}
            </div>
            {err && <div className="mt-3 text-xs text-red-600">{err}</div>}
            <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={bindingOk}
                onChange={(e) => setBindingOk(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                Jeg bekrefter at jeg legger inn en <strong>bindende bestilling</strong> av varene over.
              </span>
            </label>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={busy}
                className="flex-1 text-sm py-2 rounded border border-slate-300 text-slate-700"
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={send}
                disabled={!bindingOk || busy}
                className="flex-1 text-sm py-2 rounded text-white font-medium disabled:opacity-50"
                style={{ backgroundColor: brand }}
              >
                {busy ? "Sender…" : "Bekreft og send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
