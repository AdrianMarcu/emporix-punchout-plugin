import { useState } from 'react';
import Credentials from './screens/Credentials';
import BuyerMappings from './screens/BuyerMappings';
import ProtocolSettings from './screens/ProtocolSettings';
import ConnectionTest from './screens/ConnectionTest';

const TABS = ['Credentials', 'Buyer Mappings', 'Protocol Settings', 'Connection Test'] as const;
type Tab = typeof TABS[number];

export default function App() {
  const [tab, setTab] = useState<Tab>('Credentials');
  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Emporix Punchout Plugin</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid #ddd' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '8px 16px', border: 'none', background: tab === t ? '#0066cc' : 'transparent',
              color: tab === t ? '#fff' : '#333', cursor: 'pointer', borderRadius: '4px 4px 0 0' }}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Credentials' && <Credentials />}
      {tab === 'Buyer Mappings' && <BuyerMappings />}
      {tab === 'Protocol Settings' && <ProtocolSettings />}
      {tab === 'Connection Test' && <ConnectionTest />}
    </div>
  );
}
