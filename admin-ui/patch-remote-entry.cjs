/**
 * Post-build patch: appends window['punchout'] = { get, init } to remoteEntry.js
 *
 * Emporix Management Dashboard uses webpack module federation which expects the
 * remote container to set window[scopeName] = { get, init } as a side effect.
 * Vite plugin federation outputs ES module syntax (export { get, init }) but
 * never sets the window global. This script appends the assignment after the build.
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../src/admin-ui-dist/assets/remoteEntry.js');
const shim = "\nif (typeof window !== 'undefined') window['punchout'] = { get, init };\n";

const content = fs.readFileSync(file, 'utf-8');
if (!content.includes("window['punchout']")) {
  fs.appendFileSync(file, shim);
  console.log('[patch] window[\'punchout\'] shim appended to remoteEntry.js');
} else {
  console.log('[patch] shim already present, skipping');
}
