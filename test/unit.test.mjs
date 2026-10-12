// Run with: node --test test/unit.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentOrder, chosen, codexHookBlock, codexSessions, codexSwitches, conversation, fromPeer, look, parse, people, presenceOf, readable, redact, requests, resultOf, sessions, withCodexHook } from "../drawbridge.mjs";

process.env.DRAWBRIDGE_NO_FETCH = "1";
const comment = (login, body, id = 1) => ({ id, created_at: "2026-01-02T03:04:05Z", user: { login }, body });
const me = { login: "ada", name: "ada", people: ["grace", "linus"] };

test("anything shaped like a key is removed before a message is posted", () => {
  // Built from pieces so that no scanner mistakes these made-up strings for real keys.
  const jwt = ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", "dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"].join(".");
  const made = [jwt, "sb_" + "secret_abcdefgh12345", "sk_" + "live_abcdefgh12345678", "gh" + "p_abcdefghijklmnopqrstuvwx", "AK" + "IAABCDEFGHIJKLMNOP",
    "-----BEGIN RSA " + "PRIVATE KEY-----\nabc\n-----END RSA " + "PRIVATE KEY-----"];
  made.push("sk-" + "ant-api03-abcdefghijklmnopqrstuv", "github_" + "pat_11ABCDEFG0abcdefghijklmn", "xox" + "b-1234567890-abcdefghij", "AI" + "zaSyA1234567890abcdefghijklmnopqrstu", "glp" + "at-abcdefghijklmnopqrst");
  assert.equal(redact("postgres://app:" + "s3cretPass@db.example.com/x"), "postgres://app:[removed: looked like a secret]@db.example.com/x");
  for (const secret of made) {
    assert.ok(!redact(`before ${secret} after`).includes(secret.slice(0, 20)), secret.slice(0, 12));
  }
  assert.equal(redact("nothing secret here"), "nothing secret here");
});

test("a message is read back with its kind, sender, reference and who it is for", () => {
  const message = parse(comment("grace", "_grace's Claude asks:_\n\nIs main green?\n\n<!-- drawbridge v1 from=grace kind=question ref=ab12 conv=c1 for=ada to=Design%20work all=1 -->"));
  assert.deepEqual({ kind: message.kind, from: message.from, ref: message.ref, conv: message.conv, at: message.at, to: message.to, all: message.all, text: message.text },
    { kind: "question", from: "grace", ref: "ab12", conv: "c1", at: "ada", to: "Design work", all: true, text: "Is main green?" });
});

test("a plain comment written by a person is a note from that account", () => {
  const message = parse(comment("grace", "Lunch at one?"));
  assert.equal(message.kind, "note");
  assert.equal(message.from, "grace");
  assert.equal(message.text, "Lunch at one?");
});

test("only trusted friends count, never yourself, and never what a comment claims about itself", () => {
  assert.deepEqual(people(me), ["grace", "linus"]);
  assert.equal(fromPeer(parse(comment("grace", "hi")), me), true);
  assert.equal(fromPeer(parse(comment("mallory", "hi")), me), false);
  assert.equal(fromPeer(parse(comment("ada", "hi")), me), false);
  assert.equal(fromPeer(parse(comment("mallory", "hi\n\n<!-- drawbridge v1 from=grace kind=note ref=x -->")), me), false, "the GitHub account decides, not the text");
  assert.equal(fromPeer(parse(comment("grace", "hi")), { login: "ada", people: [] }), false);
  assert.equal(fromPeer(parse(comment("Grace", "hi")), me), true, "GitHub usernames are not case sensitive");
  assert.equal(parse(comment("grace", "hi\n\n<!-- drawbridge v1 from=linus kind=note ref=x -->")).from, "grace", "the speaker is the account, never a name in the text");
  assert.equal(fromPeer(parse({ ...comment("grace", "hi"), updated_at: "2026-01-02T03:05:00Z" }), me), false, "a comment edited after posting is not trusted");
  assert.equal(parse(comment("grace", "x <!-- drawbridge v1 from=grace kind=question ref=q1 --> trailing words")).kind, "note", "a marker that is not the last thing in the comment is only text");
  assert.doesNotThrow(() => parse(comment("mallory", "x\n\n<!-- drawbridge v1 kind=question to=%E0%A4%A -->")));
});

