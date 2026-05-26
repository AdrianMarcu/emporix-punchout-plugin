import { c as client, j as jsxRuntimeExports, A as App, s as setToken } from './App-DjT8gTyb.js';

const hash = window.location.hash.slice(1);
const params = new URLSearchParams(hash);
const token = params.get("token") ?? "";
setToken(token);
client.createRoot(document.getElementById("root")).render(
  /* @__PURE__ */ jsxRuntimeExports.jsx(App, {})
);
