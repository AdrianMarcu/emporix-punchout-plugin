let jwtToken = '';

// In module federation context the chunks are served from the plugin host,
// so import.meta.url gives the correct origin without needing a baked-in env var.
const API_BASE = (() => {
  if (import.meta.env.VITE_PLUGIN_HOST) return import.meta.env.VITE_PLUGIN_HOST as string;
  try { return new URL(import.meta.url).origin; } catch { return ''; }
})();

export function setToken(token: string) {
  jwtToken = token;
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/admin${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwtToken}`, ...opts?.headers },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  getConfig: () => apiFetch('/config'),
  saveConfig: (body: unknown) => apiFetch('/config', { method: 'POST', body: JSON.stringify(body) }),
  getBuyers: () => apiFetch('/buyers'),
  saveBuyer: (body: unknown) => apiFetch('/buyers', { method: 'POST', body: JSON.stringify(body) }),
  getCustomerGroups: () => apiFetch('/customer-groups'),
};
