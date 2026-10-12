#!/usr/bin/env node
// A stand-in for the `codex` command, for Drawbridge's tests. It refuses to run unless it was started the safe way
// (prompt on standard input, nothing saved, the user's own settings and rules left out, read-only, in an empty folder,
// and every tool switched off), then answers with a line that proves what it was asked and shown.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
if (args[0] === "login") { console.log("Logged in using ChatGPT"); process.exit(0); }
// One switch the real list has that this stand-in does not ("goals"), so a switch Codex does not know must never be passed.
if (args[0] === "features") { console.log(["shell_tool", "unified_exec", "apps", "plugins", "hooks", "browser_use", "computer_use", "multi_agent", "view_image", "image_generation"].map((name) => `${name}   stable   true`).join("\n")); process.exit(0); }
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const off = args.flatMap((arg, index) => (arg === "--disable" ? [args[index + 1]] : []));
const fork = args.includes("fork") ? args[args.indexOf("fork") + 1] : "";

const bad = args[0] !== "exec" ? "it was not a one-off run"
  : off.includes("goals") ? "it was passed a switch this Codex does not have, which the real one refuses"
  : args.at(-1) !== "-" ? "the prompt was passed as an argument, where other users of the computer can read it"
  : !args.includes("--ephemeral") ? "the run would be saved"
  : !args.includes("--ignore-user-config") || !args.includes("--ignore-rules") ? "personal settings or rules would load"
  : value("--sandbox") !== "read-only" ? "it could write"
  : ["shell_tool", "unified_exec", "apps", "plugins", "hooks", "browser_use", "computer_use", "multi_agent"].some((feature) => !off.includes(feature)) ? "it was left with tools"
  : readdirSync(process.cwd()).length ? "it was started in a folder with files in it"
  : value("--cd") !== process.cwd() && !process.cwd().endsWith(value("--cd") || "?") ? "it was pointed at another folder"
  : !value("--output-last-message") ? "it was given nowhere to write its reply" : "";
if (bad) { console.error(`stub codex: ${bad}`); process.exit(3); }

const prompt = readFileSync(0, "utf8"), has = (text) => prompt.includes(text);
const asked = (prompt.match(/\(ref [^)]+\):\n\n([^\n]*)/) || [])[1] || "?";
const reply = (text) => writeFileSync(value("--output-last-message"), text);

if (process.env.STUB_CODEX_FAIL) { console.error("You've hit your usage limit. Try again later."); process.exit(1); }

if (fork) reply(`CODEX COPY of session ${fork}. Asked: ${asked} | told it cannot read files: ${has("You cannot read files")}`);
else if (has("A question arrived for the Claude sessions")) {
  const question = prompt.split("Question from ")[1].toLowerCase();
  const hit = [...prompt.matchAll(/^(\d+)\. "([^"]*)"/gm)].filter((line) => line[2].toLowerCase().split(" ").some((word) => question.includes(word))).map((line) => line[1]);
  reply(hit.length ? hit.join(", ") : "no idea");
} else if (has("This is the end of the session's conversation")) {
  reply(`CODEX FROM THE CONVERSATION. Asked: ${asked} | saw what the user said: ${has("USER: the launch is on Friday")} | saw the reply: ${has("AGENT: Noted, Friday.")} | saw a key: ${has("sk_live_")} | saw tool output: ${has("TOOL-OUTPUT")}`);
} else reply(`CODEX STUB ANSWER. Asked: ${asked} | saw branches: ${has("Branches here and on GitHub")}`);
