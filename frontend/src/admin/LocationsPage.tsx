import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type FirmLocationOut } from "./client";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  Table,
  Td,
  Th,
  useToggle,
} from "./ui";

/**
 * Manage the predefined-location list for a firm.
 *
 * The festival scan flow uses these names so operators can tap a chip
 * instead of typing a free-form location. Setting a Discord role id makes
 * quick-support / ticket notifications mention that role instead of @here,
 * so the right on-site team gets pinged on phones/watches immediately.
 */
export function LocationsPage() {
  const { firmId = "" } = useParams<{ firmId: string }>();
  const [items, setItems] = useState<FirmLocationOut[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<FirmLocationOut | null>(null);
  const modal = useToggle();

  async function reload() {
    try {
      setItems(await api.listLocations(firmId));
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    if (firmId) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmId]);

  async function del(id: string) {
    if (!confirm("Slette denne lokasjonen?")) return;
    try {
      await api.deleteLocation(firmId, id);
      void reload();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Lokasjoner"
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              modal.on();
            }}
          >
            + Ny lokasjon
          </Button>
        }
      />
      <p className="text-sm text-slate-500 -mt-4 mb-5">
        Forhåndsdefinerte steder for festival-skann. Knytt en Discord-rolle for å pinge riktig
        team i stedet for <code>@here</code>.
      </p>
      <ErrorBanner error={error} />

      {items.length === 0 ? (
        <Card className="p-8 text-center text-slate-500">Ingen lokasjoner ennå.</Card>
      ) : (
        <Table>
          <thead className="bg-slate-50">
            <tr>
              <Th>Navn</Th>
              <Th>Discord-rolle</Th>
              <Th>Sortering</Th>
              <Th>Handlinger</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((l) => (
              <tr key={l.id}>
                <Td>{l.name}</Td>
                <Td className="font-mono text-xs">{l.discord_role_id ?? "—"}</Td>
                <Td>{l.sort_order}</Td>
                <Td>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditing(l);
                        modal.on();
                      }}
                      className="text-sm text-slate-600 hover:text-slate-900"
                    >
                      Rediger
                    </button>
                    <button
                      onClick={() => del(l.id)}
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

      <LocationModal
        open={modal.open}
        onClose={modal.off}
        firmId={firmId}
        location={editing}
        onSaved={() => {
          modal.off();
          void reload();
        }}
      />
    </div>
  );
}

function LocationModal({
  open,
  onClose,
  firmId,
  location,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  firmId: string;
  location: FirmLocationOut | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!open) return;
    setName(location?.name ?? "");
    setRoleId(location?.discord_role_id ?? "");
    setSortOrder(location?.sort_order ?? 0);
    setError(null);
  }, [open, location]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        discord_role_id: roleId.trim() || null,
        sort_order: sortOrder,
      };
      if (location) await api.updateLocation(firmId, location.id, body);
      else await api.createLocation(firmId, body);
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={location ? "Rediger lokasjon" : "Ny lokasjon"}>
      <ErrorBanner error={error} />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Navn">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field
          label="Discord-rolle ID (valgfritt)"
          hint="Numerisk snowflake-ID. Mention sendes som <@&ID> i stedet for @here."
        >
          <Input
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            placeholder="f.eks. 123456789012345678"
            inputMode="numeric"
            pattern="\d*"
          />
        </Field>
        <Field label="Sortering">
          <Input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(parseInt(e.target.value || "0", 10))}
          />
        </Field>
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
