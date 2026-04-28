import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  api,
  type AccessoryOrderOut,
  type AccessoryOut,
  type AccessoryWriteIn,
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

export function AccessoriesPage() {
  const { firmId = "" } = useParams<{ firmId: string }>();
  const [items, setItems] = useState<AccessoryOut[]>([]);
  const [products, setProducts] = useState<ProductModelOut[]>([]);
  const [orders, setOrders] = useState<AccessoryOrderOut[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<AccessoryOut | null>(null);
  const modal = useToggle();
  const [tab, setTab] = useState<"items" | "orders">("items");

  async function reload() {
    try {
      const [a, p, o] = await Promise.all([
        api.listAccessories(firmId),
        api.listProducts(firmId),
        api.listAccessoryOrders(firmId),
      ]);
      setItems(a);
      setProducts(p);
      setOrders(o);
    } catch (e) {
      setError(e);
    }
  }

  useEffect(() => {
    if (firmId) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmId]);

  async function del(id: string) {
    if (!confirm("Slette tilbehør?")) return;
    try {
      await api.deleteAccessory(firmId, id);
      await reload();
    } catch (e) {
      setError(e);
    }
  }

  const productMap = new Map(products.map((p) => [p.id, p]));
  const accessoryMap = new Map(items.map((a) => [a.id, a]));

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Tilbehør"
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              modal.on();
            }}
          >
            + Nytt tilbehør
          </Button>
        }
      />
      <ErrorBanner error={error} />

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab("items")}
          className={`px-3 py-1.5 rounded-md text-sm font-medium ${
            tab === "items" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border"
          }`}
        >
          Varekatalog ({items.length})
        </button>
        <button
          onClick={() => setTab("orders")}
          className={`px-3 py-1.5 rounded-md text-sm font-medium ${
            tab === "orders" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border"
          }`}
        >
          Bestillinger ({orders.length})
        </button>
      </div>

      {tab === "items" ? (
        items.length === 0 ? (
          <Card className="p-8 text-center text-slate-500">
            Ingen tilbehør ennå. Legg til kassaruller, terminalruller, ladekabler osv.
          </Card>
        ) : (
          <Table>
            <thead className="bg-slate-50">
              <tr>
                <Th>Vare</Th>
                <Th>Pris</Th>
                <Th>Gjelder</Th>
                <Th>Status</Th>
                <Th>Handlinger</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((a) => (
                <tr key={a.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      {a.image_url ? (
                        <img
                          src={a.image_url}
                          alt=""
                          className="h-10 w-10 object-contain rounded border border-slate-200 bg-white"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-slate-100" />
                      )}
                      <div>
                        <div className="font-medium text-slate-900">{a.name}</div>
                        <div className="text-xs text-slate-400">{a.sku ?? "—"}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    {a.price_label ? (
                      <span>
                        {a.price_label}
                        {a.unit ? <span className="text-slate-400"> / {a.unit}</span> : null}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                  <Td>
                    {a.firm_product_id
                      ? productMap.get(a.firm_product_id)?.name ?? "—"
                      : <span className="text-slate-500">Alle produkter</span>}
                  </Td>
                  <Td>
                    {a.is_active ? (
                      <Badge tone="green">Aktiv</Badge>
                    ) : (
                      <Badge tone="slate">Skjult</Badge>
                    )}
                  </Td>
                  <Td>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditing(a);
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
        )
      ) : orders.length === 0 ? (
        <Card className="p-8 text-center text-slate-500">Ingen bestillinger ennå.</Card>
      ) : (
        <Table>
          <thead className="bg-slate-50">
            <tr>
              <Th>Tidspunkt</Th>
              <Th>Vare</Th>
              <Th>Antall</Th>
              <Th>Kunde</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((o) => (
              <tr key={o.id}>
                <Td>{new Date(o.created_at).toLocaleString("nb-NO")}</Td>
                <Td>{accessoryMap.get(o.accessory_id)?.name ?? o.accessory_id}</Td>
                <Td>{o.quantity}</Td>
                <Td>
                  <div className="text-sm">{o.customer_name ?? "—"}</div>
                  <div className="text-xs text-slate-400">{o.customer_email}</div>
                  {o.customer_phone && (
                    <div className="text-xs text-slate-400">{o.customer_phone}</div>
                  )}
                </Td>
                <Td>
                  <Badge
                    tone={
                      o.status === "sent"
                        ? "green"
                        : o.status === "failed"
                          ? "red"
                          : "slate"
                    }
                  >
                    {o.status}
                  </Badge>
                  {o.last_error && (
                    <div className="text-xs text-red-600 mt-1 max-w-xs truncate" title={o.last_error}>
                      {o.last_error}
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <AccessoryModal
        open={modal.open}
        onClose={modal.off}
        firmId={firmId}
        item={editing}
        products={products}
        onSaved={() => {
          modal.off();
          void reload();
        }}
      />
    </div>
  );
}

function AccessoryModal({
  open,
  onClose,
  firmId,
  item,
  products,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  firmId: string;
  item: AccessoryOut | null;
  products: ProductModelOut[];
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [priceLabel, setPriceLabel] = useState("");
  const [unit, setUnit] = useState("");
  const [productModelId, setProductModelId] = useState<string>("");
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? "");
    setSku(item?.sku ?? "");
    setDescription(item?.description ?? "");
    setImageUrl(item?.image_url ?? "");
    setPriceLabel(item?.price_label ?? "");
    setUnit(item?.unit ?? "");
    setProductModelId(item?.firm_product_id ?? "");
    setIsActive(item?.is_active ?? true);
    setError(null);
  }, [open, item]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: AccessoryWriteIn = {
        name,
        sku: sku || null,
        description: description || null,
        image_url: imageUrl || null,
        price_label: priceLabel || null,
        unit: unit || null,
        firm_product_id: productModelId || null,
        is_active: isActive,
      };
      if (item) await api.updateAccessory(firmId, item.id, payload);
      else await api.createAccessory(firmId, payload);
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={item ? "Rediger tilbehør" : "Nytt tilbehør"}>
      <ErrorBanner error={error} />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Navn">
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="F.eks. Kassarull 57x40"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU / artikkelnr">
            <Input value={sku} onChange={(e) => setSku(e.target.value)} />
          </Field>
          <Field label="Pris (fri tekst)">
            <Input
              value={priceLabel}
              onChange={(e) => setPriceLabel(e.target.value)}
              placeholder="F.eks. 45 kr"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Enhet">
            <Input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="rull, pakke, stk"
            />
          </Field>
          <Field label="Gjelder produkt">
            <Select
              value={productModelId}
              onChange={(e) => setProductModelId(e.target.value)}
            >
              <option value="">Alle produkter</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Bilde-URL">
          <Input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
          />
        </Field>
        {imageUrl && (
          <img
            src={imageUrl}
            alt=""
            className="h-20 w-20 object-contain border border-slate-200 rounded-lg bg-white"
          />
        )}
        <Field label="Beskrivelse">
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Aktiv (vises på kundesiden)
        </label>
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
