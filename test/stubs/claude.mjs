#!/usr/bin/env node
// A stand-in for the `claude` command, for Drawbridge's tests. It refuses to run if it was given any tool, picks one
// file when asked to choose, and otherwise answers with a line that proves which question and which files it was shown.
const args = process.argv.slice(2);
if (args[0] === "auth") { console.log(JSON.stringify({ loggedIn: true })); process.exit(0); }
const value = (name) => args[args.indexOf(name) + 1];
// A copy of a real session: it may read files, and nothing else, and must leave nothing behind.
if (args.includes("--resume")) {
  const bad = !args.includes("--fork-session") ? "it would write into the real session"
    : !args.includes("--no-session-persistence") ? "the copy would be saved"
    : value("--tools") !== "Read,Grep,Glob" ? "it was given tools other than reading"
    : value("--permission-mode") !== "dontAsk" ? "it could be granted more"
    : value("--setting-sources") !== "project" ? "personal settings and plugins would load"
    : !(value("--settings") || "").includes("Read(**/.env*)") ? "it could read .env files"
    : value("--mcp-config") !== '{"mcpServers":{}}' ? "it was given connectors" : "";
  if (bad) { console.error(`stub claude: ${bad}`); process.exit(3); }
  if (process.env.STUB_CLAUDE_LIVE_FAIL) { console.error("No conversation found with session ID"); process.exit(1); }
  // A session the question has nothing to do with says so in one word.
  if (value("-p").includes("QUIET-ONE") && process.cwd().endsWith("slides")) { console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "NOTHING" })); process.exit(0); }
  const asked = (value("-p").match(/\(ref [^)]+\):\n\n([^\n]*)/) || [])[1] || "?";
  console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: `LIVE ANSWER from session ${value("--resume")} in ${process.cwd().split("/").pop()}. Asked: ${asked} | knew earlier: ${value("-p").includes("[earlier]")}` }));
  process.exit(0);
}
if (!args.includes("--tools") || value("--tools") !== "") { console.error("stub claude: it was given tools"); process.exit(3); }
if (args.includes("--allowedTools")) { console.error("stub claude: it was allowed tools"); process.exit(3); }
if (!args.includes("--setting-sources") || value("--setting-sources") !== "project") { console.error("stub claude: personal settings and plugins would load"); process.exit(3); }
if (process.env.STUB_CLAUDE_FAIL) { console.log("Failed to authenticate: OAuth session expired"); process.exit(1); }
const prompt = value("-p"), system = value("--append-system-prompt") || "";
// Choosing a session: picks the one whose title shares a word with the question, as the real model would by meaning.
if (prompt.startsWith("A question arrived for the Claude sessions")) {
  if (process.env.STUB_CLAUDE_ROUTE_FAIL) { console.log("Failed to authenticate"); process.exit(1); }
  const question = prompt.split("Question from ")[1].toLowerCase();
  const hit = [...prompt.matchAll(/^(\d+)\. "([^"]*)"/gm)].filter((line) => line[2].toLowerCase().split(" ").some((word) => question.includes(word))).map((line) => line[1]);
  console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: hit.length ? hit.join(", ") : "no idea" }));
  process.exit(0);
}
const wait = Number(process.env.STUB_CLAUDE_DELAY || 0);
const reply = (text) => console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: text }));
const has = (text) => prompt.includes(text);
setTimeout(() => {
  if (!/^===== result of \{"do":"grep"/m.test(prompt)) {
    // First round: ask for some things it may have and several it must be refused.
    reply(['GET {"do":"grep","text":"find-me-here"}', 'GET {"do":"read","path":".env"}', 'GET {"do":"read","path":"../../../etc/passwd"}',
      'GET {"do":"log","ref":"--output=/tmp/drawbridge-e2e-pwned"}', 'GET {"do":"status"}'].join("\n"));
  } else {
    const after = (request) => (prompt.split(`===== result of ${request} =====\n`)[1] || "").split("\n")[0];
    reply(`STUB ANSWER. Asked: ${(prompt.match(/\(ref [^)]+\):\n\n([^\n]*)/) || [])[1] || "?"} | saw branches: ${has("Branches here and on GitHub")} | read README: ${has('===== result of {"do":"read","path":"README.md"} =====')} | grep hits: ${/README\.md:\d+:/.test(prompt)} | env: ${after('{"do":"read","path":".env"}').slice(0, 7)} | passwd: ${after('{"do":"read","path":"../../../etc/passwd"}').slice(0, 7)} | bad ref: ${after('{"do":"log","ref":"--output=/tmp/drawbridge-e2e-pwned"}').slice(0, 7)} | saw key: ${has("TOP_SECRET=")} | earlier turns: ${(prompt.match(/^\[earlier\] /gm) || []).length} | remembers purple: ${/^\[earlier\] [^\n]*asked: [^\n]*purple/m.test(prompt)}`);
  }
  // What happened on a real machine: the answer was given, then a plugin's hook failed while shutting down.
  if (process.env.STUB_CLAUDE_HOOK_FAIL) { console.error('SessionEnd hook [node "${CLAUDE_PLUGIN_ROOT}/scripts/session-lifecycle-hook.mjs" SessionEnd] failed: Hook cancelled'); process.exit(1); }
}, wait);
