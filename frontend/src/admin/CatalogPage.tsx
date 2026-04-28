import { FormEvent, useEffect, useState } from "react";
import {
  api,
  type CatalogOut,
  type CatalogWriteIn,
} from "./client";
import {
  Badge,
  Button,
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

const CATEGORIES = [
  { value: "terminal", label: "Terminal" },
  { value: "printer", label: "Printer" },
  { value: "accessory", label: "Tilbehør" },
  { value: "other", label: "Annet" },
];

export function CatalogPage() {
  const [items, setItems] = useState<CatalogOut[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<CatalogOut | null>(null);
  const modal = useToggle();

  async function reload() {
    try {
      setItems(await api.listCatalog());
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    void reload();
  }, []);

  async function del(c: CatalogOut) {
    if (!confirm(`Slette "${c.name}" fra katalogen?`)) return;
    try {
      await api.deleteCatalog(c.id);
      void reload();
    } catch (e) {
      setError(e);
    }
  }

  function startNew() {
    setEditing(null);
    modal.on();
  }

  function startEdit(c: CatalogOut) {
    setEditing(c);
    modal.on();
  }

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Produktkatalog"
        actions={<Button onClick={startNew}>Nytt produkt</Button>}
      />
      <ErrorBanner error={error} />

      <p className="text-sm text-slate-500 mb-4 max-w-2xl">
        Den globale katalogen er felles for alle firmaer. Firmaer abonnerer på produkter
        herfra og kan overstyre beskrivelse, manualer, garanti m.m. per firma.
      </p>

      <Table>
        <thead>
          <tr>
            <Th>Produkt</Th>
            <Th>SKU</Th>
            <Th>Kategori</Th>
            <Th>Lenker</Th>
            <Th>Handlinger</Th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                Ingen katalogprodukter ennå.
              </td>
            </tr>
          )}
          {items.map((c) => (
            <tr key={c.id}>
              <Td>
                <div className="flex items-center gap-3">
                  {c.image_url ? (
                    <img
                      src={c.image_url}
                      alt=""
                      className="h-10 w-10 object-contain rounded bg-slate-50 border border-slate-200"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded bg-slate-100" />
                  )}
                  <span className="font-medium text-slate-800">{c.name}</span>
                </div>
              </Td>
              <Td>{c.sku ?? "—"}</Td>
              <Td>{c.category}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {c.manual_url && <Badge tone="indigo">Manual</Badge>}
                  {c.quick_guide_url && <Badge tone="indigo">Quickguide</Badge>}
                  {c.warranty_url && <Badge tone="amber">Garanti</Badge>}
                </div>
              </Td>
              <Td>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(c)}
                    className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
                  >
                    Rediger
                  </button>
                  <button
                    type="button"
                    onClick={() => del(c)}
                    className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50"
                  >
                    Slett
                  </button>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <CatalogModal
        open={modal.open}
        item={editing}
        onClose={() => {
          modal.off();
          setEditing(null);
        }}
        onSaved={() => {
          modal.off();
          setEditing(null);
          void reload();
        }}
      />
    </div>
  );
}

function CatalogModal({
  open,
  item,
  onClose,
  onSaved,
}: {
  open: boolean;
  item: CatalogOut | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [vals, setVals] = useState<CatalogWriteIn>({ name: "", category: "other" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  useEffect(() => {
    if (open) {
      setErr(null);
      setVals(
        item
          ? {
              name: item.name,
              sku: item.sku ?? "",
              category: item.category,
              image_url: item.image_url ?? "",
              background_url: item.background_url ?? "",
              background_kind: item.background_kind ?? "image",
              description: item.description ?? "",
              manual_url: item.manual_url ?? "",
              quick_guide_url: item.quick_guide_url ?? "",
              warranty_url: item.warranty_url ?? "",
              warranty_text: item.warranty_text ?? "",
            }
          : { name: "", category: "other", background_kind: "image" },
      );
    }
  }, [open, item]);

  function set<K extends keyof CatalogWriteIn>(k: K, v: CatalogWriteIn[K]) {
    setVals((s) => ({ ...s, [k]: v }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      // Send empty strings as null so backend treats them as cleared.
      const payload: CatalogWriteIn = {
        ...vals,
        sku: vals.sku || null,
        image_url: vals.image_url || null,
        background_url: vals.background_url || null,
        background_kind: vals.background_kind ?? "image",
        description: vals.description || null,
        manual_url: vals.manual_url || null,
        quick_guide_url: vals.quick_guide_url || null,
        warranty_url: vals.warranty_url || null,
        warranty_text: vals.warranty_text || null,
      };
      if (item) await api.updateCatalog(item.id, payload);
      else await api.createCatalog(payload);
      onSaved();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={item ? "Rediger produkt" : "Nytt produkt"}>
      <ErrorBanner error={err} />
      <form onSubmit={submit} className="space-y-3">
        <Field label="Navn">
          <Input
            value={vals.name}
            onChange={(e) => set("name", e.target.value)}
            required
            placeholder="F.eks. Verifone T650P"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU / artikkelnr">
            <Input value={vals.sku ?? ""} onChange={(e) => set("sku", e.target.value)} />
          </Field>
          <Field label="Kategori">
            <Select
              value={vals.category ?? "other"}
              onChange={(e) => set("category", e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
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
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Bakgrunns-URL (valgfritt)" hint="Vises bak produktsiden. Bilde eller video.">
            <Input
              type="url"
              value={vals.background_url ?? ""}
              onChange={(e) => set("background_url", e.target.value)}
              placeholder="https://..."
            />
          </Field>
          <Field label="Type">
            <Select
              value={vals.background_kind ?? "image"}
              onChange={(e) => set("background_kind", e.target.value as "image" | "video")}
            >
              <option value="image">Bilde</option>
              <option value="video">Video</option>
            </Select>
          </Field>
        </div>
        <Field label="Beskrivelse">
          <Textarea
            value={vals.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
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
