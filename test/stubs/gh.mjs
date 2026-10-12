#!/usr/bin/env node
// A stand-in for the `gh` command, for Drawbridge's tests. It keeps one issue thread in a JSON file and answers the
// handful of API calls Drawbridge makes, as whichever account STUB_LOGIN names. Nothing here touches the network.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";

const DB = process.env.STUB_DB, LOGIN = process.env.STUB_LOGIN || "nobody";
const nap = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function change(edit) {
  const lock = DB + ".lock";
  for (let i = 0; ; i++) {
    try { mkdirSync(lock); break; } catch { try { if (Date.now() - statSync(lock).mtimeMs > 5000) rmSync(lock, { recursive: true, force: true }); } catch { /* gone */ } if (i > 2000) throw new Error("stub locked"); nap(5); }
  }
  try {
    let db = { issues: [], comments: [], next: 1000 };
    try { db = JSON.parse(readFileSync(DB, "utf8")); } catch { /* first use */ }
    const out = edit(db);
    writeFileSync(DB + "." + process.pid, JSON.stringify(db));
    renameSync(DB + "." + process.pid, DB);
    return out;
  } finally { rmSync(lock, { recursive: true, force: true }); }
}
const args = process.argv.slice(2).filter((arg) => arg !== "api");
const flag = (name) => args.includes(name);
const method = flag("--method") ? args[args.indexOf("--method") + 1] : "GET";
const path = args.find((arg) => arg.startsWith("repos/") || arg === "user");
const body = flag("--input") ? JSON.parse(readFileSync(0, "utf8")) : null;
// The tests switch "GitHub" off by creating this file, and back on by removing it.
if (process.env.STUB_GH_FAIL || existsSync(DB + ".down")) { console.error("error connecting to api.github.com"); process.exit(1); }
const now = () => new Date().toISOString();
let out;
if (path === "user") out = { login: LOGIN };
else if (/^repos\/[^/]+\/[^/]+$/.test(path)) out = { full_name: path.slice(6), private: !process.env.STUB_PUBLIC_REPO };
else if (/\/issues\?/.test(path)) out = change((db) => db.issues.filter((issue) => issue.state === "open"));
else if (/\/issues$/.test(path) && method === "POST") out = change((db) => { const issue = { number: db.issues.length + 1, title: body.title, state: "open" }; db.issues.push(issue); return issue; });
else if (/\/issues\/comments\/\d+$/.test(path) && method === "PATCH") out = change((db) => { const id = Number(path.split("/").pop()); const comment = db.comments.find((c) => c.id === id); if (!comment) { console.error("Not Found"); process.exit(1); } comment.body = body.body; comment.updated_at = now(); return comment; });
else if (/\/issues\/\d+\/comments$/.test(path) && method === "POST") out = change((db) => { const comment = { id: db.next++, issue: Number(path.split("/")[4]), user: { login: LOGIN }, body: body.body, created_at: now(), updated_at: now() }; db.comments.push(comment); return comment; });
else if (/\/issues\/\d+\/comments\?/.test(path)) {
  const issue = Number(path.split("/")[4]), since = decodeURIComponent((path.match(/since=([^&]+)/) || [])[1] || "1970-01-01T00:00:00Z");
  const list = change((db) => db.comments.filter((c) => c.issue === issue && c.updated_at >= since));
  out = flag("--slurp") ? [list] : list;
} else { console.error(`stub gh: unhandled ${method} ${path}`); process.exit(2); }
console.log(JSON.stringify(out));
