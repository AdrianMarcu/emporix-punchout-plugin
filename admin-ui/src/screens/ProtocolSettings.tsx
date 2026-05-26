import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { sectionTitle, fieldLabel, fieldHint, selectStyle, btnPrimary, twoCol } from '../styles';

interface Settings { cxmlEnabled: boolean; ociEnabled: boolean; operationAllowed: string; ociOkCode: string; }

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!on)}
      style={{
        width: 32, height: 18, borderRadius: 9, cursor: 'pointer', flexShrink: 0,
        background: on ? '#0066cc' : '#d0d0d0',
        position: 'relative', transition: 'background .15s',
      }}
    >
      <div style={{
        position: 'absolute', width: 14, height: 14, borderRadius: '50%',
        background: '#fff', top: 2,
        left: on ? 16 : 2,
        transition: 'left .15s',
      }} />
    </div>
  );
}

export default function ProtocolSettings() {
  const [s, setS] = useState<Settings>({ cxmlEnabled: true, ociEnabled: false, operationAllowed: 'edit', ociOkCode: 'ADDFROMCATALOG' });
  const [status, setStatus] = useState('');

  useEffect(() => {
    api.getConfig().then((cfg: unknown) => {
      const c = cfg as Settings;
      setS({ cxmlEnabled: c.cxmlEnabled ?? true, ociEnabled: c.ociEnabled ?? false, operationAllowed: c.operationAllowed ?? 'edit', ociOkCode: c.ociOkCode ?? 'ADDFROMCATALOG' });
    }).catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('Saving…');
    try { await api.saveConfig(s); setStatus('Saved.'); }
    catch { setStatus('Error.'); }
  };

  return (
    <form onSubmit={handleSave}>
      <div style={sectionTitle}>Protocols</div>

      {/* Toggle rows */}
      {[
        { key: 'cxmlEnabled' as const, label: 'cXML 1.2', sub: 'SAP Ariba, Coupa, Jaggaer' },
        { key: 'ociEnabled'  as const, label: 'OCI 4.0',  sub: 'SAP SRM / SUS' },
      ].map(({ key, label, sub }) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f5f5f5' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: '#333' }}>{label}</div>
            <div style={{ fontSize: 11, color: '#999' }}>{sub}</div>
          </div>
          <Toggle on={s[key]} onChange={v => setS({ ...s, [key]: v })} />
        </div>
      ))}

      <div style={{ ...sectionTitle, marginTop: 16 }}>Options</div>
      <div style={twoCol}>
        <label style={{ display: 'block' }}>
          <span style={fieldLabel}>
            cXML operationAllowed <span style={fieldHint}>— sent in PunchOutSetupResponse</span>
          </span>
          <select value={s.operationAllowed} onChange={e => setS({ ...s, operationAllowed: e.target.value })} style={selectStyle}>
            {['create', 'edit', 'inspect'].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label style={{ display: 'block' }}>
          <span style={fieldLabel}>
            OCI ~OkCode <span style={fieldHint}>— SAP field mapped on cart return</span>
          </span>
          <select value={s.ociOkCode} onChange={e => setS({ ...s, ociOkCode: e.target.value })} style={selectStyle}>
            <option value="ADDFROMCATALOG">ADDFROMCATALOG</option>
            <option value="SOURCING">SOURCING</option>
          </select>
        </label>
      </div>

      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="submit" style={btnPrimary}>Save</button>
        {status && <span style={{ fontSize: 11, color: status.startsWith('Error') ? '#dc2626' : '#16a34a' }}>{status}</span>}
      </div>
    </form>
  );
}
