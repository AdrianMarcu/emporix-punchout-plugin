import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { sectionTitle, fieldLabel, fieldHint, input, btnPrimary, twoCol } from '../styles';

interface CredentialsForm {
  sharedSecret: string;
  clientId: string;
  clientSecret: string;
  storefrontBaseUrl: string;
  storefrontClientId: string;
  punchoutUserEmail: string;
  punchoutUserPassword: string;
}

export default function Credentials() {
  const [form, setForm] = useState<CredentialsForm>({ sharedSecret: '', clientId: '', clientSecret: '', storefrontBaseUrl: '', storefrontClientId: '', punchoutUserEmail: '', punchoutUserPassword: '' });
  const [status, setStatus] = useState('');

  useEffect(() => {
    api.getConfig().then((cfg: unknown) => {
      const c = cfg as Record<string, unknown>;
      const pc = c.punchoutCustomer as Record<string, string> | undefined;
      setForm({
        sharedSecret: '',
        clientId: String((c.serviceAccount as Record<string, string>)?.clientId ?? ''),
        clientSecret: '',
        storefrontBaseUrl: String(c.storefrontBaseUrl ?? ''),
        storefrontClientId: String(c.storefrontClientId ?? ''),
        punchoutUserEmail: String(pc?.email ?? ''),
        punchoutUserPassword: '',
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
        storefrontClientId: form.storefrontClientId || undefined,
        punchoutCustomer: form.punchoutUserEmail
          ? { email: form.punchoutUserEmail, password: form.punchoutUserPassword || undefined }
          : undefined,
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
        <label style={{ display: 'block' }}>
          <span style={fieldLabel}>
            Storefront Client ID <span style={fieldHint}>— REACT_APP_CLIENT_ID of the b2b-showcase</span>
          </span>
          <input
            type="text"
            value={form.storefrontClientId}
            onChange={e => setForm({ ...form, storefrontClientId: e.target.value })}
            placeholder="storefront app client_id…"
            style={input}
          />
        </label>
      </div>

      <div style={{ ...sectionTitle, marginTop: 16 }}>Punchout Customer Account</div>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
        A dedicated Emporix customer used during punchout sessions so the storefront can load correctly.
        Set via env vars <code>PUNCHOUT_USER_EMAIL</code> / <code>PUNCHOUT_USER_PASSWORD</code> or here.
      </div>
      <div style={twoCol}>
        <label style={{ display: 'block' }}>
          <span style={fieldLabel}>Email</span>
          <input
            type="email"
            value={form.punchoutUserEmail}
            onChange={e => setForm({ ...form, punchoutUserEmail: e.target.value })}
            placeholder="punchout@yourcompany.com"
            style={input}
          />
        </label>
        <label style={{ display: 'block' }}>
          <span style={fieldLabel}>Password <span style={fieldHint}>— leave blank to keep existing</span></span>
          <input
            type="password"
            value={form.punchoutUserPassword}
            onChange={e => setForm({ ...form, punchoutUserPassword: e.target.value })}
            placeholder="Enter password…"
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
