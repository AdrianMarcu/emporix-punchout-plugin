import ReactDOM from 'react-dom/client';
import App from './App';
import './global.css';
import { setToken } from './api';

// In standalone dev mode, read token from URL hash for convenience
const hash = window.location.hash.slice(1);
const params = new URLSearchParams(hash);
const token = params.get('token') ?? '';
setToken(token);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
);
