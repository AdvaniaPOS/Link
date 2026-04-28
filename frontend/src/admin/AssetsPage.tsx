import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type AssetOut, type ProductModelOut } from "./client";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
  useToggle,
} from "./ui";

export function AssetsPage() {
  const { firmId = "" } = useParams<{ firmId: string }>();
  const [items, setItems] = useState<AssetOut[]>([]);
  const [products, setProducts] = useState<ProductModelOut[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<AssetOut | null>(null);
  const [search, setSearch] = useState("");
  const modal = useToggle();

  async function reload() {
    try {
      const [a, p] = await Promise.all([api.listAssets(firmId), api.listProducts(firmId)]);
      setItems(a);
      setProducts(p);
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    if (firmId) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmId]);

  async function del(id: string) {
    if (!confirm("Slette denne enheten?")) return;
    try {
      await api.deleteAsset(firmId, id);
      void reload();
    } catch (e) {
      setError(e);
    }
  }

  const productMap = new Map(products.map((p) => [p.id, p]));
  const [presetProduct, setPresetProduct] = useState<ProductModelOut | null>(null);
  const [lastCreated, setLastCreated] = useState<AssetOut | null>(null);

  const q = search.trim().toLowerCase();
  const filteredItems = q
    ? items.filter((a) => {
        const product = productMap.get(a.firm_product_id);
        return (
          a.serial_number.toLowerCase().includes(q) ||
          (a.location ?? "").toLowerCase().includes(q) ||
          (product?.name ?? "").toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q)
        );
      })
    : items;

  function openTemplate(p: ProductModelOut) {
    setEditing(null);
    setPresetProduct(p);
    setLastCreated(null);
    modal.on();
  }

  function openBlank() {
    setEditing(null);
    setPresetProduct(null);
    setLastCreated(null);
    modal.on();
  }

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Enheter"
        actions={
          <Button disabled={products.length === 0} onClick={openBlank}>
            + Ny enhet
          </Button>
        }
      />
      <ErrorBanner error={error} />

      {items.length > 0 && (
        <div className="mb-4 max-w-md">
          <Input
            type="search"
            placeholder="Søk etter serienummer, lokasjon eller produkt …"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {products.length === 0 ? (
        <Card className="p-4 mb-4 bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          Du må opprette minst ett produkt før du kan registrere enheter.
        </Card>
      ) : (
        <Card className="p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Velg mal</h2>
              <p className="text-xs text-slate-500">
                Klikk på et produkt og tast inn serienummer – QR genereres automatisk.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {products.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => openTemplate(p)}
                className="group flex flex-col items-center text-center rounded-xl border border-slate-200 bg-white px-3 py-4 hover:border-indigo-400 hover:shadow-md transition"
              >
                <div className="h-20 w-20 flex items-center justify-center mb-2">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt=""
                      className="max-h-20 max-w-20 object-contain"
                    />
                  ) : (
                    <CategoryIcon category={p.category} />
                  )}
                </div>
                <div className="text-sm font-medium text-slate-800 line-clamp-2">{p.name}</div>
                <div className="text-[11px] text-slate-400 uppercase tracking-wide mt-0.5">
                  {categoryLabel(p.category)}
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {items.length === 0 ? (
        <Card className="p-8 text-center text-slate-500">Ingen enheter ennå.</Card>
      ) : filteredItems.length === 0 ? (
        <Card className="p-8 text-center text-slate-500">
          Ingen treff for «{search}».
        </Card>
      ) : (
        <Table>
          <thead className="bg-slate-50">
            <tr>
              <Th>Serienummer</Th>
              <Th>Produkt</Th>
              <Th>Lokasjon</Th>
              <Th>Kundevisning</Th>
              <Th>Handlinger</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredItems.map((a) => (
              <tr key={a.id}>
                <Td>
                  <div className="font-mono font-medium">{a.serial_number}</div>
                  <div className="text-xs text-slate-400 font-mono">{a.id}</div>
                  {a.quick_support_enabled && (
                    <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 ring-1 ring-red-200">
                      🚨 Quick support
                    </div>
                  )}
                </Td>
                <Td>{productMap.get(a.firm_product_id)?.name ?? "—"}</Td>
                <Td>{a.location ?? "—"}</Td>
                <Td>
                  <Link
                    to={`/p/${a.id}`}
                    target="_blank"
                    className="text-sm text-indigo-600 hover:text-indigo-800"
                  >
                    Åpne ↗
                  </Link>
                </Td>
                <Td>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditing(a);
                        setPresetProduct(null);
                        setLastCreated(null);
                        modal.on();
                      }}
                      className="text-sm text-slate-600 hover:text-slate-900"
                    >
                      Rediger
                    </button>
                    <button
                      onClick={() => del(a.id)}
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

      <AssetModal
        open={modal.open}
        onClose={() => {
          modal.off();
          setLastCreated(null);
        }}
        firmId={firmId}
        asset={editing}
        products={products}
        presetProductId={presetProduct?.id}
        lastCreated={lastCreated}
        onSaved={(created) => {
          setLastCreated(created);
          void reload();
        }}
      />
    </div>
  );
}

function categoryLabel(c: string): string {
  switch (c) {
    case "terminal":
      return "Terminal";
    case "tablet":
      return "Nettbrett";
    case "printer":
      return "Skriver";
    case "kiosk":
      return "Kiosk";
    case "scanner":
      return "Skanner";
    default:
      return "Annet";
  }
}

function CategoryIcon({ category }: { category: string }) {
  const emoji =
    category === "terminal"
      ? "💳"
      : category === "tablet"
        ? "📱"
        : category === "printer"
          ? "🖨️"
          : category === "kiosk"
            ? "🖥️"
            : category === "scanner"
              ? "📷"
              : "📦";
  return (
    <div className="h-16 w-16 rounded-xl bg-slate-100 flex items-center justify-center text-3xl">
      {emoji}
    </div>
  );
}

function AssetModal({
  open,
  onClose,
  firmId,
  asset,
  products,
  presetProductId,
  lastCreated,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  firmId: string;
  asset: AssetOut | null;
  products: ProductModelOut[];
  presetProductId?: string;
  lastCreated: AssetOut | null;
  onSaved: (created: AssetOut) => void;
}) {
  const [serial, setSerial] = useState("");
  const [productId, setProductId] = useState("");
  const [location, setLocation] = useState("");
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [quickSupport, setQuickSupport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const lockedToTemplate = !asset && !!presetProductId;
  const presetProduct = products.find((p) => p.id === presetProductId) ?? null;

  useEffect(() => {
    if (!open) return;
    setSerial(asset?.serial_number ?? "");
    setProductId(asset?.firm_product_id ?? presetProductId ?? products[0]?.id ?? "");
    setLocation(asset?.location ?? "");
    setDiscordWebhookUrl(asset?.discord_webhook_url ?? "");
    setQuickSupport(asset?.quick_support_enabled ?? false);
    setError(null);
  }, [open, asset, products, presetProductId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        firm_product_id: productId,
        serial_number: serial,
        location: location || null,
        discord_webhook_url: discordWebhookUrl || null,
        quick_support_enabled: quickSupport,
      };
      const created = asset
        ? await api.updateAsset(firmId, asset.id, payload)
        : await api.createAsset(firmId, payload);
      onSaved(created);
      // Reset form for quick consecutive registrations from the same template.
      setSerial("");
      setLocation("");
      setDiscordWebhookUrl("");
      setQuickSupport(false);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const title = asset
    ? "Rediger enhet"
    : presetProduct
      ? `Ny enhet · ${presetProduct.name}`
      : "Ny enhet";

  const publicUrl =
    lastCreated && typeof window !== "undefined"
      ? `${window.location.origin}/p/${lastCreated.id}`
      : null;
  const qrSrc = publicUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(publicUrl)}`
    : null;

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <ErrorBanner error={error} />

      {lastCreated && publicUrl && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 mb-4 flex gap-4">
          {qrSrc && (
            <img
              src={qrSrc}
              alt="QR"
              className="h-32 w-32 rounded-md bg-white border border-emerald-200"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-emerald-900">
              Enhet registrert · {lastCreated.serial_number}
            </div>
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-emerald-700 underline break-all"
            >
              {publicUrl}
            </a>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(publicUrl);
                }}
                className="text-xs px-2 py-1 rounded bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100"
              >
                Kopier lenke
              </button>
              {qrSrc && (
                <a
                  href={qrSrc}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs px-2 py-1 rounded bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                >
                  Åpne QR
                </a>
              )}
            </div>
            <p className="text-xs text-emerald-700 mt-2">
              Tast inn neste serienummer under for å registrere flere.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        {lockedToTemplate && presetProduct ? (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            {presetProduct.image_url ? (
              <img
                src={presetProduct.image_url}
                alt=""
                className="h-12 w-12 object-contain"
              />
            ) : (
              <div className="h-12 w-12 rounded bg-white border border-slate-200" />
            )}
            <div className="text-sm">
              <div className="font-medium text-slate-900">{presetProduct.name}</div>
              <div className="text-xs text-slate-500">{presetProduct.sku ?? "—"}</div>
            </div>
          </div>
        ) : (
          <Field label="Produkt">
            <Select required value={productId} onChange={(e) => setProductId(e.target.value)}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Serienummer">
          <Input
            required
            autoFocus
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            placeholder="F.eks. SN-12345"
          />
        </Field>
        <Field label="Lokasjon (valgfritt)">
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="F.eks. Butikk 1, kassapunkt 2"
          />
        </Field>
        <Field label="Discord webhook (valgfritt – overstyrer firma-default)">
          <Input
            type="url"
            value={discordWebhookUrl}
            onChange={(e) => setDiscordWebhookUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/…"
          />
        </Field>
        <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <input
            type="checkbox"
            checked={quickSupport}
            onChange={(e) => setQuickSupport(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <strong>Quick support</strong> – viser én stor knapp på QR-siden som
            sender et direkte Discord-varsel uten skjema og uten e-post.
            Krever at firmaet har Discord-varsling aktivert. Anbefales for
            festival/event-enheter.
          </span>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Lukk
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Lagrer…" : asset ? "Lagre" : "Registrer enhet"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
