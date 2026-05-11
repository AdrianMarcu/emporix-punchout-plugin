import React, { useEffect, useState } from 'react';
import { api } from '../api';

interface CredentialsForm {
  sharedSecret: string;
  clientId: string;
  clientSecret: string;
  storefrontBaseUrl: string;
}

export default function Credentials() {
  const [form, setForm] = useState<CredentialsForm>({ sharedSecret: '', clientId: '', clientSecret: '', storefrontBaseUrl: '' });
  const [status, setStatus] = useState('');

  useEffect(() => {
    api.getConfig().then((cfg: unknown) => {
      const c = cfg as Record<string, unknown>;
      setForm({
        sharedSecret: '',
        clientId: String((c.serviceAccount as Record<string, string>)?.clientId ?? ''),
        clientSecret: '',
        storefrontBaseUrl: String(c.storefrontBaseUrl ?? ''),
      });
    }).catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('Saving…');
    try {
      await api.saveConfig({
        sharedSecret: form.sharedSecret || undefined,
        serviceAccount: { clientId: form.clientId, clientSecret: form.clientSecret },
        storefrontBaseUrl: form.storefrontBaseUrl,
      });
      setStatus('Saved.');
    } catch {
      setStatus('Error saving. Check console.');
    }
  };

  return (
    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label>Shared Secret (leave blank to keep existing)<br />
        <input type="password" value={form.sharedSecret} onChange={e => setForm({ ...form, sharedSecret: e.target.value })} style={{ width: '100%', padding: 8 }} />
      </label>
      <label>Emporix Service Account Client ID<br />
        <input value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })} style={{ width: '100%', padding: 8 }} />
      </label>
      <label>Emporix Service Account Client Secret<br />
        <input type="password" value={form.clientSecret} onChange={e => setForm({ ...form, clientSecret: e.target.value })} style={{ width: '100%', padding: 8 }} />
      </label>
      <label>Storefront Base URL<br />
        <input value={form.storefrontBaseUrl} onChange={e => setForm({ ...form, storefrontBaseUrl: e.target.value })} style={{ width: '100%', padding: 8 }} />
      </label>
      <button type="submit" style={{ padding: '10px 20px', background: '#0066cc', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Save</button>
      {status && <p>{status}</p>}
    </form>
  );
}
