import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "./client";
import { FloatingThemeToggle } from "./ThemeContext";
import { Button, ErrorBanner, Field, Input } from "./ui";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get("token") ?? "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const tooShort = pw.length > 0 && pw.length < 10;
  const mismatch = pw2.length > 0 && pw !== pw2;
  const canSubmit = !!token && pw.length >= 10 && pw === pw2;

  const strength = useMemo(() => scorePassword(pw), [pw]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword(token, pw);
      setDone(true);
      setTimeout(() => nav("/admin/login", { replace: true }), 1800);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-indigo-50 flex items-center justify-center p-6">
      <FloatingThemeToggle />
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-8 space-y-5">
        <div className="text-center space-y-1">
          <div className="text-xl font-bold text-slate-900">Velg nytt passord</div>
        </div>
        {!token ? (
          <div className="rounded-md bg-rose-50 border border-rose-200 text-rose-900 text-sm p-3">
            Mangler token. Be om ny lenke under <em>Glemt passord</em>.
          </div>
        ) : done ? (
          <div className="rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm p-3">
            Passord oppdatert. Sender deg til innlogging…
          </div>
        ) : (
          <>
            <ErrorBanner error={error} />
            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="Nytt passord (minst 10 tegn)">
                <Input
                  type="password"
                  required
                  autoFocus
                  autoComplete="new-password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                />
                <StrengthMeter score={strength} />
                {tooShort && (
                  <div className="text-xs text-rose-600 mt-1">For kort.</div>
                )}
              </Field>
              <Field label="Bekreft passord">
                <Input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                />
                {mismatch && (
                  <div className="text-xs text-rose-600 mt-1">
                    Passordene er ikke like.
                  </div>
                )}
              </Field>
              <Button
                type="submit"
                disabled={busy || !canSubmit}
                size="lg"
                className="w-full"
              >
                {busy ? "Lagrer…" : "Velg nytt passord"}
              </Button>
            </form>
          </>
        )}
        <Link
          to="/admin/login"
          className="block text-center text-xs text-slate-500 hover:text-indigo-600"
        >
          Tilbake til innlogging
        </Link>
      </div>
    </main>
  );
}

function scorePassword(pw: string): number {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

function StrengthMeter({ score }: { score: number }) {
  const colors = ["bg-slate-200", "bg-rose-400", "bg-amber-400", "bg-lime-500", "bg-emerald-600"];
  return (
    <div className="mt-1 flex gap-1">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded ${i < score ? colors[score] : "bg-slate-200"}`}
        />
      ))}
    </div>
  );
}
