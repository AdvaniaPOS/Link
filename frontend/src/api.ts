export interface FirmPublic {
  id: string;
  name: string;
  brand_color: string;
  logo_url: string | null;
}

export interface ProductModelPublic {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  image_url: string | null;
  category: string;
  manual_url: string | null;
  quick_guide_url: string | null;
  warranty_url: string | null;
  warranty_text: string | null;
}

export interface AssetPublic {
  id: string;
  serial_number: string;
  location: string | null;
  firm: FirmPublic;
  product_model: ProductModelPublic;
}

export interface SupportTicketIn {
  customer_name?: string;
  customer_email: string;
  customer_phone?: string;
  contact_preference: "email" | "phone";
  message: string;
  attachment_url?: string;
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

export async function fetchAsset(uuid: string): Promise<AssetPublic> {
  const res = await fetch(`${API_BASE}/p/${uuid}`);
  if (!res.ok) throw new Error(`Failed to load asset: ${res.status}`);
  return res.json();
}

export async function submitSupport(uuid: string, payload: SupportTicketIn): Promise<void> {
  const res = await fetch(`${API_BASE}/p/${uuid}/support`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to submit support: ${res.status}`);
}

export interface AttachmentUploaded {
  url: string;
  absolute_url: string;
  filename: string;
  content_type: string;
  size: number;
}

export async function uploadAttachment(uuid: string, file: File): Promise<AttachmentUploaded> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_BASE}/p/${uuid}/attachment`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const j = await res.json();
      if (j?.detail) detail = j.detail;
    } catch {
      /* ignore */
    }
    throw new Error(`Opplasting feilet: ${detail}`);
  }
  return res.json();
}

export interface AccessoryPublic {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  image_url: string | null;
  price_label: string | null;
  unit: string | null;
}

export interface AccessoryOrderIn {
  accessory_id: string;
  quantity: number;
  customer_name?: string;
  customer_email: string;
  customer_phone?: string;
  note?: string;
}

export async function fetchAccessories(uuid: string): Promise<AccessoryPublic[]> {
  const res = await fetch(`${API_BASE}/p/${uuid}/accessories`);
  if (!res.ok) throw new Error(`Failed to load accessories: ${res.status}`);
  return res.json();
}

export async function submitOrder(uuid: string, payload: AccessoryOrderIn): Promise<void> {
  const res = await fetch(`${API_BASE}/p/${uuid}/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to submit order: ${res.status}`);
}
