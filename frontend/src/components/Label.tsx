import { QRCodeSVG } from "qrcode.react";

export interface LabelProps {
  /** Full URL encoded into the QR (e.g. https://betala.link/p/abc-123). */
  url: string;
  /** Optional short caption shown next to the QR. */
  caption?: string;
}

/**
 * Brother P-touch 12 mm label.
 * Layout: QR on the left (~9x9 mm), text on the right.
 * Print rules live in `src/index.css` under @media print.
 */
export function Label({ url, caption = "Skann for hjelp/bestilling" }: LabelProps) {
  return (
    <div
      className="label border border-dashed border-slate-300 bg-white"
      style={{ width: "60mm", height: "12mm", display: "flex", alignItems: "center", gap: "1mm", padding: "0.5mm 1mm" }}
    >
      <QRCodeSVG value={url} size={34} style={{ width: "9mm", height: "9mm" }} level="M" />
      <div
        style={{
          fontFamily: "Arial, Helvetica, sans-serif",
          fontSize: "6pt",
          lineHeight: 1.1,
          flex: 1,
        }}
      >
        <div style={{ fontWeight: 700, textTransform: "uppercase" }}>{caption}</div>
        <div style={{ wordBreak: "break-all" }}>{url.replace(/^https?:\/\//, "")}</div>
      </div>
    </div>
  );
}
