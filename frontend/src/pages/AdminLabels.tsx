import { useEffect, useMemo, useState } from "react";
import { Label } from "../components/Label";
import { api, type AssetOut, type FirmOut } from "../admin/client";
import { useAuth } from "../admin/AuthContext";
import { Button, Card, ErrorBanner, Field, Input, PageHeader, Select, Textarea } from "../admin/ui";

const PUBLIC_BASE =
  import.meta.env.VITE_PUBLIC_BASE ?? `${window.location.protocol}//${window.location.host}`;

const LENGTH_PRESETS = [
  { mm: 40, label: "40 mm (kort)" },
  { mm: 60, label: "60 mm (standard)" },
  { mm: 80, label: "80 mm (lang)" },
  { mm: 100, label: "100 mm (ekstra lang)" },
];

export function AdminLabels() {
  const { user } = useAuth();
  const [firms, setFirms] = useState<FirmOut[]>([]);
  const [firmId, setFirmId] = useState<string>("");
  const [assets, setAssets] = useState<AssetOut[]>([]);
  const [uuids, setUuids] = useState<string>("");
  const [tapeLength, setTapeLength] = useState<number>(60);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    (async () => {
      try {
        const f = await api.listFirms();
        setFirms(f);
        const initial = user?.role === "super_admin" ? f[0]?.id : user?.firm_id ?? "";
        if (initial) setFirmId(initial);
      } catch (e) {
        setError(e);
      }
    })();
  }, [user]);

  useEffect(() => {
    if (!firmId) return;
    (async () => {
      try {
        setAssets(await api.listAssets(firmId));
      } catch (e) {
        setError(e);
      }
    })();
  }, [firmId]);

  function addAll() {
    setUuids(assets.map((a) => a.id).join("\n"));
  }

  const ids = uuids
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const captionFor = useMemo(() => {
    const map = new Map(assets.map((a) => [a.id, a]));
    return (id: string) => {
      const a = map.get(id);
      if (!a) return "Skann for hjelp/bestilling";
      const parts = [a.serial_number, a.location].filter(Boolean);
      return parts.length ? parts.join(" • ") : "Skann for hjelp/bestilling";
    };
  }, [assets]);

  const rootStyle = { ["--label-length" as never]: `${tapeLength}mm` } as React.CSSProperties;

  return (
    <div className="p-8" style={rootStyle}>
      <div className="no-print">
        <PageHeader
          title="Etiketter"
          actions={
            <Button onClick={() => window.print()} disabled={ids.length === 0}>
              Skriv ut {ids.length}
            </Button>
          }
        />
        <ErrorBanner error={error} />

        <Card className="p-5 space-y-4 mb-6">
          <p className="text-xs text-slate-500">
            Brother P-touch 2100 med 12 mm TZe-tape. Hver QR-etikett skrives ut som
            egen tape-side. Velg lengde under – PT-2100 kutter automatisk mellom hver.
          </p>

          {user?.role === "super_admin" && (
            <Field label="Firma">
              <Select value={firmId} onChange={(e) => setFirmId(e.target.value)}>
                <option value="">– velg –</option>
                {firms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Tape-lengde">
              <Select
                value={String(tapeLength)}
                onChange={(e) => setTapeLength(Number(e.target.value))}
              >
                {LENGTH_PRESETS.map((p) => (
                  <option key={p.mm} value={p.mm}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Egendefinert (mm)" hint="Overstyrer presetet ovenfor.">
              <Input
                type="number"
                min={20}
                max={200}
                value={tapeLength}
                onChange={(e) => setTapeLength(Math.max(20, Math.min(200, Number(e.target.value) || 60)))}
              />
            </Field>
          </div>

          <Field
            label="Asset UUID-er (én per linje)"
            hint="Bruk knappen under for å legge til alle enheter for valgt firma."
          >
            <Textarea
              className="font-mono"
              value={uuids}
              onChange={(e) => setUuids(e.target.value)}
              placeholder="abc-123-...&#10;def-456-..."
            />
          </Field>

          {assets.length > 0 && (
            <Button variant="secondary" onClick={addAll}>
              Legg til alle {assets.length} enheter
            </Button>
          )}

          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer font-medium text-slate-700">
              Tips for utskrift på Brother P-touch 2100
            </summary>
            <ol className="mt-2 list-decimal list-inside space-y-1">
              <li>Sett inn 12 mm TZe-tape og koble PT-2100 til via USB.</li>
              <li>Klikk «Skriv ut» og velg <strong>Brother PT-2100</strong> som skriver.</li>
              <li>I utskriftsdialogen: marg = 0, skala = 100 %, ingen topp-/bunntekst.</li>
              <li>I PT-driveren: «Auto cut» = på, «Half cut» = av, «Mirror» = av.</li>
            </ol>
          </details>
        </Card>
      </div>

      <div className="space-y-3 print:space-y-0">
        {ids.map((id) => (
          <Label key={id} url={`${PUBLIC_BASE}/p/${id}`} caption={captionFor(id)} />
        ))}
      </div>
    </div>
  );
}
