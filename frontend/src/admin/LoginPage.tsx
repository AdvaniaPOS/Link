import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { Button, ErrorBanner, Field, Input, Modal } from "./ui";

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from ?? "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [infoOpen, setInfoOpen] = useState(false);

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
    <main className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-indigo-50 flex items-center justify-center p-6">
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={busy} size="lg" className="w-full">
            {busy ? "Logger inn…" : "Logg inn"}
          </Button>
        </form>

        <div className="pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            className="w-full text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Hva kan Betala Link?
          </button>
        </div>
      </div>

      <AboutModal open={infoOpen} onClose={() => setInfoOpen(false)} />
    </main>
  );
}

type Feature = {
  icon: string;
  title: string;
  body: string;
};

const FEATURES: Feature[] = [
  {
    icon: "🏷️",
    title: "QR-etiketter på enheter",
    body: "Hver terminal, printer eller skanner får en unik QR-kode. Kunden skanner og får manual, garanti og support uten å måtte spørre.",
  },
  {
    icon: "🛟",
    title: "Innebygd kundestøtte",
    body: "Kunder sender support-henvendelser direkte fra produktsiden. Varsler går på e-post og Discord, med riktig firma-branding.",
  },
  {
    icon: "🎪",
    title: "Festival- og lokasjons­modus",
    body: "Skann enheter ved utlevering på en festival eller lokasjon. Per-lokasjon Discord-roller blir varslet ved hendelser.",
  },
  {
    icon: "📦",
    title: "Produktkatalog + firma-egne produkter",
    body: "Felles katalog for global standard, og hvert firma kan lage sine egne private produkter med eget bilde, manual og garanti.",
  },
  {
    icon: "🛒",
    title: "Tilbehørs­bestilling",
    body: "Kunder bestiller forbruksvarer (kvitteringsruller, ladere) direkte fra produktsiden — sendes til riktig kontakt hos firmaet.",
  },
  {
    icon: "🏢",
    title: "Multi-firma & medlemskap",
    body: "En operatør kan ha tilgang til flere firmaer og bytte aktivt firma i toppen. Roller: super-admin og firma-admin.",
  },
  {
    icon: "📷",
    title: "Mobil-skann",
    body: "Skann serienummer eller QR-kode fra mobil for hurtig­registrering, utdeling eller statussjekk i felt.",
  },
  {
    icon: "🚀",
    title: "Hurtig­registrering",
    body: "Bulk-registrer enheter med serienummer på sekunder — perfekt når en stor leveranse skal inn i systemet.",
  },
  {
    icon: "🔔",
    title: "Discord-integrasjon",
    body: "Per-firma webhook med pene embeds og rolle-mention. Velg om varsler kun går til lokasjons­ansvarlig.",
  },
  {
    icon: "🔐",
    title: "Sikkerhet i bunn",
    body: "Bcrypt-hashing av passord, JWT-økter, rate-limiting på login, CORS og brukerstyrt passord­bytte.",
  },
];

function AboutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Hva kan Betala Link?">
      <div className="space-y-5">
        <p className="text-sm text-slate-600">
          Et komplett system for håndtering av betalings­terminaler og POS-utstyr —
          fra utrulling til kundestøtte. Bygget for både fast drift og festival­sesong.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-lg border border-slate-200 p-3 bg-slate-50/50"
            >
              <div className="flex items-start gap-2">
                <span className="text-xl leading-none mt-0.5" aria-hidden>
                  {f.icon}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">{f.title}</div>
                  <div className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                    {f.body}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3 text-xs text-indigo-900">
          <div className="font-semibold mb-1">Slik kommer du i gang</div>
          <ol className="list-decimal pl-4 space-y-0.5">
            <li>Logg inn som firma-admin.</li>
            <li>Lag eller velg produkter under <em>Produkter</em>.</li>
            <li>Registrer enheter under <em>Enheter</em> eller <em>Hurtig­registrering</em>.</li>
            <li>Skriv ut QR-etiketter under <em>Etiketter</em> og fest dem på utstyret.</li>
          </ol>
        </div>

        <div className="flex justify-end">
          <Button onClick={onClose}>Lukk</Button>
        </div>
      </div>
    </Modal>
  );
}
