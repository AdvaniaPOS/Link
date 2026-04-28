import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  api,
  type AssetOut,
  type FirmLocationOut,
  type ProductModelOut,
} from "./client";
import { Button, Card, ErrorBanner, Input, PageHeader } from "./ui";

// Minimal typings for the (still experimental) Web BarcodeDetector API.
// Available on Chromium-based Android browsers and Edge/Chrome on macOS.
// We feature-detect and fall back to manual entry when missing.
declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

interface BarcodeDetectorConstructor {
  new (opts?: { formats?: string[] }): BarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
}

interface DetectedBarcode {
  rawValue: string;
  format: string;
}

interface BarcodeDetectorInstance {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

const SUPPORTED_FORMATS = [
  "qr_code",
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "ean_13",
  "ean_8",
  "itf",
  "upc_a",
  "upc_e",
  "data_matrix",
];

type Stage =
  | { kind: "scanning" }
  | { kind: "found"; asset: AssetOut; product: ProductModelOut | null }
  | { kind: "saved"; asset: AssetOut; locationName: string };

/**
 * Festival scan page.
 *
 * Flow: scan barcode/QR → look up asset by serial → tap a predefined
 * location chip → location saved on the asset. Optimised for one-handed
 * outdoor use on a phone.
 */
export function ScanPage() {
  const { firmId = "" } = useParams<{ firmId: string }>();

  const [locations, setLocations] = useState<FirmLocationOut[]>([]);
  const [products, setProducts] = useState<ProductModelOut[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [stage, setStage] = useState<Stage>({ kind: "scanning" });
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<{ serial: string; location: string }[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScanRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });

  const detectorAvailable = typeof window !== "undefined" && !!window.BarcodeDetector;

  // Load supporting data.
  useEffect(() => {
    if (!firmId) return;
    Promise.all([api.listLocations(firmId), api.listProducts(firmId)])
      .then(([l, p]) => {
        setLocations(l);
        setProducts(p);
      })
      .catch(setError);
  }, [firmId]);

  // Manage camera lifecycle: only running while in the "scanning" stage.
  useEffect(() => {
    if (stage.kind !== "scanning" || !detectorAvailable) {
      stopCamera();
      return;
    }
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        if (!detectorRef.current && window.BarcodeDetector) {
          detectorRef.current = new window.BarcodeDetector({ formats: SUPPORTED_FORMATS });
        }
        loop();
      } catch (e) {
        setError(e);
      }
    }

    function loop() {
      if (cancelled) return;
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      detector
        .detect(video)
        .then((codes) => {
          if (cancelled || codes.length === 0) {
            if (!cancelled) rafRef.current = requestAnimationFrame(loop);
            return;
          }
          const value = codes[0].rawValue.trim();
          // Debounce: ignore the same value scanned again within 1.5s.
          const now = Date.now();
          if (
            value === lastScanRef.current.value &&
            now - lastScanRef.current.at < 1500
          ) {
            rafRef.current = requestAnimationFrame(loop);
            return;
          }
          lastScanRef.current = { value, at: now };
          void onSerialScanned(value);
        })
        .catch(() => {
          if (!cancelled) rafRef.current = requestAnimationFrame(loop);
        });
    }

    void start();
    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.kind, detectorAvailable]);

  function stopCamera() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function onSerialScanned(rawSerial: string) {
    // QR may encode a full URL like https://.../p/<uuid>. Try to extract a
    // "real" serial first, otherwise pass the value straight to the API.
    const candidate = extractSerial(rawSerial);
    setBusy(true);
    setError(null);
    try {
      const asset = await api.getAssetBySerial(firmId, candidate);
      const product = products.find((p) => p.id === asset.firm_product_id) ?? null;
      setStage({ kind: "found", asset, product });
    } catch (e) {
      setError(e);
      // Stay in scanning so the operator can try another code/serial.
      setStage({ kind: "scanning" });
    } finally {
      setBusy(false);
    }
  }

  async function setLocation(loc: FirmLocationOut) {
    if (stage.kind !== "found") return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateAsset(firmId, stage.asset.id, {
        location: loc.name,
      });
      setRecent((r) =>
        [{ serial: updated.serial_number, location: loc.name }, ...r].slice(0, 10),
      );
      setStage({ kind: "saved", asset: updated, locationName: loc.name });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  function nextScan() {
    setManual("");
    setStage({ kind: "scanning" });
  }

  const sortedLocations = useMemo(
    () =>
      [...locations].sort((a, b) =>
        a.sort_order === b.sort_order
          ? a.name.localeCompare(b.name)
          : a.sort_order - b.sort_order,
      ),
    [locations],
  );

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <PageHeader title="📷 Festival-skann" />
      <p className="text-sm text-slate-500 -mt-3 mb-5">
        Skann strekkode/QR med serienummer, og velg lokasjon fra listen.
      </p>
      <ErrorBanner error={error} />

      {locations.length === 0 && (
        <Card className="p-4 mb-4 bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          Ingen lokasjoner definert. Opprett dem på{" "}
          <span className="font-medium">Lokasjoner</span> først.
        </Card>
      )}

      {stage.kind === "scanning" && (
        <Card className="p-4 mb-4">
          <div className="relative aspect-[4/3] bg-black rounded-lg overflow-hidden">
            {detectorAvailable ? (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-cover"
                />
                {/* Reticle */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="w-2/3 h-1/2 border-2 border-emerald-400/80 rounded-md shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                </div>
                {busy && (
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full">
                    Søker opp enhet…
                  </div>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-sm p-4 text-center">
                Kameraskann er ikke støttet i denne nettleseren. Bruk manuell
                inntasting under (Chrome/Edge på Android anbefales for skann).
              </div>
            )}
          </div>

          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (manual.trim()) void onSerialScanned(manual.trim());
            }}
          >
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="…eller skriv inn serienummer manuelt"
            />
            <Button type="submit" disabled={busy || !manual.trim()}>
              Slå opp
            </Button>
          </form>
        </Card>
      )}

      {stage.kind === "found" && (
        <Card className="p-5 mb-4">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Funnet enhet</div>
              <div className="font-mono text-lg font-semibold text-slate-900">
                {stage.asset.serial_number}
              </div>
              <div className="text-sm text-slate-600">
                {stage.product?.name ?? "Ukjent produkt"}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Nåværende lokasjon: {stage.asset.location ?? "—"}
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={nextScan}>
              Avbryt
            </Button>
          </div>

          {sortedLocations.length === 0 ? (
            <p className="text-sm text-slate-500">
              Ingen forhåndsdefinerte lokasjoner.
            </p>
          ) : (
            <>
              <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">
                Velg lokasjon
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {sortedLocations.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void setLocation(l)}
                    className={`rounded-xl border px-4 py-4 text-base font-medium text-left transition ${
                      stage.asset.location === l.name
                        ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                        : "border-slate-200 bg-white hover:border-indigo-400 hover:bg-indigo-50/50"
                    } disabled:opacity-50`}
                  >
                    <div>{l.name}</div>
                    {l.discord_role_id && (
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        🔔 mention aktiv
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      {stage.kind === "saved" && (
        <Card className="p-5 mb-4 border border-emerald-200 bg-emerald-50">
          <div className="text-sm text-emerald-900">
            ✅ <span className="font-semibold">{stage.asset.serial_number}</span> satt til{" "}
            <span className="font-semibold">{stage.locationName}</span>.
          </div>
          <div className="mt-3 flex gap-2">
            <Button onClick={nextScan}>Skann neste</Button>
          </div>
        </Card>
      )}

      {recent.length > 0 && (
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">
            Sist oppdatert
          </div>
          <ul className="text-sm divide-y divide-slate-100">
            {recent.map((r, i) => (
              <li key={i} className="py-1.5 flex justify-between">
                <span className="font-mono">{r.serial}</span>
                <span className="text-slate-500">{r.location}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function extractSerial(raw: string): string {
  const v = raw.trim();
  // QR codes printed by this system encode the public product page URL
  // (".../p/<uuid>"). The lookup endpoint expects a serial number, so we
  // strip URL wrappers but pass UUIDs straight through (the by-serial
  // lookup will simply 404 for those, prompting the operator to try again).
  try {
    const u = new URL(v);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? v;
  } catch {
    return v;
  }
}
