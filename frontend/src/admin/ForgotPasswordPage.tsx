import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./client";
import { Button, ErrorBanner, Field, Input } from "./ui";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.forgotPassword(email.trim().toLowerCase());
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-indigo-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-8 space-y-5">
        <div className="text-center space-y-1">
          <div className="text-xl font-bold text-slate-900">Glemt passord</div>
          <div className="text-sm text-slate-500">
            Vi sender en lenke til e-posten din.
          </div>
        </div>

        {done ? (
          <div className="space-y-4">
            <div className="rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm p-3">
              Hvis en konto er knyttet til <strong>{email}</strong>, har vi sendt en
              lenke for å velge nytt passord. Sjekk innboks og spam.
            </div>
            <Link
              to="/admin/login"
              className="block text-center text-sm text-indigo-600 hover:text-indigo-800"
            >
              Tilbake til innlogging
            </Link>
          </div>
        ) : (
          <>
            <ErrorBanner error={error} />
            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="E-post">
                <Input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Button type="submit" disabled={busy} size="lg" className="w-full">
                {busy ? "Sender…" : "Send lenke"}
              </Button>
              <Link
                to="/admin/login"
                className="block text-center text-xs text-slate-500 hover:text-indigo-600"
              >
                Tilbake til innlogging
              </Link>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
