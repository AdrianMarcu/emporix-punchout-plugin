let jwtToken = '';

export function setToken(token: string) {
  jwtToken = token;
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const base = (import.meta.env.VITE_PLUGIN_HOST as string) ?? '';
  const res = await fetch(`${base}/admin${path}`, {
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
