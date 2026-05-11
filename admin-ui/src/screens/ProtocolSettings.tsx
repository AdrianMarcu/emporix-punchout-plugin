import React, { useEffect, useState } from 'react';
import { api } from '../api';

interface Settings { cxmlEnabled: boolean; ociEnabled: boolean; operationAllowed: string; ociOkCode: string; }

export default function ProtocolSettings() {
  const [settings, setSettings] = useState<Settings>({ cxmlEnabled: true, ociEnabled: true, operationAllowed: 'edit', ociOkCode: 'ADDFROMCATALOG' });
  const [status, setStatus] = useState('');

  useEffect(() => {
    api.getConfig().then((cfg: unknown) => {
      const c = cfg as Settings;
      setSettings({ cxmlEnabled: c.cxmlEnabled ?? true, ociEnabled: c.ociEnabled ?? true, operationAllowed: c.operationAllowed ?? 'edit', ociOkCode: c.ociOkCode ?? 'ADDFROMCATALOG' });
    }).catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('Saving…');
    try { await api.saveConfig(settings); setStatus('Saved.'); } catch { setStatus('Error.'); }
  };

  return (
    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <label><input type="checkbox" checked={settings.cxmlEnabled} onChange={e => setSettings({ ...settings, cxmlEnabled: e.target.checked })} /> Enable cXML</label>
      <label><input type="checkbox" checked={settings.ociEnabled} onChange={e => setSettings({ ...settings, ociEnabled: e.target.checked })} /> Enable OCI</label>
      <label>cXML operationAllowed<br />
        <select value={settings.operationAllowed} onChange={e => setSettings({ ...settings, operationAllowed: e.target.value })} style={{ padding: 8 }}>
          {['create', 'edit', 'inspect'].map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </label>
      <label>OCI ~OkCode<br />
        <select value={settings.ociOkCode} onChange={e => setSettings({ ...settings, ociOkCode: e.target.value })} style={{ padding: 8 }}>
          <option value="ADDFROMCATALOG">ADDFROMCATALOG</option>
          <option value="SOURCING">SOURCING</option>
        </select>
      </label>
      <button type="submit" style={{ padding: '10px 20px', background: '#0066cc', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Save</button>
      {status && <p>{status}</p>}
    </form>
  );
}
