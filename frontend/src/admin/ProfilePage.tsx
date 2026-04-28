import { FormEvent, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "./AuthContext";
import { api, ApiError } from "./client";
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
} from "./ui";

interface TotpSetup {
  secret: string;
  otpauth_url: string;
}

export function ProfilePage() {
  const { user, refresh } = useAuth();

  if (!user) {
    return <div className="p-6 text-slate-500">Laster…</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Min profil" />

      <Card>
        <div className="space-y-1">
          <div className="text-sm text-slate-500">Pålogget som</div>
          <div className="text-lg font-semibold text-slate-900">
            {user.full_name || user.email}
          </div>
          <div className="text-sm text-slate-600">{user.email}</div>
          <div className="text-xs text-slate-500 pt-1">
            Rolle: <Badge>{user.role}</Badge>
          </div>
        </div>
      </Card>

      <ChangePasswordCard />
      <TwoFactorCard onChange={refresh} enabled={user.totp_enabled} />
    </div>
  );
}

function ChangePasswordCard() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [next2, setNext2] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const canSubmit = cur && next.length >= 10 && next === next2;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      await api.changePassword(cur, next);
      setOk(true);
      setCur("");
      setNext("");
      setNext2("");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h3 className="text-base font-semibold text-slate-900 mb-3">Endre passord</h3>
      {ok && (
        <div className="mb-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm p-2">
          Passordet er oppdatert. Du blir logget ut på andre enheter.
        </div>
      )}
      <ErrorBanner error={error} />
      <form onSubmit={onSubmit} className="space-y-3 max-w-sm">
        <Field label="Nåværende passord">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={cur}
            onChange={(e) => setCur(e.target.value)}
          />
        </Field>
        <Field label="Nytt passord (minst 10 tegn)">
          <Input
            type="password"
            autoComplete="new-password"
            required
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        <Field label="Bekreft nytt passord">
          <Input
            type="password"
            autoComplete="new-password"
            required
            value={next2}
            onChange={(e) => setNext2(e.target.value)}
          />
          {next2 && next !== next2 && (
            <div className="text-xs text-rose-600 mt-1">Passordene er ikke like.</div>
          )}
        </Field>
        <Button type="submit" disabled={busy || !canSubmit}>
          {busy ? "Lagrer…" : "Endre passord"}
        </Button>
      </form>
    </Card>
  );
}

function TwoFactorCard({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: () => Promise<void>;
}) {
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Whenever the enabled flag changes (e.g., after refresh), drop any setup state.
  useEffect(() => {
    if (enabled) setSetup(null);
  }, [enabled]);

  async function startSetup() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await api.setup2fa();
      setSetup(res);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.verify2fa(code.trim());
      setSetup(null);
      setCode("");
      setOk("To-faktor er aktivert.");
      await onChange();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function disable(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.disable2fa(pw);
      setPw("");
      setOk("To-faktor er deaktivert.");
      await onChange();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-slate-900">To-faktor (TOTP)</h3>
        <Badge tone={enabled ? "green" : "slate"}>{enabled ? "Aktivert" : "Av"}</Badge>
      </div>
      {ok && (
        <div className="mb-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm p-2">
          {ok}
        </div>
      )}
      <ErrorBanner error={error} />

      {!enabled && !setup && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Beskytt kontoen din med en autentisator-app (Google Authenticator, 1Password,
            Authy, Microsoft Authenticator m.fl.).
          </p>
          <Button onClick={startSetup} disabled={busy}>
            {busy ? "Genererer…" : "Sett opp 2FA"}
          </Button>
        </div>
      )}

      {!enabled && setup && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Skann QR-koden i autentisator-appen din, og skriv inn den 6-sifrede koden
            for å aktivere.
          </p>
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <div className="rounded-lg border border-slate-200 p-3 bg-white">
              <QRCodeSVG value={setup.otpauth_url} size={180} />
            </div>
            <div className="space-y-2 text-xs text-slate-600 break-all">
              <div className="font-semibold text-slate-700">
                Eller skriv inn nøkkelen manuelt:
              </div>
              <code className="block bg-slate-100 rounded px-2 py-1 select-all">
                {setup.secret}
              </code>
              <ResendableHint detail={(error as ApiError)?.detail} />
            </div>
          </div>
          <form onSubmit={verify} className="space-y-3 max-w-xs">
            <Field label="6-sifret kode">
              <Input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\s+/g, ""))}
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || code.length < 6}>
                {busy ? "Verifiserer…" : "Aktiver"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSetup(null);
                  setCode("");
                }}
              >
                Avbryt
              </Button>
            </div>
          </form>
        </div>
      )}

      {enabled && (
        <form onSubmit={disable} className="space-y-3 max-w-sm">
          <p className="text-sm text-slate-600">
            For å deaktivere, bekreft med ditt nåværende passord.
          </p>
          <Field label="Nåværende passord">
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
          </Field>
          <Button type="submit" variant="danger" disabled={busy || !pw}>
            {busy ? "Deaktiverer…" : "Slå av 2FA"}
          </Button>
        </form>
      )}
    </Card>
  );
}

function ResendableHint({ detail }: { detail?: unknown }) {
  if (!detail || typeof detail !== "string") return null;
  return <div className="text-rose-600">{detail}</div>;
}
