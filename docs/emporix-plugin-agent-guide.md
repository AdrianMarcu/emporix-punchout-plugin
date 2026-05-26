# Emporix Plugin Development Guide
*For AI agents building admin UI plugins for the Emporix Management Dashboard*

---

## Overview

Emporix plugins are micro-frontends loaded into the Emporix Management Dashboard (`admin.emporix.io`) via **Module Federation**. The host dashboard is built on **webpack + React**, and your plugin is a **Vite + React** remote. This asymmetry causes several non-obvious problems that have already been solved and documented here — do not re-discover them.

**Plugin anatomy:**
- `admin-ui/` — Vite React app that builds the admin panel UI
- `src/` — Node.js/Express backend (handles punchout logic, Emporix API calls)
- `src/admin-ui-dist/` — build output from `admin-ui/`, served statically by the backend
- Deployed as a single service on **Railway** (static files + API on one origin)

---

## Module Federation Setup

### 1. Vite Config — Non-Negotiable Settings

```ts
// admin-ui/vite.config.ts
export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'extension',           // Must match what Emporix registers as the scope name
      filename: 'remoteEntry.js',
      exposes: { './RemoteComponent': './src/RemoteComponent' },
      shared: {},                  // ← CRITICAL: empty. See "Dual React" section below.
    }),
    federationFixes('extension'),  // ← Custom post-build plugin (see below)
  ],
  build: {
    outDir: '../src/admin-ui-dist',
    modulePreload: false,
    target: 'esnext',
    minify: false,          // Keep readable for debugging; enable only after proven stable
    cssCodeSplit: false,
  },
  base: './',               // ← CRITICAL: relative base, not '/'. See "Path Fix" below.
  server: {
    cors: { origin: 'https://admin.emporix.io', credentials: true },
  },
});
```

### 2. The Three Required Fixes (federationFixes plugin)

These three patches must be applied as a post-build Vite plugin. All three are required.

```ts
function federationFixes(scopeName: string): Plugin {
  return {
    name: 'federation-fixes',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (fileName.includes('remoteEntry') && chunk.type === 'chunk') {

          // Fix 1: Double assets/ path
          // remoteEntry.js lives in assets/. With base:'./' the federation plugin
          // generates import('./assets/chunk.js'), but that resolves to
          // assets/assets/chunk.js → 404. Strip the extra prefix.
          chunk.code = chunk.code.replace(
            /__federation_import\((['"])\.\/assets\//g,
            '__federation_import($1./'
          );

          // Fix 2: Factory returns module.default instead of module object
          // Emporix's React.lazy does: factory().default to get the component.
          // Vite federation's heuristic sometimes returns () => module.default
          // directly, so factory().default = undefined. Force full module object.
          chunk.code = chunk.code.replace(
            /Object\.keys\(module\)\.every\(item => exportSet\.has\(item\)\) \? \(\) => module\.default : \(\) => module/g,
            '() => module'
          );

          // Fix 3: window[scopeName] registration
          // Emporix may access the container via window['extension'].
          // Ensure both the module-level and window access patterns work.
          chunk.code += `\nif (typeof window !== 'undefined') window[${JSON.stringify(scopeName)}] = { get, init };\n`;
        }
      }
    },
  };
}
```

---

## The Dual-React Problem (Most Common Crash)

**Symptom:** Plugin loads and renders, then crashes with:
> `Cannot read properties of null (reading 'useState')`

**Cause:** Setting `shared: ['react', 'react-dom']` tells the federation plugin to use Emporix's webpack-bundled React at runtime (via `importShared`). But your App.tsx hooks call *your bundled* React's dispatcher. Two React instances → hooks hit a null dispatcher → crash.

**Solution: `shared: {}` + independent `createRoot`**

```tsx
// admin-ui/src/RemoteComponent.tsx
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// WeakMap: roots are GC'd when the container element leaves the DOM
const roots = new WeakMap<HTMLElement, ReturnType<typeof createRoot>>();

export default function RemoteComponent({
  appState = { tenant: '', token: '', language: 'en' },
}) {
  setToken(appState.token);

  // Return a plain createElement (React element = plain object) so Emporix's
  // React renders the outer <div> fine. Then bootstrap OUR own React root
  // inside it via ref — completely isolated from Emporix's dispatcher.
  return createElement('div', {
    'data-punchout-plugin': 'root',
    style: { width: '100%', minHeight: '100px' },
    ref: (el: HTMLElement | null) => {
      if (!el) return;
      if (!roots.has(el)) roots.set(el, createRoot(el));
      roots.get(el)!.render(createElement(App, null));
    },
  });
}
```

