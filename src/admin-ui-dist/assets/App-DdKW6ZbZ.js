import { importShared } from './__federation_fn_import-gVVR6EuA.js';
import { r as reactExports } from './index-Dm_EQZZA.js';

var jsxRuntime = {exports: {}};

var reactJsxRuntime_production_min = {};

/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var f=reactExports,k=Symbol.for("react.element"),l=Symbol.for("react.fragment"),m=Object.prototype.hasOwnProperty,n=f.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,p={key:true,ref:true,__self:true,__source:true};
function q(c,a,g){var b,d={},e=null,h=null;void 0!==g&&(e=""+g);void 0!==a.key&&(e=""+a.key);void 0!==a.ref&&(h=a.ref);for(b in a)m.call(a,b)&&!p.hasOwnProperty(b)&&(d[b]=a[b]);if(c&&c.defaultProps)for(b in a=c.defaultProps,a) void 0===d[b]&&(d[b]=a[b]);return {$$typeof:k,type:c,key:e,ref:h,props:d,_owner:n.current}}reactJsxRuntime_production_min.Fragment=l;reactJsxRuntime_production_min.jsx=q;reactJsxRuntime_production_min.jsxs=q;

{
  jsxRuntime.exports = reactJsxRuntime_production_min;
}

var jsxRuntimeExports = jsxRuntime.exports;

let jwtToken = "";
function setToken(token) {
  jwtToken = token;
}
async function apiFetch(path, opts) {
  const base = "http://localhost:3000";
  const res = await fetch(`${base}/admin${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwtToken}`, ...opts?.headers }
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
const api = {
  getConfig: () => apiFetch("/config"),
  saveConfig: (body) => apiFetch("/config", { method: "POST", body: JSON.stringify(body) }),
  getBuyers: () => apiFetch("/buyers"),
  saveBuyer: (body) => apiFetch("/buyers", { method: "POST", body: JSON.stringify(body) }),
  getCustomerGroups: () => apiFetch("/customer-groups")
};

const {useEffect: useEffect$2,useState: useState$4} = await importShared('react');
function Credentials() {
  const [form, setForm] = useState$4({ sharedSecret: "", clientId: "", clientSecret: "", storefrontBaseUrl: "" });
  const [status, setStatus] = useState$4("");
  useEffect$2(() => {
    api.getConfig().then((cfg) => {
      const c = cfg;
      setForm({
        sharedSecret: "",
        clientId: String(c.serviceAccount?.clientId ?? ""),
        clientSecret: "",
        storefrontBaseUrl: String(c.storefrontBaseUrl ?? "")
      });
    }).catch(() => {
    });
  }, []);
  const handleSave = async (e) => {
    e.preventDefault();
    setStatus("Saving…");
    try {
      await api.saveConfig({
        sharedSecret: form.sharedSecret || void 0,
        serviceAccount: { clientId: form.clientId, clientSecret: form.clientSecret },
        storefrontBaseUrl: form.storefrontBaseUrl
      });
      setStatus("Saved.");
    } catch {
      setStatus("Error saving. Check console.");
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSave, style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { children: [
      "Shared Secret (leave blank to keep existing)",
      /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
      /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "password", value: form.sharedSecret, onChange: (e) => setForm({ ...form, sharedSecret: e.target.value }), style: { width: "100%", padding: 8 } })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { children: [
      "Emporix Service Account Client ID",
      /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
      /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value: form.clientId, onChange: (e) => setForm({ ...form, clientId: e.target.value }), style: { width: "100%", padding: 8 } })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { children: [
      "Emporix Service Account Client Secret",
      /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
      /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "password", value: form.clientSecret, onChange: (e) => setForm({ ...form, clientSecret: e.target.value }), style: { width: "100%", padding: 8 } })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { children: [
      "Storefront Base URL",
      /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
      /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value: form.storefrontBaseUrl, onChange: (e) => setForm({ ...form, storefrontBaseUrl: e.target.value }), style: { width: "100%", padding: 8 } })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "submit", style: { padding: "10px 20px", background: "#0066cc", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }, children: "Save" }),
    status && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: status })
  ] });
}