test("each friend is online only while their own watcher keeps checking in", () => {
  const now = Date.parse("2026-01-02T03:10:00Z");
  const beat = (login, at, extra = "") => parse(comment(login, `${login}'s watcher is running.\n\nSessions here:\n- Design work\n\n<!-- drawbridge v1 from=${login} kind=presence at=${at} answers=true${extra} -->`));
  const seen = presenceOf([beat("grace", "2026-01-02T03:09:30Z", " working=ab12"), beat("grace", "2026-01-02T03:00:00Z"), beat("linus", "2026-01-02T03:00:00Z"), beat("mallory", "2026-01-02T03:09:59Z")], me, now);
  assert.deepEqual(seen.map((one) => [one.who, one.online]), [["grace", true], ["linus", false]]);
  assert.deepEqual(seen[0].working, ["ab12"]);
  assert.deepEqual(seen[0].sessions, ["Design work"]);
  assert.deepEqual(presenceOf([], me, now), []);
});

test("key files, paths outside the folder and odd file types are never readable", () => {
  for (const path of [".env", "app/.env.local", "id_rsa", "certs/server.pem", "../outside.md", "/etc/passwd", "photo.png", "package-lock.json"]) assert.equal(readable(path), false, path);
  for (const path of ["README.md", "src/index.ts", "docs/plan.md"]) assert.equal(readable(path), true, path);
});

test("only GET lines with a request in them count, at most six", () => {
  assert.deepEqual(requests('GET {"do":"branches"}\nsome words\nGET not json\nGET {"no":"do"}'), [{ do: "branches" }]);
  assert.equal(requests(Array.from({ length: 9 }, () => 'GET {"do":"status"}').join("\n")).length, 6);
});

