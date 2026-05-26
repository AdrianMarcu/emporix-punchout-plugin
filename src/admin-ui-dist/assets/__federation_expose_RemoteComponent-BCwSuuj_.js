import { s as setToken, r as reactExports, a as createRoot, A as App } from './App-Ucp9AIh-.js';

const roots = /* @__PURE__ */ new WeakMap();
function RemoteComponent({
  appState = { tenant: "", token: "", language: "en" }
}) {
  setToken(appState.token);
  return reactExports.createElement("div", {
    "data-punchout-plugin": "root",
    style: { width: "100%", minHeight: "100px" },
    ref: (el) => {
      if (!el) return;
      if (!roots.has(el)) {
        roots.set(el, createRoot(el));
      }
      roots.get(el).render(reactExports.createElement(App, null));
    }
  });
}

export { RemoteComponent as default };
