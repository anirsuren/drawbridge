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
const path = args.find((arg) => arg.startsWith("repos/") || arg.startsWith("user"));
const body = flag("--input") ? JSON.parse(readFileSync(0, "utf8")) : null;
// The tests switch "GitHub" off by creating this file, and back on by removing it.
if (process.env.STUB_GH_FAIL || existsSync(DB + ".down")) { console.error("error connecting to api.github.com"); process.exit(1); }
const now = () => new Date().toISOString();
let out;
if (path === "user") out = { login: LOGIN };
// Repositories, collaborators and invitations, for "start" and "join". A repository exists once it was created or if STUB_REPO_EXISTS names it.
else if (path === "user/repos" && method === "POST") out = change((db) => { db.repos = db.repos || {}; const full = `${LOGIN}/${body.name}`; db.repos[full] = { owner: LOGIN, private: body.private === true, people: [LOGIN], invited: [] }; return { full_name: full, private: body.private === true }; });
else if (path === "user/repository_invitations") out = change((db) => Object.entries(db.repos || {}).filter(([, repo]) => repo.invited.includes(LOGIN)).map(([full], index) => ({ id: index + 1, repository: { full_name: full } })));
else if (/^user\/repository_invitations\/\d+$/.test(path) && method === "PATCH") out = change((db) => { const mine = Object.values(db.repos || {}).filter((repo) => repo.invited.includes(LOGIN))[Number(path.split("/").pop()) - 1]; if (!mine) { console.error("Not Found"); process.exit(1); } mine.invited = mine.invited.filter((name) => name !== LOGIN); mine.people.push(LOGIN); return {}; });
else if (/^repos\/[^/]+\/[^/]+\/collaborators\/[^/?]+$/.test(path) && method === "PUT") out = change((db) => { const [, owner, name, , friend] = path.split("/"); const repo = (db.repos || {})[`${owner}/${name}`]; if (!repo || friend === "no-such-user") { console.error("Not Found (HTTP 404)"); process.exit(1); } if (!repo.people.includes(friend) && !repo.invited.includes(friend)) repo.invited.push(friend); return {}; });
else if (/^repos\/[^/]+\/[^/]+\/collaborators\?/.test(path)) out = change((db) => { const repo = (db.repos || {})[path.split("/").slice(1, 3).join("/")]; if (!repo || !repo.people.includes(LOGIN)) { console.error("Not Found"); process.exit(1); } return repo.people.map((login) => ({ login })); });
else if (/^repos\/[^/]+\/[^/]+$/.test(path)) {
  const made = change((db) => (db.repos || {})[path.slice(6)]);
  if (made) { if (!made.people.includes(LOGIN)) { console.error("Not Found (HTTP 404)"); process.exit(1); } out = { full_name: path.slice(6), private: made.private }; }
  else if (path === "repos/test/repo") out = { full_name: "test/repo", private: !process.env.STUB_PUBLIC_REPO };
  else { console.error("Not Found (HTTP 404)"); process.exit(1); }
}
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