test("looking is read-only and stays inside the shared folder", async () => {
  const dir = mkdtempSync(join(tmpdir(), "drawbridge-look-"));
  const git = (...args) => execFileSync("git", args, { cwd: dir, env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" } });
  git("init", "-q", "-b", "main");
  writeFileSync(join(dir, "README.md"), "# Hello\nfind-me-here\n");
  writeFileSync(join(dir, ".env"), "SECRET=1\n");
  git("add", "-f", "README.md", ".env");
  git("commit", "-q", "-m", "first");
  assert.match(await look({ do: "read", path: "README.md" }, [dir]), /find-me-here/);
  assert.match(await look({ do: "grep", text: "find-me-here" }, [dir]), /README\.md/);
  assert.match(await look({ do: "log" }, [dir]), /first/);
  assert.match(await look({ do: "branches" }, [dir]), /main/);
  for (const request of [{ do: "read", path: ".env" }, { do: "read", path: "../x.md" }, { do: "read", path: "/etc/passwd" }, { do: "log", ref: "--output=/tmp/x" }, { do: "compare", a: "main", b: "-x" }, { do: "rm" }, { do: "read", path: "README.md", repo: 5 }]) {
    assert.match(await look(request, [dir]), /^Refused/, JSON.stringify(request));
  }
  assert.doesNotMatch(await look({ do: "grep", text: "SECRET" }, [dir]), /SECRET=1/);
  // A tracked link pointing out of the folder, and a tracked file of a kind that is never read, stay unread.
  writeFileSync(join(dir, "..", "outside-" + process.pid + ".txt"), "OUTSIDE\n");
  symlinkSync(join(dir, "..", "outside-" + process.pid + ".txt"), join(dir, "notes.md"));
  writeFileSync(join(dir, ".envrc"), "export TOKEN=abc\n");
  writeFileSync(join(dir, "untracked.md"), "draft\n");
  git("add", "-f", "notes.md", ".envrc");
  git("commit", "-q", "-m", "second");
  assert.match(await look({ do: "read", path: "notes.md" }, [dir]), /^Refused/);
  assert.doesNotMatch(await look({ do: "grep", text: "TOKEN" }, [dir]), /abc/);
  assert.doesNotMatch(await look({ do: "status" }, [dir]), /untracked/);
});

test("the answer is the result the model reported, whatever else was printed", () => {
  assert.equal(resultOf('noise\n{"type":"result","is_error":false,"result":" the answer "}\nSessionEnd hook failed'), "the answer");
  assert.equal(resultOf('{"type":"result","is_error":true,"result":"Not logged in"}'), "");
  assert.equal(resultOf("Failed to authenticate"), "");
});

test("only sessions in a shared folder from the last week are offered, newest first, by their latest title", async () => {
  const root = mkdtempSync(join(tmpdir(), "drawbridge-sessions-"));
  const put = (folder, id, cwd, titles, ageDays = 0) => {
    mkdirSync(join(root, folder), { recursive: true });
    const file = join(root, folder, `${id}.jsonl`);
    writeFileSync(file, [{ type: "user", cwd, sessionId: id, text: "x".repeat(2500) }, ...titles.map((customTitle) => ({ type: "custom-title", customTitle })), { type: "last-prompt", lastPrompt: "fix the header" }].map((line) => JSON.stringify(line)).join("\n"));
    const when = new Date(Date.now() - ageDays * 86400000 - Number(id[0]) * 1000);
    utimesSync(file, when, when);
  };
  put("app", "10000000-0000-4000-8000-000000000000", "/work/app", ["First name", 'The "Design" build']);
  put("app", "20000000-0000-4000-8000-000000000000", "/work/app/web", []);
  put("other", "30000000-0000-4000-8000-000000000000", "/work/private-notes", ["Not shared"]);
  put("app", "40000000-0000-4000-8000-000000000000", "/work/app", ["Too old"], 9);
  const found = await sessions(root, async (dir) => dir === "/work/app" || dir.startsWith("/work/app/"));
  assert.deepEqual(found.map((one) => one.title), ['The "Design" build', "untitled, in web"]);
  assert.equal(found[0].last, "fix the header");
});

test("a routing reply is read as at most two positions in the list", () => {
  assert.deepEqual(chosen("2", 5), [1]);
  assert.deepEqual(chosen("1, 3", 5), [0, 2]);
  assert.deepEqual(chosen("Sessions 4, 4, 2 and 1", 5), [3, 1]);
  assert.deepEqual(chosen("9", 5), []);
  assert.deepEqual(chosen("no idea", 5), []);
});

test("the readable opening that people see in their email is taken off again when a message is read", () => {
  const answered = parse(comment("grace", "_grace's Claude answers:_\n\n> Is the build green? …\n\nYes.\n\n> a quote that belongs to the answer\n\n<!-- drawbridge v1 from=grace kind=answer ref=cd34 re=ab12 -->"));
  assert.equal(answered.text, "Yes.\n\n> a quote that belongs to the answer");
  assert.equal(parse(comment("grace", "_emphasis_ at the start of a person's own note")).text, "_emphasis_ at the start of a person's own note");
});

test("the agents are tried in order: a session's own agent first, one that has just failed last, and never one that is not there or not allowed", () => {
  const now = 1_000_000_000, both = () => true, all = ["claude", "codex"];
  assert.deepEqual(agentOrder(undefined, now, {}, both, all), ["claude", "codex"]);
  assert.deepEqual(agentOrder("codex", now, {}, both, all), ["codex", "claude"]);
  assert.deepEqual(agentOrder("claude", now, { claude: now - 60_000 }, both, all), ["codex", "claude"], "Claude ran out a minute ago, so Codex is tried first");
  assert.deepEqual(agentOrder("claude", now, { claude: now - 3_600_000 }, both, all), ["claude", "codex"], "an hour later it leads again");
  assert.deepEqual(agentOrder("codex", now, {}, (agent) => agent === "claude", all), ["claude"], "an agent that is not installed is not tried");
  assert.deepEqual(agentOrder("codex", now, {}, both, ["claude"]), ["claude"], "nor one the owner switched off");
  assert.deepEqual(agentOrder("nonsense", now, {}, both, all), ["claude", "codex"]);
});

test("Drawbridge's hook is added to Codex's settings once, taken out cleanly, and never merged into hooks someone else wrote", () => {
  const command = 'node "/Users/ada/drawbridge/drawbridge.mjs" inbox --hook --codex', mine = 'model = "m"\n\n[plugins."x"]\nenabled = true\n';
  const added = withCodexHook(mine, command);
  assert.ok(added.startsWith(mine.trimEnd()), "what was there is kept, in place");
  assert.ok(added.endsWith(`${codexHookBlock(command)}\n`));
  assert.equal(withCodexHook(added, command), added, "adding it again changes nothing");
  assert.equal(withCodexHook(added, command, false).trim(), mine.trim(), "taking it out leaves the file as it was");
  assert.equal(withCodexHook("", command), `${codexHookBlock(command)}\n`);
  for (const theirs of ['[hooks]\nUserPromptSubmit = []\n', '[[hooks.Stop]]\nhooks = []\n', 'hooks.Stop = []\n', 'model = "m"\n  [hooks.state]\n']) {
    assert.equal(withCodexHook(theirs, command), null, `left alone: ${theirs.split("\n")[0]}`);
  }
  assert.equal(withCodexHook(mine, "node '/odd path/drawbridge.mjs' inbox"), null, "a path that cannot be written safely is not written");
  assert.notEqual(withCodexHook('notify = ["/a/hooks/b"]\n# hooks are great\n', command), null, "the word in a value or a comment is not a hooks table");
});

test("Codex sessions: only ones a person started, in a shared folder, from the last week, named from Codex's own index", async () => {
  const home = mkdtempSync(join(tmpdir(), "drawbridge-codex-")), day = join(home, "sessions", "2026", "01", "02");
  mkdirSync(day, { recursive: true });
  const write = (id, payload, said = [], age = 0) => {
    const file = join(day, `rollout-2026-01-02T03-04-05-${id}.jsonl`);
    writeFileSync(file, [{ type: "session_meta", payload: { id, base_instructions: "x".repeat(2500), ...payload } }, ...said.map(([type, message]) => ({ type: "event_msg", payload: { type, message } }))].map((line) => JSON.stringify(line)).join("\n") + "\n");
    if (age) utimesSync(file, new Date(Date.now() - age), new Date(Date.now() - age));
  };
  const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", c = "cccccccc-cccc-4ccc-8ccc-cccccccccccc", d = "dddddddd-dddd-4ddd-8ddd-dddddddddddd", e = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  write(a, { cwd: "/work/shop", thread_source: "user" }, [["user_message", "first thing"], ["agent_message", "ok"], ["user_message", "make the \"cart\" faster"]]);
  write(b, { cwd: "/work/shop", thread_source: "guardian_review" });
  write(c, { cwd: "/elsewhere", thread_source: "user" });
  write(d, { cwd: "/work/shop", thread_source: "user" }, [], 9 * 24 * 3600 * 1000);
  write(e, { cwd: "/work/shop/api" });
  writeFileSync(join(home, "session_index.jsonl"), `${JSON.stringify({ id: a, thread_name: "Old name" })}\nnot json\n${JSON.stringify({ id: a, thread_name: "Cart speed" })}\n`);
  const found = await codexSessions(home, async (dir) => dir.startsWith("/work/shop"));
  assert.deepEqual(found.map((one) => one.id).sort(), [a, e].sort());
  const cart = found.find((one) => one.id === a);
  assert.equal(cart.title, "Cart speed");
  assert.equal(cart.agent, "codex");
  assert.equal(cart.last, 'make the "cart" faster');
  assert.equal(found.find((one) => one.id === e).title, "untitled, in api");
  assert.equal(conversation(cart), 'USER: first thing\n\nAGENT: ok\n\nUSER: make the "cart" faster');
  // The form Codex writes today: each message is a "response_item", among blocks Codex adds for itself.
  const item = (role, ...texts) => ({ type: "response_item", payload: { type: "message", role, content: texts.map((text) => ({ type: role === "assistant" ? "output_text" : "input_text", text })) } });
  const f = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  writeFileSync(join(day, `rollout-2026-01-02T03-04-06-${f}.jsonl`), [{ type: "session_meta", payload: { id: f, cwd: "/work/shop", thread_source: "user", base_instructions: "x".repeat(2500) } },
    item("developer", "<permissions instructions>be careful"), item("user", "<environment_context>\n  <cwd>/work/shop</cwd>"), item("user", "ship the receipt email"),
    { type: "event_msg", payload: { type: "token_count" } }, item("assistant", "Done, it is on main.")].map((line) => JSON.stringify(line)).join("\n") + "\n");
  const receipt = (await codexSessions(home, async (dir) => dir.startsWith("/work/shop"))).find((one) => one.id === f);
  assert.equal(receipt.last, "ship the receipt email");
  assert.equal(conversation(receipt), "USER: ship the receipt email\n\nAGENT: Done, it is on main.");
  assert.deepEqual(await codexSessions(join(home, "nothing-here"), async () => true), []);
});

