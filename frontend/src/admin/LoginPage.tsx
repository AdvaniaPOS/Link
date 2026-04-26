import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { Button, ErrorBanner, Field, Input } from "./ui";

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from ?? "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      nav(from, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-8 space-y-5">
        <div className="text-center space-y-1">
          <div className="text-xl font-bold text-slate-900">Betala Link</div>
          <div className="text-sm text-slate-500">Admin innlogging</div>
        </div>

        <ErrorBanner error={error} />

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="E-post">
            <Input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@firma.no"
            />
          </Field>
          <Field label="Passord">
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={busy} size="lg" className="w-full">
            {busy ? "Logger inn…" : "Logg inn"}
          </Button>
        </form>
      </div>
    </main>
  );
}
