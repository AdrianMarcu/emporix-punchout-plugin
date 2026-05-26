import { useState } from 'react';
import { sectionTitle, btnPrimary } from '../styles';

const SAMPLE_CXML = `<?xml version="1.0" encoding="UTF-8"?>
<cXML payloadID="test-001" timestamp="2026-05-11T10:00:00Z">
  <Header>
    <From><Credential domain="NetworkId"><Identity>test-buyer-org</Identity></Credential></From>
    <To><Credential domain="NetworkId"><Identity>supplier</Identity></Credential></To>
    <Sender>
      <Credential domain="NetworkId">
        <Identity>test-buyer-org</Identity>
        <SharedSecret>YOUR_SHARED_SECRET</SharedSecret>
      </Credential>
      <UserAgent>ConnectionTest</UserAgent>
    </Sender>
  </Header>
  <Request deploymentMode="test">
    <PunchOutSetupRequest operation="create">
      <BuyerCookie>test-cookie-001</BuyerCookie>
      <BrowserFormPost><URL>https://example.com/return</URL></BrowserFormPost>
    </PunchOutSetupRequest>
  </Request>
</cXML>`;

export default function ConnectionTest() {
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const runTest = async () => {
    setLoading(true);
    setResult('');
    try {
      const pluginHost = (import.meta.env.VITE_PLUGIN_HOST as string) ?? '';
      const res = await fetch(`${pluginHost}/punchout/cxml/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body: SAMPLE_CXML,
      });
      const text = await res.text();
      setResult(`HTTP ${res.status}\n\n${text}`);
    } catch (err) {
      setResult(`Error: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const isOk = result.startsWith('HTTP 200');

  return (
    <div>
      <div style={sectionTitle}>cXML Handshake Test</div>
      <p style={{ fontSize: 12, color: '#555', marginBottom: 12, lineHeight: 1.5 }}>
        Sends a simulated <code style={{ background: '#f5f5f5', padding: '1px 4px', borderRadius: 2, fontSize: 11 }}>PunchOutSetupRequest</code> to verify credentials and config.
        Replace <code style={{ background: '#fff0f0', color: '#c00', padding: '1px 4px', borderRadius: 2, fontSize: 11 }}>YOUR_SHARED_SECRET</code> in the payload before running.
      </p>

      <div style={{ marginBottom: 12 }}>
        <button onClick={runTest} disabled={loading} style={{ ...btnPrimary, opacity: loading ? .6 : 1 }}>
          {loading ? 'Testing…' : 'Run Test'}
        </button>
      </div>

      {result && (
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 11, marginBottom: 8,
            color: isOk ? '#16a34a' : '#dc2626',
            background: isOk ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${isOk ? '#bbf7d0' : '#fecaca'}`,
            borderRadius: 3, padding: '3px 8px',
          }}>
            {isOk ? '✓' : '✗'} {isOk ? 'Success' : 'Failed'}
          </div>
          <pre style={{
            background: '#f7f7f7', border: '1px solid #e8e8e8', borderRadius: 3,
            padding: '10px 12px', fontSize: 11,
            fontFamily: "'SF Mono', Menlo, monospace",
            lineHeight: 1.6, overflow: 'auto', maxHeight: 240,
            whiteSpace: 'pre-wrap', color: '#444',
          }}>
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}