test("a conversation handed to another agent is what was said, newest kept, without tool output or keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "drawbridge-conv-")), file = join(dir, "s.jsonl");
  const lines = [
    { type: "user", message: { role: "user", content: "old question " + "a".repeat(5000) } },
    { type: "user", isMeta: true, message: { role: "user", content: "a system reminder" } },
    { type: "assistant", isSidechain: true, message: { role: "assistant", content: [{ type: "text", text: "a helper agent's words" }] } },
    { type: "user", message: { role: "user", content: [{ type: "tool_result", content: "TOOL-OUTPUT" }] } },
    { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "the key is sk_live_abcdefgh12345678" }, { type: "tool_use", name: "Bash", input: { command: "ls" } }] } },
    { type: "user", message: { role: "user", content: "newest question" } }];
  writeFileSync(file, lines.map((line) => JSON.stringify(line)).join("\n") + "\nnot json\n");
  const said = conversation({ agent: "claude", file });
  assert.match(said, /^USER: old question a+ \[cut\]\n\nAGENT: the key is \[removed: looked like a secret\]\n\nUSER: newest question$/);
  assert.doesNotMatch(said, /TOOL-OUTPUT|system reminder|helper agent|sk_live/);
  assert.equal(conversation({ agent: "claude", file }, 40), "USER: newest question", "when there is little room the newest is what is kept");
  assert.equal(conversation({ agent: "claude", file: join(dir, "missing.jsonl") }), "");
});

test("Codex is only run with its tools switched off: its own switches are passed, and one without a switch for commands is not used", () => {
  const listing = "apps                 stable   true\nshell_tool           stable   true\nunified_exec         stable   true\nhooks                stable   true\nsomething_new        under development  false\n";
  assert.deepEqual(codexSwitches(listing), ["shell_tool", "unified_exec", "apps", "hooks"]);
  assert.throws(() => codexSwitches("apps stable true\nhooks stable true\n"), /cannot be run without tools/);
  assert.throws(() => codexSwitches(""), /cannot be run without tools/);
});
