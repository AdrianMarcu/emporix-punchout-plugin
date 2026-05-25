import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { setToken } from './api';
import App from './App';

export interface AppState {
  tenant: string;
  token: string;
  language: string;
}

// WeakMap so roots are GC'd when the container element is removed from the DOM.
const roots = new WeakMap<HTMLElement, ReturnType<typeof createRoot>>();

/**
 * Called by Emporix's webpack React. Returns a plain <div> element — React
 * elements are plain objects keyed by Symbol.for('react.element') which is the
 * same symbol in every React instance, so Emporix's React renders it fine.
 *
 * Once the <div> is in the DOM the ref callback fires, and we bootstrap our
 * own independent React 18 root inside it using our bundled React. This
 * isolates our hooks entirely from Emporix's React dispatcher.
 */
export default function RemoteComponent({
  appState = { tenant: '', token: '', language: 'en' },
}: {
  appState?: AppState;
}) {
  console.log('[RemoteComponent] called, tenant:', appState.tenant);
  setToken(appState.token);

  return createElement('div', {
    'data-punchout-plugin': 'root',
    style: { width: '100%', minHeight: '100px' },
    ref: (el: HTMLElement | null) => {
      if (!el) return;
      if (!roots.has(el)) {
        console.log('[RemoteComponent] bootstrapping inner React root');
        roots.set(el, createRoot(el));
      }
      roots.get(el)!.render(createElement(App, null));
    },
  });
}