const {useEffect: useEffect$1,useState: useState$3} = await importShared('react');
function BuyerMappings() {
  const [mappings, setMappings] = useState$3([]);
  const [groups, setGroups] = useState$3([]);
  const [newBuyerOrgId, setNewBuyerOrgId] = useState$3("");
  const [newGroupId, setNewGroupId] = useState$3("");
  const [status, setStatus] = useState$3("");
  useEffect$1(() => {
    Promise.all([api.getBuyers(), api.getCustomerGroups()]).then(([b, g]) => {
      setMappings(b);
      setGroups(g);
    }).catch(() => {
    });
  }, []);
  const handleAdd = async (e) => {
    e.preventDefault();
    setStatus("Saving…");
    try {
      const updated = await api.saveBuyer({ buyerOrgId: newBuyerOrgId, customerGroupId: newGroupId });
      setMappings(updated);
      setNewBuyerOrgId("");
      setNewGroupId("");
      setStatus("Saved.");
    } catch {
      setStatus("Error saving.");
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { style: { width: "100%", borderCollapse: "collapse", marginBottom: 24 }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { style: { textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }, children: "Buyer Org ID" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { style: { textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }, children: "Customer Group" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: mappings.map((m) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { style: { padding: 8 }, children: m.buyerOrgId }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { style: { padding: 8 }, children: groups.find((g) => g.id === m.customerGroupId)?.name ?? m.customerGroupId })
      ] }, m.buyerOrgId)) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleAdd, style: { display: "flex", gap: 8, alignItems: "flex-end" }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { children: [
        "Buyer Org ID",
        /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value: newBuyerOrgId, onChange: (e) => setNewBuyerOrgId(e.target.value), style: { padding: 8 } })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { children: [
        "Customer Group",
        /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { value: newGroupId, onChange: (e) => setNewGroupId(e.target.value), style: { padding: 8 }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "Select…" }),
          groups.map((g) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: g.id, children: g.name }, g.id))
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "submit", style: { padding: "8px 16px", background: "#0066cc", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }, children: "Add" })
    ] }),
    status && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: status })
  ] });
}

const {useEffect,useState: useState$2} = await importShared('react');
function ProtocolSettings() {
  const [settings, setSettings] = useState$2({ cxmlEnabled: true, ociEnabled: true, operationAllowed: "edit", ociOkCode: "ADDFROMCATALOG" });
  const [status, setStatus] = useState$2("");
  useEffect(() => {
    api.getConfig().then((cfg) => {
      const c = cfg;
      setSettings({ cxmlEnabled: c.cxmlEnabled ?? true, ociEnabled: c.ociEnabled ?? true, operationAllowed: c.operationAllowed ?? "edit", ociOkCode: c.ociOkCode ?? "ADDFROMCATALOG" });
    }).catch(() => {
    });
  }, []);
  const handleSave = async (e) => {
    e.preventDefault();
    setStatus("Saving…");
    try {
      await api.saveConfig(settings);
      setStatus("Saved.");
    } catch {
      setStatus("Error.");
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSave, style: { display: "flex", flexDirection: "column", gap: 16 }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "checkbox", checked: settings.cxmlEnabled, onChange: (e) => setSettings({ ...settings, cxmlEnabled: e.target.checked }) }),
      " Enable cXML"
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "checkbox", checked: settings.ociEnabled, onChange: (e) => setSettings({ ...settings, ociEnabled: e.target.checked }) }),
      " Enable OCI"
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { children: [
      "cXML operationAllowed",
      /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
      /* @__PURE__ */ jsxRuntimeExports.jsx("select", { value: settings.operationAllowed, onChange: (e) => setSettings({ ...settings, operationAllowed: e.target.value }), style: { padding: 8 }, children: ["create", "edit", "inspect"].map((v) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: v, children: v }, v)) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { children: [
      "OCI ~OkCode",
      /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { value: settings.ociOkCode, onChange: (e) => setSettings({ ...settings, ociOkCode: e.target.value }), style: { padding: 8 }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "ADDFROMCATALOG", children: "ADDFROMCATALOG" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "SOURCING", children: "SOURCING" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "submit", style: { padding: "10px 20px", background: "#0066cc", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }, children: "Save" }),
    status && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: status })
  ] });
}

