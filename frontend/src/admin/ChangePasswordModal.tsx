import { FormEvent, useEffect, useState } from "react";
import { api } from "./client";
import { Button, ErrorBanner, Field, Input, Modal } from "./ui";

export function ChangePasswordModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setErr(null);
      setDone(false);
    }
  }, [open]);

  // Local strength signal: not security, just UX feedback.
  const strength = scoreStrength(next);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (next.length < 10) {
      setErr(new Error("Nytt passord må være minst 10 tegn."));
      return;
    }
    if (next !== confirm) {
      setErr(new Error("Bekreftelsen samsvarer ikke."));
      return;
    }
    if (next === current) {
      setErr(new Error("Nytt passord må være forskjellig fra det nåværende."));
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setDone(true);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Endre passord">
      <ErrorBanner error={err} />
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-emerald-700">Passordet er endret.</p>
          <div className="flex justify-end">
            <Button onClick={onClose}>Lukk</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <Field label="Nåværende passord">
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field
            label="Nytt passord"
            hint="Minst 10 tegn. Bruk gjerne en lang setning."
          >
            <Input
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            {next.length > 0 && (
              <div className="mt-1 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded bg-slate-200 overflow-hidden">
                  <div
                    className={`h-full transition-all ${strength.color}`}
                    style={{ width: `${strength.pct}%` }}
                  />
                </div>
                <span className="text-[11px] text-slate-500 w-16 text-right">
                  {strength.label}
                </span>
              </div>
            )}
          </Field>
          <Field label="Bekreft nytt passord">
            <Input
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" type="button" onClick={onClose}>
              Avbryt
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Lagrer…" : "Endre passord"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function scoreStrength(pw: string): { pct: number; label: string; color: string } {
  let s = 0;
  if (pw.length >= 10) s += 1;
  if (pw.length >= 14) s += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s += 1;
  if (/\d/.test(pw)) s += 1;
  if (/[^A-Za-z0-9]/.test(pw)) s += 1;
  const pct = Math.min(100, (s / 5) * 100);
  if (s <= 1) return { pct, label: "Svakt", color: "bg-red-500" };
  if (s <= 3) return { pct, label: "Greit", color: "bg-amber-500" };
  return { pct, label: "Sterkt", color: "bg-emerald-500" };
}
