import { useEffect, useState } from "react";
import { Label } from "../components/Label";
import { api, type AssetOut, type FirmOut } from "../admin/client";
import { useAuth } from "../admin/AuthContext";
import { Button, Card, ErrorBanner, Field, PageHeader, Select, Textarea } from "../admin/ui";

const PUBLIC_BASE =
  import.meta.env.VITE_PUBLIC_BASE ?? `${window.location.protocol}//${window.location.host}`;

export function AdminLabels() {
  const { user } = useAuth();
  const [firms, setFirms] = useState<FirmOut[]>([]);
  const [firmId, setFirmId] = useState<string>("");
  const [assets, setAssets] = useState<AssetOut[]>([]);
  const [uuids, setUuids] = useState<string>("");
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

  return (
    <div className="p-8">
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

          <Field
            label="Asset UUID-er (én per linje)"
            hint="60×12 mm, ingen marg. Bruk knappen under for å legge til alle enheter."
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
        </Card>
      </div>

      <div className="space-y-3">
        {ids.map((id) => (
          <Label key={id} url={`${PUBLIC_BASE}/p/${id}`} />
        ))}
      </div>
    </div>
  );
}
