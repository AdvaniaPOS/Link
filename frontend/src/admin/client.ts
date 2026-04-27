/**
 * Lightweight typed fetch client for the admin portal.
 * Reads JWT from localStorage and attaches Authorization header.
 */

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";
const TOKEN_KEY = "betala_token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown, message: string) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = tokenStore.get();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    const detail =
      (data && typeof data === "object" && "detail" in data
        ? (data as { detail: unknown }).detail
        : data) ?? res.statusText;
    throw new ApiError(res.status, detail, typeof detail === "string" ? detail : `HTTP ${res.status}`);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const http = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
  del: <T = void>(p: string) => request<T>(p, { method: "DELETE" }),
  postForm: <T>(p: string, form: Record<string, string>) => {
    const body = new URLSearchParams(form).toString();
    return request<T>(p, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  },
};

// ----- types matching backend schemas -----

export type UserRole = "super_admin" | "firm_admin";

export interface UserOut {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  firm_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface FirmOut {
  id: string;
  name: string;
  brand_color: string;
  logo_url: string | null;
  support_email_target: string;
  footer_address: string | null;
  footer_phone: string | null;
  footer_email: string | null;
  footer_website: string | null;
  discord_enabled: boolean;
  discord_webhook_url: string | null;
  created_at: string;
}

export interface ProductModelOut {
  id: string; // firm_product.id
  firm_id: string;
  catalog_id: string;
  name: string;
  sku: string | null;
  description: string | null;
  image_url: string | null;
  category: string;
  manual_url: string | null;
  quick_guide_url: string | null;
  warranty_url: string | null;
  warranty_text: string | null;
  /** Per-firm overrides. NULL value = inherits catalog default. */
  overrides: {
    description: string | null;
    manual_url: string | null;
    quick_guide_url: string | null;
    warranty_url: string | null;
    warranty_text: string | null;
  };
  created_at: string;
}

export interface CatalogOut {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  image_url: string | null;
  background_url: string | null;
  background_kind: "image" | "video";
  description: string | null;
  manual_url: string | null;
  quick_guide_url: string | null;
  warranty_url: string | null;
  warranty_text: string | null;
  created_at: string;
}

export interface CatalogWriteIn {
  name: string;
  sku?: string | null;
  category?: string;
  image_url?: string | null;
  background_url?: string | null;
  background_kind?: "image" | "video";
  description?: string | null;
  manual_url?: string | null;
  quick_guide_url?: string | null;
  warranty_url?: string | null;
  warranty_text?: string | null;
}

export interface FirmProductOverrideIn {
  description?: string | null;
  manual_url?: string | null;
  quick_guide_url?: string | null;
  warranty_url?: string | null;
  warranty_text?: string | null;
}

export interface AssetOut {
  id: string;
  firm_id: string;
  firm_product_id: string;
  serial_number: string;
  location: string | null;
  discord_webhook_url: string | null;
  created_at: string;
}

export type TicketStatus = "pending" | "sent" | "failed";

export interface TicketOut {
  id: string;
  asset_id: string;
  customer_name: string | null;
  customer_email: string;
  customer_phone: string | null;
  contact_preference: "email" | "phone";
  message: string;
  attachment_url: string | null;
  status: TicketStatus;
  last_error: string | null;
  resend_message_id: string | null;
  created_at: string;
  sent_at: string | null;
}

// ----- API surface -----

export const api = {
  login: (email: string, password: string) =>
    http.postForm<{ access_token: string; token_type: string }>("/auth/login", {
      username: email,
      password,
    }),
  me: () => http.get<UserOut>("/auth/me"),

  // firms
  listFirms: () => http.get<FirmOut[]>("/admin/firms"),
  createFirm: (b: Partial<FirmOut> & { name: string; support_email_target: string }) =>
    http.post<FirmOut>("/admin/firms", b),
  getFirm: (id: string) => http.get<FirmOut>(`/admin/firms/${id}`),
  updateFirm: (id: string, b: Partial<FirmOut>) => http.patch<FirmOut>(`/admin/firms/${id}`, b),
  deleteFirm: (id: string) => http.del(`/admin/firms/${id}`),

  // catalog (super-admin only)
  listCatalog: () => http.get<CatalogOut[]>("/admin/catalog"),
  createCatalog: (b: CatalogWriteIn) => http.post<CatalogOut>("/admin/catalog", b),
  updateCatalog: (id: string, b: Partial<CatalogWriteIn>) =>
    http.patch<CatalogOut>(`/admin/catalog/${id}`, b),
  deleteCatalog: (id: string) => http.del(`/admin/catalog/${id}`),

  // firm products (subscribe + override)
  listProducts: (firmId: string) =>
    http.get<ProductModelOut[]>(`/admin/firms/${firmId}/products`),
  linkProduct: (firmId: string, catalogId: string) =>
    http.post<ProductModelOut>(`/admin/firms/${firmId}/products`, {
      catalog_id: catalogId,
    }),
  updateProductOverrides: (firmId: string, id: string, b: FirmProductOverrideIn) =>
    http.patch<ProductModelOut>(`/admin/firms/${firmId}/products/${id}`, b),
  unlinkProduct: (firmId: string, id: string) =>
    http.del(`/admin/firms/${firmId}/products/${id}`),

  // assets
  listAssets: (firmId: string) => http.get<AssetOut[]>(`/admin/firms/${firmId}/assets`),
  createAsset: (
    firmId: string,
    b: { firm_product_id: string; serial_number: string; location?: string | null },
  ) => http.post<AssetOut>(`/admin/firms/${firmId}/assets`, b),
  updateAsset: (firmId: string, id: string, b: Partial<AssetOut>) =>
    http.patch<AssetOut>(`/admin/firms/${firmId}/assets/${id}`, b),
  deleteAsset: (firmId: string, id: string) =>
    http.del(`/admin/firms/${firmId}/assets/${id}`),

  // tickets
  listFirmTickets: (firmId: string, statusFilter?: TicketStatus) =>
    http.get<TicketOut[]>(
      `/admin/firms/${firmId}/tickets${statusFilter ? `?status=${statusFilter}` : ""}`,
    ),
  listAllTickets: (statusFilter?: TicketStatus) =>
    http.get<TicketOut[]>(`/admin/tickets${statusFilter ? `?status=${statusFilter}` : ""}`),
  retryTicket: (id: string) => http.post<TicketOut>(`/admin/tickets/${id}/retry`),

  // users
  listUsers: () => http.get<UserOut[]>("/admin/users"),
  createUser: (b: {
    email: string;
    password: string;
    full_name?: string;
    role: UserRole;
    firm_id?: string | null;
  }) => http.post<UserOut>("/admin/users", b),
  updateUser: (id: string, b: { full_name?: string; password?: string; is_active?: boolean }) =>
    http.patch<UserOut>(`/admin/users/${id}`, b),
  deleteUser: (id: string) => http.del(`/admin/users/${id}`),

  // test email
  sendTestEmail: (assetId: string, b: { recipient_email?: string; note?: string }) =>
    http.post<{ id: string; status: string }>(`/admin/assets/${assetId}/test-email`, b),

  // accessories
  listAccessories: (firmId: string) =>
    http.get<AccessoryOut[]>(`/admin/firms/${firmId}/accessories`),
  createAccessory: (firmId: string, b: AccessoryWriteIn) =>
    http.post<AccessoryOut>(`/admin/firms/${firmId}/accessories`, b),
  updateAccessory: (firmId: string, id: string, b: Partial<AccessoryWriteIn>) =>
    http.patch<AccessoryOut>(`/admin/firms/${firmId}/accessories/${id}`, b),
  deleteAccessory: (firmId: string, id: string) =>
    http.del(`/admin/firms/${firmId}/accessories/${id}`),
  listAccessoryOrders: (firmId: string) =>
    http.get<AccessoryOrderOut[]>(`/admin/firms/${firmId}/accessory-orders`),
};

export interface AccessoryOut {
  id: string;
  firm_id: string;
  firm_product_id: string | null;
  name: string;
  sku: string | null;
  description: string | null;
  image_url: string | null;
  price_label: string | null;
  unit: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface AccessoryWriteIn {
  name: string;
  sku?: string | null;
  description?: string | null;
  image_url?: string | null;
  price_label?: string | null;
  unit?: string | null;
  firm_product_id?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export interface AccessoryOrderOut {
  id: string;
  asset_id: string;
  accessory_id: string;
  quantity: number;
  customer_name: string | null;
  customer_email: string;
  customer_phone: string | null;
  note: string | null;
  status: string;
  last_error: string | null;
  resend_message_id: string | null;
  created_at: string;
  sent_at: string | null;
}
