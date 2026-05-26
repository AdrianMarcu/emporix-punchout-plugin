import type { CSSProperties } from 'react';

export const sectionTitle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#999',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 10,
};

export const fieldLabel: CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: '#555',
  marginBottom: 3,
};

export const fieldHint: CSSProperties = {
  fontSize: 10,
  color: '#aaa',
  fontWeight: 400,
};

export const input: CSSProperties = {
  display: 'block',
  width: '100%',
  height: 28,
  padding: '0 8px',
  border: '1px solid #d4d4d4',
  borderRadius: 3,
  fontSize: 12,
  color: '#333',
  background: '#fff',
  boxSizing: 'border-box',
};

export const selectStyle: CSSProperties = {
  ...input,
  cursor: 'pointer',
};

export const btnPrimary: CSSProperties = {
  height: 28,
  padding: '0 12px',
  background: '#0066cc',
  color: '#fff',
  border: 'none',
  borderRadius: 3,
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
};

export const btnSecondary: CSSProperties = {
  height: 28,
  padding: '0 10px',
  background: '#fff',
  color: '#333',
  border: '1px solid #d4d4d4',
  borderRadius: 3,
  fontSize: 12,
  cursor: 'pointer',
};

export const twoCol: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 12,
};
