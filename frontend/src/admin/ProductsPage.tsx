import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  api,
  type CatalogOut,
  type CatalogWriteIn,
  type FirmProductOverrideIn,
  type ProductModelOut,
} from "./client";
import {
  Badge,
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
  Textarea,
  Th,
  useToggle,
} from "./ui";

type OverrideKey =
  | "description"
  | "manual_url"
  | "quick_guide_url"
  | "warranty_url"
  | "warranty_text";

const OVERRIDE_FIELDS: Array<{
  key: OverrideKey;
  label: string;
  type: "url" | "long" | "short";
}> = [
  { key: "description", label: "Beskrivelse", type: "long" },
  { key: "manual_url", label: "Manual-URL", type: "url" },
  { key: "quick_guide_url", label: "Hurtigveiledning-URL", type: "url" },
  { key: "warranty_url", label: "Garanti-URL", type: "url" },
  { key: "warranty_text", label: "Garantitekst", type: "long" },
];

export function ProductsPage() {
  const { firmId = "" } = useParams<{ firmId: string }>();
  const [items, setItems] = useState<ProductModelOut[]>([]);
  const [catalog, setCatalog] = useState<CatalogOut[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<ProductModelOut | null>(null);
  const editModal = useToggle();
  const linkModal = useToggle();
  const newModal = useToggle();

  async function reload() {
    try {
      const [products, cat] = await Promise.all([
        api.listProducts(firmId),
        api.listCatalog().catch(() => [] as CatalogOut[]),
      ]);
      setItems(products);
      setCatalog(cat);
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    if (firmId) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmId]);

  const subscribedCatalogIds = useMemo(
    () => new Set(items.map((i) => i.catalog_id)),
    [items],
  );
  const availableCatalog = useMemo(
    () => catalog.filter((c) => !subscribedCatalogIds.has(c.id)),
    [catalog, subscribedCatalogIds],
  );

  async function unlink(p: ProductModelOut) {
    if (
      !confirm(
        `Fjerne abonnement på "${p.name}"? Krever at firmaet ikke har enheter på dette produktet.`,
      )
    )
      return;
    try {
      await api.unlinkProduct(firmId, p.id);
      void reload();
    } catch (e) {
      setError(e);
    }
  }

  function startEdit(p: ProductModelOut) {
    setEditing(p);
    editModal.on();
  }

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Produkter"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => newModal.on()}>Lag nytt produkt</Button>
            <Button
              variant="secondary"
              onClick={() => linkModal.on()}
              disabled={availableCatalog.length === 0}
            >
              Legg til fra katalog
            </Button>
          </div>
        }
      />
      <ErrorBanner error={error} />

      {catalog.length === 0 && (
        <Card className="p-4 mb-4 bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          Ingen produkter i katalogen ennå. Klikk «Lag nytt produkt» for å lage et til ditt firma, eller be en super-admin opprette globale produkter under{" "}
          <Link to="/admin/catalog" className="underline font-medium">
            Produktkatalog
          </Link>
          .
        </Card>
      )}

      <Table>
        <thead>
          <tr>
            <Th>Produkt</Th>
            <Th>SKU</Th>
            <Th>Kategori</Th>
            <Th>Overstyringer</Th>
            <Th>Handlinger</Th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                Ingen produkter ennå. Klikk «Legg til fra katalog» for å abonnere.
              </td>
            </tr>
          )}
          {items.map((p) => {
            const cat = catalog.find((c) => c.id === p.catalog_id);
            const isOwn = cat?.owner_firm_id === firmId;
            const overrideCount = OVERRIDE_FIELDS.filter(
              (f) => p.overrides[f.key] !== null && p.overrides[f.key] !== undefined,
            ).length;
            return (
              <tr key={p.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt=""
                        className="h-10 w-10 object-contain rounded bg-slate-50 border border-slate-200"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-slate-100" />
                    )}
                    <span className="font-medium text-slate-800">{p.name}</span>
                  </div>
                </Td>
                <Td>{p.sku ?? "—"}</Td>
                <Td>{p.category}</Td>
                <Td>
                  {isOwn ? (
                    <Badge tone="green">Eget produkt</Badge>
                  ) : p.frozen_at ? (
                    <Badge tone="indigo">Låst — egen versjon</Badge>
                  ) : overrideCount === 0 ? (
                    <Badge tone="slate">Arver alt</Badge>
                  ) : (
                    <Badge tone="indigo">{overrideCount} overstyrt</Badge>
                  )}
                </Td>
                <Td>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
                    >
                      {isOwn || p.frozen_at ? "Rediger" : "Overstyr"}
                    </button>
                    <button
                      type="button"
                      onClick={() => unlink(p)}
                      className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50"
                    >
                      Fjern
                    </button>
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <LinkCatalogModal
        open={linkModal.open}
        firmId={firmId}
        available={availableCatalog}
        onClose={linkModal.off}
        onLinked={() => {
          linkModal.off();
          void reload();
        }}
      />

      <NewProductModal
        open={newModal.open}
        firmId={firmId}
        onClose={newModal.off}
        onCreated={() => {
          newModal.off();
          void reload();
        }}
      />

      <OverrideModal
        open={editModal.open && editing !== null}
        firmId={firmId}
        product={editing}
        catalogEntry={
          editing ? (catalog.find((c) => c.id === editing.catalog_id) ?? null) : null
        }
        onClose={() => {
          editModal.off();
          setEditing(null);
        }}
        onSaved={() => {
          editModal.off();
          setEditing(null);
          void reload();
        }}
      />
    </div>
  );
}

// ---------- Link from catalog modal ----------

function LinkCatalogModal({
  open,
  firmId,
  available,
  onClose,
  onLinked,
}: {
  open: boolean;
  firmId: string;
  available: CatalogOut[];
  onClose: () => void;
  onLinked: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);

  async function link(c: CatalogOut) {
    setBusy(c.id);
    setErr(null);
    try {
      await api.linkProduct(firmId, c.id);
      onLinked();
    } catch (e) {
      setErr(e);
      setBusy(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Velg produkt fra katalog">
      <ErrorBanner error={err} />
      {available.length === 0 ? (
        <p className="text-sm text-slate-500">
          Alle katalogprodukter er allerede abonnert på.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto">
          {available.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={busy !== null}
              onClick={() => link(c)}
              className={`text-left rounded-lg border border-slate-200 p-3 hover:border-indigo-400 hover:shadow-sm transition flex gap-3 items-center ${
                busy === c.id ? "opacity-50" : ""
              }`}
            >
              {c.image_url ? (
                <img
                  src={c.image_url}
                  alt=""
                  className="h-12 w-12 object-contain rounded bg-slate-50 border border-slate-200"
                />
              ) : (
                <div className="h-12 w-12 rounded bg-slate-100" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">{c.name}</div>
                <div className="text-xs text-slate-500">
                  {c.sku ?? "—"} · {c.category}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ---------- Override editor modal ----------

function OverrideModal({
  open,
  firmId,
  product,
  catalogEntry,
  onClose,
  onSaved,
}: {
  open: boolean;
  firmId: string;
  product: ProductModelOut | null;
  catalogEntry: CatalogOut | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isOwn = !!catalogEntry && catalogEntry.owner_firm_id === firmId;

  if (isOwn && catalogEntry) {
    return (
      <EditOwnProductModal
        open={open}
        catalogEntry={catalogEntry}
        productName={product?.name ?? ""}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  }

  return (
    <OverrideOnlyModal
      open={open}
      firmId={firmId}
      product={product}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function OverrideOnlyModal({
  open,
  firmId,
  product,
  onClose,
  onSaved,
}: {
  open: boolean;
  firmId: string;
  product: ProductModelOut | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [vals, setVals] = useState<Record<OverrideKey, string>>({
    description: "",
    manual_url: "",
    quick_guide_url: "",
    warranty_url: "",
    warranty_text: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  useEffect(() => {
    if (product) {
      setVals({
        description: product.overrides.description ?? "",
        manual_url: product.overrides.manual_url ?? "",
        quick_guide_url: product.overrides.quick_guide_url ?? "",
        warranty_url: product.overrides.warranty_url ?? "",
        warranty_text: product.overrides.warranty_text ?? "",
      });
      setErr(null);
    }
  }, [product]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!product) return;
    setBusy(true);
    setErr(null);
    try {
      const body: FirmProductOverrideIn = {};
      for (const f of OVERRIDE_FIELDS) {
        const v = vals[f.key].trim();
        body[f.key] = v === "" ? null : v;
      }
      await api.updateProductOverrides(firmId, product.id, body);
      onSaved();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  function reset(key: OverrideKey) {
    setVals((s) => ({ ...s, [key]: "" }));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? `Overstyr "${product.name}"` : "Overstyr"}
    >
      <ErrorBanner error={err} />
      <p className="text-xs text-slate-500 mb-2">
        Tom verdi = arv fra katalog. Det som settes her gjelder kun for dette firmaet.
      </p>
      {product?.frozen_at && (
        <div className="mb-4 rounded border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
          Dette produktet er <strong>låst</strong> for firmaet — endringer i den globale
          katalogen påvirker ikke lenger denne oppføringen. Tomme felter beholder
          sin nåværende verdi.
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        {OVERRIDE_FIELDS.map((f) => {
          // When override is null, the effective value equals the catalog default
          // (since `product[key]` is the merged effective view).
          const inherited = product?.overrides[f.key] == null;
          const catalogValue = inherited ? (product?.[f.key] as string | null) : null;
          const placeholder = catalogValue
            ? f.type === "long"
              ? `Standard: ${catalogValue.slice(0, 80)}${catalogValue.length > 80 ? "…" : ""}`
              : catalogValue
            : "Ingen standard";
          return (
            <Field
              key={f.key}
              label={f.label}
              hint={!inherited ? "Overstyrt for dette firmaet." : undefined}
            >
              <div className="space-y-1">
                {f.type === "long" ? (
                  <Textarea
                    value={vals[f.key]}
                    onChange={(e) => setVals((s) => ({ ...s, [f.key]: e.target.value }))}
                    rows={3}
                    placeholder={placeholder}
                  />
                ) : (
                  <Input
                    value={vals[f.key]}
                    onChange={(e) => setVals((s) => ({ ...s, [f.key]: e.target.value }))}
                    type="url"
                    placeholder={placeholder}
                  />
                )}
                {!inherited && (
                  <button
                    type="button"
                    onClick={() => reset(f.key)}
                    className="text-[11px] text-indigo-600 hover:underline"
                  >
                    Tilbakestill (arv fra katalog)
                  </button>
                )}
              </div>
            </Field>
          );
        })}
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Avbryt
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Lagrer…" : "Lagre overstyringer"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- New (firm-private) catalog product ----------

const CATEGORY_OPTIONS = [
  { value: "terminal", label: "Terminal" },
  { value: "printer", label: "Printer" },
  { value: "scanner", label: "Scanner" },
  { value: "tablet", label: "Tablet" },
  { value: "accessory", label: "Tilbehør" },
  { value: "other", label: "Annet" },
];

function NewProductModal({
  open,
  firmId,
  onClose,
  onCreated,
}: {
  open: boolean;
  firmId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [vals, setVals] = useState<CatalogWriteIn>({
    name: "",
    sku: "",
    category: "other",
    image_url: "",
    description: "",
    manual_url: "",
    quick_guide_url: "",
    warranty_url: "",
    warranty_text: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  useEffect(() => {
    if (open) {
      setVals({
        name: "",
        sku: "",
        category: "other",
        image_url: "",
        description: "",
        manual_url: "",
        quick_guide_url: "",
        warranty_url: "",
        warranty_text: "",
      });
      setErr(null);
    }
  }, [open]);

  function set<K extends keyof CatalogWriteIn>(key: K, v: CatalogWriteIn[K]) {
    setVals((s) => ({ ...s, [key]: v }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!vals.name.trim()) {
      setErr(new Error("Navn er påkrevd."));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const body: CatalogWriteIn = {
        name: vals.name.trim(),
        sku: vals.sku?.trim() || null,
        category: vals.category || "other",
        image_url: vals.image_url?.trim() || null,
        description: vals.description?.trim() || null,
        manual_url: vals.manual_url?.trim() || null,
        quick_guide_url: vals.quick_guide_url?.trim() || null,
        warranty_url: vals.warranty_url?.trim() || null,
        warranty_text: vals.warranty_text?.trim() || null,
        owner_firm_id: firmId,
      };
      const created = await api.createCatalog(body);
      // Auto-subscribe the firm to the new catalog entry so it appears in Produkter.
      await api.linkProduct(firmId, created.id);
      onCreated();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Lag nytt produkt for ditt firma">
      <ErrorBanner error={err} />
      <p className="text-xs text-slate-500 mb-4">
        Produktet er privat for ditt firma og synes ikke for andre. Det blir automatisk
        abonnert på når det opprettes.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Navn *">
          <Input
            value={vals.name}
            onChange={(e) => set("name", e.target.value)}
            required
            maxLength={200}
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="SKU">
            <Input
              value={vals.sku ?? ""}
              onChange={(e) => set("sku", e.target.value)}
              maxLength={100}
            />
          </Field>
          <Field label="Kategori">
            <Select
              value={vals.category}
              onChange={(e) => set("category", e.target.value)}
            >
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Bilde-URL">
          <Input
            type="url"
            value={vals.image_url ?? ""}
            onChange={(e) => set("image_url", e.target.value)}
          />
        </Field>
        <Field label="Beskrivelse">
          <Textarea
            value={vals.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Manual-URL">
            <Input
              type="url"
              value={vals.manual_url ?? ""}
              onChange={(e) => set("manual_url", e.target.value)}
            />
          </Field>
          <Field label="Hurtigveiledning-URL">
            <Input
              type="url"
              value={vals.quick_guide_url ?? ""}
              onChange={(e) => set("quick_guide_url", e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Garanti-URL">
            <Input
              type="url"
              value={vals.warranty_url ?? ""}
              onChange={(e) => set("warranty_url", e.target.value)}
            />
          </Field>
          <Field label="Garantitekst">
            <Textarea
              value={vals.warranty_text ?? ""}
              onChange={(e) => set("warranty_text", e.target.value)}
              rows={2}
            />
          </Field>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Avbryt
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Oppretter…" : "Opprett produkt"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Edit firm-owned catalog product (full fields) ----------

function EditOwnProductModal({
  open,
  catalogEntry,
  productName,
  onClose,
  onSaved,
}: {
  open: boolean;
  catalogEntry: CatalogOut;
  productName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [vals, setVals] = useState<CatalogWriteIn>({
    name: catalogEntry.name,
    sku: catalogEntry.sku ?? "",
    category: catalogEntry.category,
    image_url: catalogEntry.image_url ?? "",
    description: catalogEntry.description ?? "",
    manual_url: catalogEntry.manual_url ?? "",
    quick_guide_url: catalogEntry.quick_guide_url ?? "",
    warranty_url: catalogEntry.warranty_url ?? "",
    warranty_text: catalogEntry.warranty_text ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  useEffect(() => {
    if (open) {
      setVals({
        name: catalogEntry.name,
        sku: catalogEntry.sku ?? "",
        category: catalogEntry.category,
        image_url: catalogEntry.image_url ?? "",
        description: catalogEntry.description ?? "",
        manual_url: catalogEntry.manual_url ?? "",
        quick_guide_url: catalogEntry.quick_guide_url ?? "",
        warranty_url: catalogEntry.warranty_url ?? "",
        warranty_text: catalogEntry.warranty_text ?? "",
      });
      setErr(null);
    }
  }, [open, catalogEntry]);

  function set<K extends keyof CatalogWriteIn>(key: K, v: CatalogWriteIn[K]) {
    setVals((s) => ({ ...s, [key]: v }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!vals.name.trim()) {
      setErr(new Error("Navn er påkrevd."));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const body: Partial<CatalogWriteIn> = {
        name: vals.name.trim(),
        sku: vals.sku?.trim() || null,
        category: vals.category || "other",
        image_url: vals.image_url?.trim() || null,
        description: vals.description?.trim() || null,
        manual_url: vals.manual_url?.trim() || null,
        quick_guide_url: vals.quick_guide_url?.trim() || null,
        warranty_url: vals.warranty_url?.trim() || null,
        warranty_text: vals.warranty_text?.trim() || null,
      };
      await api.updateCatalog(catalogEntry.id, body);
      onSaved();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Rediger "${productName}"`}>
      <ErrorBanner error={err} />
      <p className="text-xs text-slate-500 mb-4">
        Endringer her gjelder for ditt firmas produkt. Alle felt kan endres fritt.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Navn *">
          <Input
            value={vals.name}
            onChange={(e) => set("name", e.target.value)}
            required
            maxLength={200}
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="SKU">
            <Input
              value={vals.sku ?? ""}
              onChange={(e) => set("sku", e.target.value)}
              maxLength={100}
            />
          </Field>
          <Field label="Kategori">
            <Select
              value={vals.category}
              onChange={(e) => set("category", e.target.value)}
            >
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Bilde-URL">
          <Input
            type="url"
            value={vals.image_url ?? ""}
            onChange={(e) => set("image_url", e.target.value)}
          />
          {vals.image_url ? (
            <img
              src={vals.image_url}
              alt=""
              className="mt-2 h-20 w-20 object-contain rounded bg-slate-50 border border-slate-200"
            />
          ) : null}
        </Field>
        <Field label="Beskrivelse">
          <Textarea
            value={vals.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Manual-URL">
            <Input
              type="url"
              value={vals.manual_url ?? ""}
              onChange={(e) => set("manual_url", e.target.value)}
            />
          </Field>
          <Field label="Hurtigveiledning-URL">
            <Input
              type="url"
              value={vals.quick_guide_url ?? ""}
              onChange={(e) => set("quick_guide_url", e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Garanti-URL">
            <Input
              type="url"
              value={vals.warranty_url ?? ""}
              onChange={(e) => set("warranty_url", e.target.value)}
            />
          </Field>
          <Field label="Garantitekst">
            <Textarea
              value={vals.warranty_text ?? ""}
              onChange={(e) => set("warranty_text", e.target.value)}
              rows={2}
            />
          </Field>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" type="button" onClick={onClose}>
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
