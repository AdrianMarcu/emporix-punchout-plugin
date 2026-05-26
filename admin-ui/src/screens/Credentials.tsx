import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { sectionTitle, fieldLabel, fieldHint, input, btnPrimary, twoCol } from '../styles';

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
      setStatus('Error saving.');
    }
  };

  return (
    <form onSubmit={handleSave}>
      <div style={sectionTitle}>Punchout Credentials</div>
      <div style={twoCol}>
        <label style={{ display: 'block' }}>
          <span style={fieldLabel}>
            Shared Secret <span style={fieldHint}>— leave blank to keep existing</span>
          </span>
          <input
            type="password"
            value={form.sharedSecret}
            onChange={e => setForm({ ...form, sharedSecret: e.target.value })}
            placeholder="Enter new secret…"
            style={input}
          />
        </label>
        <label style={{ display: 'block' }}>
          <span style={fieldLabel}>Storefront Base URL</span>
          <input
            type="text"
            value={form.storefrontBaseUrl}
            onChange={e => setForm({ ...form, storefrontBaseUrl: e.target.value })}
            placeholder="https://your-store.com"
            style={input}
          />
        </label>
      </div>

      <div style={{ ...sectionTitle, marginTop: 16 }}>Emporix Service Account</div>
      <div style={twoCol}>
        <label style={{ display: 'block' }}>
          <span style={fieldLabel}>Client ID</span>
          <input
            type="text"
            value={form.clientId}
            onChange={e => setForm({ ...form, clientId: e.target.value })}
            style={input}
          />
        </label>
        <label style={{ display: 'block' }}>
          <span style={fieldLabel}>Client Secret <span style={fieldHint}>— leave blank to keep existing</span></span>
          <input
            type="password"
            value={form.clientSecret}
            onChange={e => setForm({ ...form, clientSecret: e.target.value })}
            placeholder="Enter secret…"
            style={input}
          />
        </label>
      </div>

      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="submit" style={btnPrimary}>Save</button>
        {status && (
          <span style={{ fontSize: 11, color: status.startsWith('Error') ? '#dc2626' : '#16a34a' }}>
            {status}
          </span>
        )}
      </div>
    </form>
  );
}
