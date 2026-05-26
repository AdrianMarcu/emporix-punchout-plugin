import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { sectionTitle, fieldLabel, input, selectStyle, btnPrimary } from '../styles';

interface Mapping { buyerOrgId: string; customerGroupId: string; }
interface CustomerGroup { id: string; name: string; }

export default function BuyerMappings() {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [newBuyerOrgId, setNewBuyerOrgId] = useState('');
  const [newGroupId, setNewGroupId] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    Promise.all([api.getBuyers(), api.getCustomerGroups()]).then(([b, g]) => {
      setMappings(b as Mapping[]);
      setGroups(g as CustomerGroup[]);
    }).catch(() => {});
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('Saving…');
    try {
      const updated = await api.saveBuyer({ buyerOrgId: newBuyerOrgId, customerGroupId: newGroupId });
      setMappings(updated as Mapping[]);
      setNewBuyerOrgId('');
      setNewGroupId('');
      setStatus('');
    } catch { setStatus('Error saving.'); }
  };

  const groupName = (id: string) => groups.find(g => g.id === id)?.name ?? id;

  return (
    <div>
      <div style={sectionTitle}>Buyer → Customer Group Mappings</div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ fontSize: 11, fontWeight: 600, color: '#888', textAlign: 'left', padding: '5px 8px', borderBottom: '1px solid #e8e8e8' }}>Buyer Org ID</th>
            <th style={{ fontSize: 11, fontWeight: 600, color: '#888', textAlign: 'left', padding: '5px 8px', borderBottom: '1px solid #e8e8e8' }}>Customer Group</th>
          </tr>
        </thead>
        <tbody>
          {mappings.length === 0 && (
            <tr>
              <td colSpan={2} style={{ padding: '10px 8px', color: '#aaa', fontSize: 12, fontStyle: 'italic' }}>
                No mappings yet — add one below.
              </td>
            </tr>
          )}
          {mappings.map(m => (
            <tr key={m.buyerOrgId}>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid #f0f0f0', color: '#333' }}>{m.buyerOrgId}</td>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ display: 'inline-block', padding: '1px 7px', background: '#e8f0fe', color: '#0066cc', borderRadius: 10, fontSize: 11 }}>
                  {groupName(m.customerGroupId)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Inline add-row */}
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f0f0' }}>
        <label style={{ display: 'block', flex: '0 0 200px' }}>
          <span style={fieldLabel}>Buyer Org ID</span>
          <input
            value={newBuyerOrgId}
            onChange={e => setNewBuyerOrgId(e.target.value)}
            placeholder="org-identifier"
            style={input}
          />
        </label>
        <label style={{ display: 'block', flex: '0 0 200px' }}>
          <span style={fieldLabel}>Customer Group</span>
          <select value={newGroupId} onChange={e => setNewGroupId(e.target.value)} style={selectStyle}>
            <option value="">Select…</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <button type="submit" style={{ ...btnPrimary, marginBottom: 1 }}>Add</button>
        {status && <span style={{ fontSize: 11, color: '#dc2626' }}>{status}</span>}
      </form>
    </div>
  );
}
