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
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", maxWidth: 760, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e', marginBottom: 14 }}>Emporix Punchout Plugin</div>

      {/* Tab bar — underline indicator style matching Emporix dashboard */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e0e0e0', marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: tab === t ? 500 : 400,
            color: tab === t ? '#0066cc' : '#666',
            background: 'none',
            border: 'none',
            borderBottom: tab === t ? '2px solid #0066cc' : '2px solid transparent',
            marginBottom: -1,
            cursor: 'pointer',
          }}>
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
