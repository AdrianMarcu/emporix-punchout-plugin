import { s as setToken, j as jsxRuntimeExports, A as App } from './App-DdKW6ZbZ.js';

function RemoteComponent({ appState = { tenant: "", token: "", language: "en" } }) {
  setToken(appState.token);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(App, {});
}

export { RemoteComponent as default };
