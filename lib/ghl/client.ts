// Thin, typed wrapper over the GoHighLevel API v2 (LeadConnector). Auth is a
// Private Integration token in env. All calls are guarded so a missing token or
// a transient error never throws into a user action.

const BASE = process.env.GHL_API_BASE || "https://services.leadconnectorhq.com";
const VERSION = process.env.GHL_API_VERSION || "2021-07-28";

export function ghlConfigured(): boolean {
  return Boolean(process.env.GHL_API_TOKEN);
}

async function ghlFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = process.env.GHL_API_TOKEN;
  if (!token) throw new Error("GHL_API_TOKEN is not set");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: VERSION,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export type GhlContact = {
  id: string;
  contactName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source?: string;
  dateAdded?: string;
  tags?: string[];
};

export async function listContacts(locationId: string, limit = 100): Promise<GhlContact[]> {
  const data = await ghlFetch<{ contacts?: GhlContact[] }>(
    `/contacts/?locationId=${encodeURIComponent(locationId)}&limit=${limit}`,
  );
  return data.contacts ?? [];
}

export async function upsertContact(
  locationId: string,
  contact: { email?: string; phone?: string; firstName?: string; lastName?: string; tags?: string[] },
): Promise<GhlContact> {
  const data = await ghlFetch<{ contact: GhlContact }>(`/contacts/upsert`, {
    method: "POST",
    body: JSON.stringify({ locationId, ...contact }),
  });
  return data.contact;
}

export async function addContactTags(contactId: string, tags: string[]): Promise<void> {
  await ghlFetch(`/contacts/${contactId}/tags`, {
    method: "POST",
    body: JSON.stringify({ tags }),
  });
}

export type GhlInvoice = {
  _id?: string;
  id?: string;
  total?: number;
  amountPaid?: number;
  status?: string;
  updatedAt?: string;
};

export async function listInvoices(locationId: string, limit = 100): Promise<GhlInvoice[]> {
  // Best-effort: the invoices surface varies by account. Guarded by the caller.
  const data = await ghlFetch<{ invoices?: GhlInvoice[] }>(
    `/invoices/?altId=${encodeURIComponent(locationId)}&altType=location&limit=${limit}`,
  );
  return data.invoices ?? [];
}
