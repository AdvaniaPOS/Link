import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  api,
  type AssetOut,
  type ProductModelOut,
} from "./client";
import { Button, Card, ErrorBanner, Input, PageHeader } from "./ui";

interface RecentRow {
  asset: AssetOut;
  productName: string;
  url: string;
}

export function QuickRegisterPage() {
  const { firmId = "" } = useParams<{ firmId: string }>();
  const [products, setProducts] = useState<ProductModelOut[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [selected, setSelected] = useState<ProductModelOut | null>(null);
  const [serial, setSerial] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const serialInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!firmId) return;
    api
      .listProducts(firmId)
      .then((p) => setProducts(p))
      .catch(setError);
  }, [firmId]);

  function pick(p: ProductModelOut) {
    setSelected(p);
    setSerial("");
    setError(null);
    setTimeout(() => serialInput.current?.focus(), 50);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createAsset(firmId, {
        firm_product_id: selected.id,
        serial_number: serial,
        location: location || null,
      });
      const url = `${window.location.origin}/p/${created.id}`;
      setRecent((r) => [{ asset: created, productName: selected.name, url }, ...r].slice(0, 12));
      setSerial("");
      // Keep selected product so the operator can rapid-fire many serials.
      serialInput.current?.focus();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, ProductModelOut[]>();
    for (const p of products) {
      const k = p.category || "other";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [products]);

  return (
    <div className="p-8">
      <PageHeader title="Hurtigregistrering" />
      <p className="text-sm text-slate-500 -mt-3 mb-5">
        Velg produkt-mal, tast inn serienummer, trykk Enter. QR genereres umiddelbart.
      </p>
      <ErrorBanner error={error} />

      {products.length === 0 ? (
        <Card className="p-4 mb-4 bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          Du har ingen produkter ennå. Opprett produkter i{" "}
          <Link to={`/admin/firms/${firmId}/products`} className="underline font-medium">
            Produkter
          </Link>{" "}
          først.
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Template gallery */}
          <Card className="p-5 lg:col-span-2">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Velg mal</h2>
            <div className="space-y-5">
              {grouped.map(([cat, list]) => (
                <div key={cat}>
                  <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">
                    {categoryLabel(cat)}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {list.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => pick(p)}
                        className={`group flex flex-col items-center text-center rounded-xl border bg-white px-3 py-4 transition ${
                          selected?.id === p.id
                            ? "border-indigo-500 ring-2 ring-indigo-300"
                            : "border-slate-200 hover:border-indigo-400 hover:shadow-md"
                        }`}
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
                        <div className="text-sm font-medium text-slate-800 line-clamp-2">
                          {p.name}
                        </div>
                        {p.sku && (
                          <div className="text-[11px] text-slate-400 mt-0.5">{p.sku}</div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Serial entry + recent */}
          <div className="space-y-4">
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-900 mb-3">Registrer enhet</h2>
              {!selected ? (
                <p className="text-sm text-slate-500">
                  Klikk en produkt-mal til venstre for å starte.
                </p>
              ) : (
                <form onSubmit={submit} className="space-y-3">
                  <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    {selected.image_url ? (
                      <img
                        src={selected.image_url}
                        alt=""
                        className="h-12 w-12 object-contain"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded bg-white border border-slate-200" />
                    )}
                    <div className="text-sm">
                      <div className="font-medium text-slate-900">{selected.name}</div>
                      <div className="text-xs text-slate-500">{selected.sku ?? "—"}</div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Serienummer
                    </label>
                    <input
                      ref={serialInput}
                      required
                      autoFocus
                      value={serial}
                      onChange={(e) => setSerial(e.target.value)}
                      placeholder="Tast eller skann"
                      className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Lokasjon (valgfritt)
                    </label>
                    <Input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="F.eks. Butikk 1, kasse 2"
                    />
                  </div>
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy ? "Lagrer…" : "Registrer (Enter)"}
                  </Button>
                </form>
              )}
            </Card>

            {recent.length > 0 && (
              <Card className="p-5">
                <h2 className="text-sm font-semibold text-slate-900 mb-3">
                  Sist registrert ({recent.length})
                </h2>
                <ul className="space-y-3 max-h-[60vh] overflow-y-auto">
                  {recent.map((r) => {
                    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(r.url)}`;
                    return (
                      <li
                        key={r.asset.id}
                        className="flex gap-3 items-center border border-slate-200 rounded-lg p-2"
                      >
                        <img
                          src={qrSrc}
                          alt=""
                          className="h-16 w-16 bg-white border border-slate-200 rounded"
                        />
                        <div className="flex-1 min-w-0 text-xs">
                          <div className="font-medium text-slate-800 truncate">
                            {r.productName}
                          </div>
                          <div className="font-mono text-slate-700">
                            {r.asset.serial_number}
                          </div>
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 truncate block"
                          >
                            Åpne ↗
                          </a>
                        </div>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(r.url)}
                          className="text-[11px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
                        >
                          Kopier
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function categoryLabel(c: string): string {
  switch (c) {
    case "terminal":
      return "Terminaler";
    case "tablet":
      return "Nettbrett";
    case "printer":
      return "Skrivere";
    case "kiosk":
      return "Kiosk";
    case "scanner":
      return "Skannere";
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
