import React, { useEffect, useState } from 'react';
import { api } from '../api';

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
      setStatus('Saved.');
    } catch { setStatus('Error saving.'); }
  };

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
        <thead><tr><th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #ddd' }}>Buyer Org ID</th><th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #ddd' }}>Customer Group</th></tr></thead>
        <tbody>{mappings.map(m => (
          <tr key={m.buyerOrgId}><td style={{ padding: 8 }}>{m.buyerOrgId}</td><td style={{ padding: 8 }}>{groups.find(g => g.id === m.customerGroupId)?.name ?? m.customerGroupId}</td></tr>
        ))}</tbody>
      </table>
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <label>Buyer Org ID<br /><input value={newBuyerOrgId} onChange={e => setNewBuyerOrgId(e.target.value)} style={{ padding: 8 }} /></label>
        <label>Customer Group<br />
          <select value={newGroupId} onChange={e => setNewGroupId(e.target.value)} style={{ padding: 8 }}>
            <option value="">Select…</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <button type="submit" style={{ padding: '8px 16px', background: '#0066cc', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Add</button>
      </form>
      {status && <p>{status}</p>}
    </div>
  );
}
