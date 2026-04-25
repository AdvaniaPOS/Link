import { FormEvent, useEffect, useState } from "react";
import { api, type FirmOut, type UserOut, type UserRole } from "./client";
import { useAuth } from "./AuthContext";
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
  Th,
  useToggle,
} from "./ui";

export function UsersPage() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";
  const [users, setUsers] = useState<UserOut[]>([]);
  const [firms, setFirms] = useState<FirmOut[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<UserOut | null>(null);
  const modal = useToggle();

  async function reload() {
    try {
      const [u, f] = await Promise.all([api.listUsers(), api.listFirms()]);
      setUsers(u);
      setFirms(f);
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    void reload();
  }, []);

  const firmName = (id: string | null) =>
    id ? firms.find((f) => f.id === id)?.name ?? id : "—";

  async function del(id: string) {
    if (!confirm("Slette denne brukeren?")) return;
    try {
      await api.deleteUser(id);
      void reload();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <div className="p-8">
      <PageHeader
        title="Brukere"
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              modal.on();
            }}
          >
            + Ny bruker
          </Button>
        }
      />
      <ErrorBanner error={error} />

      {users.length === 0 ? (
        <Card className="p-8 text-center text-slate-500">Ingen brukere.</Card>
      ) : (
        <Table>
          <thead className="bg-slate-50">
            <tr>
              <Th>E-post</Th>
              <Th>Navn</Th>
              <Th>Rolle</Th>
              <Th>Firma</Th>
              <Th>Status</Th>
              <Th>Handlinger</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <Td className="font-mono text-xs">{u.email}</Td>
                <Td>{u.full_name ?? "—"}</Td>
                <Td>
                  {u.role === "super_admin" ? (
                    <Badge tone="indigo">Super Admin</Badge>
                  ) : (
                    <Badge>Firm Admin</Badge>
                  )}
                </Td>
                <Td>{firmName(u.firm_id)}</Td>
                <Td>
                  {u.is_active ? (
                    <Badge tone="green">Aktiv</Badge>
                  ) : (
                    <Badge tone="red">Deaktivert</Badge>
                  )}
                </Td>
                <Td>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditing(u);
                        modal.on();
                      }}
                      className="text-sm text-slate-600 hover:text-slate-900"
                    >
                      Rediger
                    </button>
                    {u.id !== user?.id && (
                      <button
                        onClick={() => del(u.id)}
                        className="text-sm text-red-600 hover:text-red-800"
                      >
                        Slett
                      </button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <UserModal
        open={modal.open}
        onClose={modal.off}
        user={editing}
        firms={firms}
        isSuper={isSuper}
        defaultFirmId={user?.firm_id ?? null}
        onSaved={() => {
          modal.off();
          void reload();
        }}
      />
    </div>
  );
}

function UserModal({
  open,
  onClose,
  user,
  firms,
  isSuper,
  defaultFirmId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  user: UserOut | null;
  firms: FirmOut[];
  isSuper: boolean;
  defaultFirmId: string | null;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("firm_admin");
  const [firmId, setFirmId] = useState<string>("");
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!open) return;
    setEmail(user?.email ?? "");
    setFullName(user?.full_name ?? "");
    setPassword("");
    setRole(user?.role ?? "firm_admin");
    setFirmId(user?.firm_id ?? defaultFirmId ?? firms[0]?.id ?? "");
    setIsActive(user?.is_active ?? true);
    setError(null);
  }, [open, user, defaultFirmId, firms]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (user) {
        const patch: { full_name?: string; password?: string; is_active?: boolean } = {
          full_name: fullName,
          is_active: isActive,
        };
        if (password) patch.password = password;
        await api.updateUser(user.id, patch);
      } else {
        await api.createUser({
          email,
          password,
          full_name: fullName || undefined,
          role,
          firm_id: role === "super_admin" ? null : firmId,
        });
      }
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={user ? "Rediger bruker" : "Ny bruker"}>
      <ErrorBanner error={error} />
      <form onSubmit={submit} className="space-y-4">
        <Field label="E-post">
          <Input
            type="email"
            required
            disabled={!!user}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Fullt navn">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field
          label={user ? "Nytt passord (valgfritt)" : "Passord"}
          hint="Min 8 tegn"
        >
          <Input
            type="password"
            required={!user}
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {!user && (
          <>
            {isSuper && (
              <Field label="Rolle">
                <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                  <option value="firm_admin">Firm Admin</option>
                  <option value="super_admin">Super Admin</option>
                </Select>
              </Field>
            )}
            {role === "firm_admin" && (
              <Field label="Firma">
                <Select
                  required
                  value={firmId}
                  onChange={(e) => setFirmId(e.target.value)}
                  disabled={!isSuper}
                >
                  {firms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </>
        )}
        {user && (
          <Field label="Status">
            <Select
              value={isActive ? "1" : "0"}
              onChange={(e) => setIsActive(e.target.value === "1")}
            >
              <option value="1">Aktiv</option>
              <option value="0">Deaktivert</option>
            </Select>
          </Field>
        )}

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
