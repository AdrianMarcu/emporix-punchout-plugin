import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { setToken } from './api';

const hash = window.location.hash.slice(1);
const params = new URLSearchParams(hash);
const token = params.get('token') ?? '';
setToken(token);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
);
