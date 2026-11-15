// Run the website's engine (static/js/local/server.js) in Node: sql.js from
// static/vendor, an in-memory stand-in for IndexedDB (fake-idb.mjs), and the
// word data from a small site built by tests/js/fixture_site.py.
//
//   const { handle } = await bootServer();   // then handle(method, url, body)
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire, registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The small site: built once per process (Python, from the test sample). */
export function fixtureSite() {
  if (process.env.LEXI_SITE) return process.env.LEXI_SITE;
  const out = mkdtempSync(join(tmpdir(), "lexi-site-"));
  const venv = join(ROOT, ".venv", "bin", "python");
  execFileSync(existsSync(venv) ? venv : "python3", [join(ROOT, "tests/js/fixture_site.py"), out], { stdio: "inherit" });
  process.env.LEXI_SITE = out;
  return out;
}

let booted = null;
export async function bootServer() {
  if (booted) return booted;
  const site = fixtureSite();
  const FAKE = new URL("./fake-idb.mjs", import.meta.url).href;
  registerHooks({ resolve(spec, ctx, next) {
    if (spec === "./idb.js" && ctx.parentURL.endsWith("/local/server.js")) return { url: FAKE, shortCircuit: true };
    return next(spec, ctx);
  } });
  // sql.js loads before `window` exists, or it takes Node for a browser.
  const require = createRequire(import.meta.url);
  const SQL = await require(join(ROOT, "static/vendor/sql-wasm.js"))({ locateFile: f => join(ROOT, "static/vendor", f) });
  globalThis.window = globalThis;
  globalThis.location = { href: "http://local/" };
  globalThis.document = { addEventListener() {}, visibilityState: "visible", createElement: () => ({}),
    head: { append(s) { globalThis.initSqlJs = async () => SQL; queueMicrotask(s.onload); } } };
  globalThis.IDBRequest = class {};
  // One tab only: a real BroadcastChannel would keep Node running.
  globalThis.BroadcastChannel = class { postMessage() {} close() {} addEventListener() {} };
  globalThis.fetch = async url => {
    const path = new URL(url, "http://local/").pathname.slice(1);
    try { return new Response(await readFile(join(site, path)), { status: 200 }); }
    catch { return new Response("", { status: 404 }); }
  };
  booted = await import(join(ROOT, "static/js/local/server.js"));
  return booted;
}
