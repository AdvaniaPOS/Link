/**
 * Combined URL + file-upload field. Lets the user either paste a URL or
 * upload a local file (image / video / PDF). On successful upload the
 * resulting URL is written back via ``onChange``.
 */

import { useRef, useState } from "react";
import { api, ApiError } from "./client";
import { Button, Field, Input } from "./ui";

export type UploadKind = "image" | "video" | "document" | "any";

const ACCEPT: Record<UploadKind, string> = {
  image: "image/jpeg,image/png,image/webp,image/gif,image/svg+xml",
  video: "video/mp4,video/webm",
  document: "application/pdf",
  any: "image/*,video/mp4,video/webm,application/pdf",
};

export function UploadField({
  label,
  hint,
  value,
  onChange,
  kind = "any",
  preview = false,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (url: string) => void;
  kind?: UploadKind;
  preview?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api.uploadFile(file);
      onChange(res.url);
    } catch (ex) {
      if (ex instanceof ApiError) {
        setErr(typeof ex.detail === "string" ? ex.detail : `Opplasting feilet (HTTP ${ex.status})`);
      } else {
        setErr(ex instanceof Error ? ex.message : "Opplasting feilet");
      }
    } finally {
      setBusy(false);
      // allow re-picking the same file
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const isImage = preview && value && /\.(jpe?g|png|webp|gif|svg)(\?|$)/i.test(value);

  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2 items-stretch">
        <Input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Lim inn URL eller last opp →"
          className="flex-1"
        />
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT[kind]}
          onChange={handlePick}
          className="hidden"
        />
        <Button
          type="button"
          variant="ghost"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {busy ? "Laster opp…" : "Last opp"}
        </Button>
        {value && (
          <Button type="button" variant="ghost" onClick={() => onChange("")} disabled={busy}>
            Fjern
          </Button>
        )}
      </div>
      {err && <div className="text-xs text-red-600 mt-1">{err}</div>}
      {isImage && (
        <img
          src={value}
          alt=""
          className="mt-2 max-h-24 rounded border border-slate-200 object-contain bg-slate-50"
        />
      )}
    </Field>
  );
}