const {useState: useState$1} = await importShared('react');

const SAMPLE_CXML = `<?xml version="1.0" encoding="UTF-8"?>
<cXML payloadID="test-001" timestamp="2026-05-11T10:00:00Z">
  <Header>
    <From><Credential domain="NetworkId"><Identity>test-buyer-org</Identity></Credential></From>
    <To><Credential domain="NetworkId"><Identity>supplier</Identity></Credential></To>
    <Sender>
      <Credential domain="NetworkId">
        <Identity>test-buyer-org</Identity>
        <SharedSecret>YOUR_SHARED_SECRET</SharedSecret>
      </Credential>
      <UserAgent>ConnectionTest</UserAgent>
    </Sender>
  </Header>
  <Request deploymentMode="test">
    <PunchOutSetupRequest operation="create">
      <BuyerCookie>test-cookie-001</BuyerCookie>
      <BrowserFormPost><URL>https://example.com/return</URL></BrowserFormPost>
    </PunchOutSetupRequest>
  </Request>
</cXML>`;
function ConnectionTest() {
  const [result, setResult] = useState$1("");
  const [loading, setLoading] = useState$1(false);
  const runTest = async () => {
    setLoading(true);
    setResult("");
    try {
      const pluginHost = "http://localhost:3000";
      const res = await fetch(`${pluginHost}/punchout/cxml/setup`, {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: SAMPLE_CXML
      });
      const text = await res.text();
      setResult(`HTTP ${res.status}

${text}`);
    } catch (err) {
      setResult(`Error: ${err}`);
    } finally {
      setLoading(false);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { style: { marginBottom: 16 }, children: "Sends a simulated cXML PunchOutSetupRequest to verify credentials and config. Replace YOUR_SHARED_SECRET in the payload with your configured shared secret before testing." }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: runTest,
        disabled: loading,
        style: { padding: "10px 20px", background: "#0066cc", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" },
        children: loading ? "Testing…" : "Run Connection Test"
      }
    ),
    result && /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { style: { marginTop: 16, padding: 16, background: "#f5f5f5", borderRadius: 4, overflow: "auto", fontSize: 13 }, children: result })
  ] });
}

const {useState} = await importShared('react');
const TABS = ["Credentials", "Buyer Mappings", "Protocol Settings", "Connection Test"];
function App() {
  const [tab, setTab] = useState("Credentials");
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { fontFamily: "sans-serif", maxWidth: 800, margin: "0 auto", padding: 24 }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { style: { fontSize: 20, marginBottom: 16 }, children: "Emporix Punchout Plugin" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { display: "flex", gap: 8, marginBottom: 24, borderBottom: "1px solid #ddd" }, children: TABS.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: () => setTab(t),
        style: {
          padding: "8px 16px",
          border: "none",
          background: tab === t ? "#0066cc" : "transparent",
          color: tab === t ? "#fff" : "#333",
          cursor: "pointer",
          borderRadius: "4px 4px 0 0"
        },
        children: t
      },
      t
    )) }),
    tab === "Credentials" && /* @__PURE__ */ jsxRuntimeExports.jsx(Credentials, {}),
    tab === "Buyer Mappings" && /* @__PURE__ */ jsxRuntimeExports.jsx(BuyerMappings, {}),
    tab === "Protocol Settings" && /* @__PURE__ */ jsxRuntimeExports.jsx(ProtocolSettings, {}),
    tab === "Connection Test" && /* @__PURE__ */ jsxRuntimeExports.jsx(ConnectionTest, {})
  ] });
}

export { App as A, jsxRuntimeExports as j, setToken as s };