**Why this works:** `createElement` returns a plain JS object (keyed by `Symbol.for('react.element')`, which is the same symbol in all React instances). Emporix's React renders the wrapper `<div>` into the DOM. The `ref` callback fires with the live DOM node. From that point we call our own bundled `createRoot` — every hook call is routed to our React's dispatcher, not Emporix's.

---

## Path Resolution (Cross-Origin Federation)

The plugin files are served from Railway (e.g. `https://my-plugin.railway.app`), but the dashboard loads them from `admin.emporix.io`. This means:

- **Wrong:** `base: '/admin-ui/'` → generates absolute paths like `/admin-ui/assets/chunk.js` → resolves against `admin.emporix.io` → 404
- **Right:** `base: './'` → generates relative paths → federation resolves them against `remoteEntry.js`'s own URL (Railway) → correct origin

You must also configure CORS in your backend to allow `https://admin.emporix.io`:

```ts
// src/index.ts (Express)
app.use(cors({ origin: 'https://admin.emporix.io', credentials: true }));
```

---

## Token Passing

Emporix calls your component with `appState = { tenant, token, language }`. The token is a short-lived Emporix JWT. Store it in a module-level variable and attach it to all backend API calls:

```ts
// admin-ui/src/api.ts
let jwtToken = '';

// Derive API origin from the chunk's own URL — no env-var needed in production
const API_BASE = (() => {
  if (import.meta.env.VITE_PLUGIN_HOST) return import.meta.env.VITE_PLUGIN_HOST;
  try { return new URL(import.meta.url).origin; } catch { return ''; }
})();

export function setToken(token: string) { jwtToken = token; }

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/admin${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwtToken}`,
      ...opts?.headers,
    },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<T>;
}
```

**Dev mode shortcut:** For standalone dev (`vite dev`), read the token from the URL hash:
```ts
// admin-ui/src/main.tsx
const hash = window.location.hash.slice(1);
const token = new URLSearchParams(hash).get('token') ?? '';
setToken(token);
```
Open `http://localhost:5173/#token=YOUR_JWT` to test authenticated calls locally.

---

## UI Design System

Emporix's dashboard is dense and minimal. Plugins must match this aesthetic or they look out of place. Use these exact values:

```ts
// admin-ui/src/styles.ts  — import from here, don't inline
import type { CSSProperties } from 'react';

export const sectionTitle: CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#999',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10,
};
export const fieldLabel: CSSProperties = {
  display: 'block', fontSize: 11, color: '#555', marginBottom: 3,
};
export const fieldHint: CSSProperties = {
  fontSize: 10, color: '#aaa', fontWeight: 400,
};
export const input: CSSProperties = {
  display: 'block', width: '100%', height: 28,
  padding: '0 8px', border: '1px solid #d4d4d4', borderRadius: 3,
  fontSize: 12, color: '#333', background: '#fff', boxSizing: 'border-box',
};
export const selectStyle: CSSProperties = { ...input, cursor: 'pointer' };
export const btnPrimary: CSSProperties = {
  height: 28, padding: '0 12px', background: '#0066cc', color: '#fff',
  border: 'none', borderRadius: 3, fontSize: 12, fontWeight: 500, cursor: 'pointer',
};
export const btnSecondary: CSSProperties = {
  height: 28, padding: '0 10px', background: '#fff', color: '#333',
  border: '1px solid #d4d4d4', borderRadius: 3, fontSize: 12, cursor: 'pointer',
};
export const twoCol: CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
};
```

**Tab navigation pattern** (underline-style, matches Emporix chrome):
```tsx
<div style={{ display: 'flex', borderBottom: '1px solid #e0e0e0', marginBottom: 16 }}>
  {TABS.map(t => (
    <button key={t} onClick={() => setTab(t)} style={{
      padding: '8px 14px', fontSize: 12,
      fontWeight: tab === t ? 500 : 400,
      color: tab === t ? '#0066cc' : '#666',
      background: 'none', border: 'none',
      borderBottom: tab === t ? '2px solid #0066cc' : '2px solid transparent',
      marginBottom: -1, cursor: 'pointer',
    }}>{t}</button>
  ))}
</div>
```

**Password field CSS fix** — without this, `letter-spacing` leaks into placeholder text making it look broken:
```css
/* admin-ui/src/global.css */
input[type="password"]:not(:placeholder-shown) {
  letter-spacing: 1px;
}
```
Import it in `main.tsx`: `import './global.css';`

