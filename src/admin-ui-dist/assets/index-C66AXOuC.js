import { j as jsxRuntimeExports, A as App, s as setToken } from './App-DdKW6ZbZ.js';
import { r as reactDomExports } from './index-D9Af7wOI.js';

var client = {};

var m = reactDomExports;
{
  client.createRoot = m.createRoot;
  client.hydrateRoot = m.hydrateRoot;
}

const hash = window.location.hash.slice(1);
const params = new URLSearchParams(hash);
const token = params.get("token") ?? "";
setToken(token);
client.createRoot(document.getElementById("root")).render(
  /* @__PURE__ */ jsxRuntimeExports.jsx(App, {})
);
