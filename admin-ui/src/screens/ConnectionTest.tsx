import { useState } from 'react';

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
      const res = await fetch('/punchout/cxml/setup', {
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

  return (
    <div>
      <p style={{ marginBottom: 16 }}>Sends a simulated cXML PunchOutSetupRequest to verify credentials and config. Replace YOUR_SHARED_SECRET in the payload with your configured shared secret before testing.</p>
      <button onClick={runTest} disabled={loading}
        style={{ padding: '10px 20px', background: '#0066cc', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
        {loading ? 'Testing…' : 'Run Connection Test'}
      </button>
      {result && <pre style={{ marginTop: 16, padding: 16, background: '#f5f5f5', borderRadius: 4, overflow: 'auto', fontSize: 13 }}>{result}</pre>}
    </div>
  );
}