**Accent color:** `#0066cc` (blue) — used for active tabs, primary buttons, pills, toggle on-state.  
**Danger color:** `#dc2626` (red) — error states.  
**Success color:** `#16a34a` (green) — confirmation states.

---

## Deployment (Railway)

The plugin is deployed as a single Railway service (Express backend that also serves the built `admin-ui-dist/` files).

**Railway configuration:**
- Build command: `npm install && cd admin-ui && npm install && npm run build && cd .. && npm run build` (or similar — build frontend first, then backend)
- Start command: `node dist/index.js`
- Environment variables needed: `REDIS_URL`, `EMPORIX_CLIENT_ID`, `EMPORIX_CLIENT_SECRET`, etc.

**Static file serving in Express:**
```ts
import path from 'path';
app.use('/plugin', express.static(path.join(__dirname, 'admin-ui-dist')));
```

**remoteEntry.js URL** that goes into Emporix plugin config:
```
https://<your-railway-domain>/plugin/assets/remoteEntry.js
```

---

## Emporix Plugin Registration

In the Emporix Management Dashboard, plugins are registered with:
- **Remote URL:** `https://<host>/plugin/assets/remoteEntry.js`
- **Scope name:** `extension` (must match `name:` in `federation({ name: 'extension' })`)
- **Module:** `./RemoteComponent`

Emporix calls `init()` then `get('./RemoteComponent')` on the container. The `get()` call returns a factory function; Emporix calls `factory()` and expects `factory().default` to be the React component. Fix #2 in `federationFixes` ensures this works.

---

## Debugging Checklist

If the plugin doesn't load, check in order:

| Symptom | Check |
|---------|-------|
| 404 on `remoteEntry.js` | Is the Railway deploy live? Is static path correct? |
| 404 on chunk files (e.g. `App-xxx.js`) | Check `base: './'` is set. Check Fix #1 (double assets/ path) is applied. |
| `factory().default` is undefined | Fix #2 (module object) is not applied or regex didn't match. |
| `window.extension` not set | Fix #3 not applied. |
| `useState` crash / null dispatcher | `shared` is not empty. Set `shared: {}`. |
| 401 on all API calls | Token not passed. Check `setToken(appState.token)` is called before fetch. |
| Blank panel, no errors | CORS blocked. Check `Access-Control-Allow-Origin: https://admin.emporix.io` on all responses. |

---

## File Structure Reference

```
emporix-plugin/
├── admin-ui/               ← Vite React frontend
│   ├── src/
│   │   ├── main.tsx        ← entry (token from URL hash in dev)
│   │   ├── RemoteComponent.tsx  ← federation expose + createRoot isolation
│   │   ├── App.tsx         ← tab shell
│   │   ├── api.ts          ← fetch wrapper (derives origin from import.meta.url)
│   │   ├── styles.ts       ← shared CSS-in-JS design tokens
│   │   ├── global.css      ← global CSS fixes (password field)
│   │   └── screens/        ← one file per tab
│   └── vite.config.ts      ← federation config + federationFixes plugin
├── src/                    ← Express backend
│   ├── index.ts            ← server entry, static file serving
│   ├── admin-ui-dist/      ← built frontend (git-ignored or committed)
│   └── routes/             ← /admin/* API routes called by the plugin UI
└── docs/
    └── emporix-plugin-agent-guide.md  ← this file
```

---

## Key Lessons (What Not To Repeat)

1. **Never share React with the webpack host.** `shared: ['react']` looks right but causes a null-dispatcher crash at runtime. Always `shared: {}`.

2. **`base: './'` is mandatory.** Any absolute base path breaks cross-origin chunk loading.

3. **`generateBundle` patches must come after federation.** Use `enforce: 'post'` on the custom plugin.

4. **`factory().default`, not `factory()`.** Emporix's lazy loader always calls `.default` on the factory result. The `() => module` fix ensures this works.

5. **One Railway service, not two.** Serving the static frontend from the same Express origin as the API eliminates a second CORS header set and simplifies `API_BASE` derivation.

6. **Use `import.meta.url` for API_BASE.** The chunk is served from Railway; `new URL(import.meta.url).origin` gives the correct host without any env var in production.

7. **UI must match Emporix's density.** 28px controls, 12px text, `#0066cc` accent, underline tabs. Do not use pill-style tabs or large buttons — they look wrong inside the Emporix chrome.
