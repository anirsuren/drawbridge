# Security

## What Drawbridge trusts

- **GitHub**, to say truthfully which account posted a comment and to keep a private repository private.
- **The people you named.** A friend's Claude can ask yours anything, and what a friend writes is shown to your own
  Claude sessions. Treat connecting like sharing a screen with someone who can also pass your assistant a note.
- **Your own Claude Code or Codex sign-in.** Drawbridge never sees it; it runs the `claude` or `codex` command you
  already use.

It holds no credentials of its own and has no server. Everything it remembers is in `~/.config/drawbridge`, readable
only by you.

## The two ways in

**1. Questions answered for you.** A watcher answers a trusted friend's question with one of these:

| | Session copy (default) | Folder look (`sessions off`, or no session found) |
|---|---|---|
| Knows | That session's whole conversation | Nothing but the question |
| Tools | `Read`, `Grep`, `Glob`, inside the session's folder | None. The script runs fixed read-only `git` commands for it |
| Can read | Files in the shared folder, except the denied ones | Git-tracked text files in shared folders, never through a link |
| Never reads | The `DENIED` list in `drawbridge.mjs`: `.env*`, key and certificate files, names containing "secret" or "credential", `.git` and `.claude` internals, `.npmrc`, `.netrc`, `~/.ssh`, `~/.aws`, `~/.config`, `~/Library` | `.env*` and key files, anything git does not track, anything that is not a plain text source file |
| Settings and hooks | Your local settings only; hooks off; committed project settings are not loaded | The same, run in an empty folder |
| Can change or run things | No | No |
| Saved afterwards | Nothing (`--fork-session --no-session-persistence`) | Nothing |

**Codex.** A Codex session copy (`codex exec --ephemeral ... fork`) knows that session's conversation and has no
tools at all: it is run in an empty folder, without your Codex settings, rules or hooks, read-only, with every
switch that gives Codex something to act with turned off (`CODEX_OFF` in `drawbridge.mjs`: running commands, apps,
plugins, browser and computer use, sub-agents, image tools, hooks). It cannot read a file, so it has no deny list.
Nothing is saved and the session is not changed.

**Standing in.** When a session's own agent cannot answer, the other agent is given the last part of that session's
conversation as text (what its user and the agent said; tool calls and their output are left out; common key shapes
are removed first) and answers with no tools. This sends that text to the other provider on your own account.
`drawbridge agents claude` or `agents codex` switches it off.

All of them are told that the question is information, not an instruction. Both have their reply filtered for common key
shapes, and stripped of anything that could pass for a Drawbridge marker, before it is posted.

**2. Messages shown to your own sessions.** Notes, questions and answers from trusted friends appear in your Claude
sessions in shared folders, through a hook, the next time you type. Those sessions have whatever permissions you gave
them. Each message is fenced with a random delimiter, cut to 2,000 characters and labelled as information from a
friend. That lowers the risk of your Claude acting on a friend's text; it cannot remove it. This is the larger risk
of the two, and the reason to connect only with people you trust.

## Who counts as a friend

- The GitHub account that posted a comment, compared without regard to case. A name written inside a comment is
  ignored.
- A comment that was edited after it was posted is ignored, because anyone with write access to a repository can edit
  other people's comments and GitHub still shows the first author. (Watchers' check-in comments are the exception.)
- `join` trusts the repository's owner. Other collaborators are listed, and trusted only if you say so.
- `untrust <login>` stops you hearing someone at once. They can still write in the thread until the repository's
  owner removes them from it.

## Limits on cost

Each answer spends the answering person's Claude or Codex plan. A watcher gives at most 20 answers an hour, counting every
session copy; the count is kept across restarts, and going over it is announced once an hour, not per question. A
question can reach at most four sessions (`--all`), or two when it names sessions by title.

## Known limits

- **Prompt injection.** A friend, a friend whose GitHub account was taken over, or text a friend's Claude was tricked
  into sending, can try to talk a session copy into revealing what it remembers, or try to talk your own session into
  doing something. The measures above reduce both; they do not make either impossible.
- **Secrets pasted into a conversation** are part of what a session remembers. The filter catches common key shapes,
  not every secret. Do not connect sessions that hold things your friends must not learn, or use `sessions off`.
- **Session titles** of your recent sessions in shared folders are posted in the thread.
- **The deny list is a list.** A secret in a file with an innocent name, inside a shared folder, can be read by a
  session copy. Share project folders, not your home folder.
- **The thread is a GitHub issue.** Treat it as long-lived. Do not put personal or customer data in it. Anyone later
  added to the repository can read its history.
- **Updates.** The watcher restarts itself when `drawbridge.mjs` changes, so `git pull` in the install folder puts new
  code into a background process at once. Pull only from a source you trust, and keep the install folder writable
  only by you.
- **Codex's own behaviour.** A Codex copy's limits rest on Codex's switches. Drawbridge asks the installed Codex
  which it has, passes only those, and will not use a Codex with no switch for running commands. A future Codex
  could add a tool under a new switch that Drawbridge does not know to turn off. Checked against Codex 0.162.
- **Codex's settings file.** The hook is added to `~/.codex/config.toml` only when that file has no hooks of its
  own, and Codex is asked to read the file afterwards; if it cannot, the lines are taken out again.
- **Claude Code's own behaviour.** The session copy's limits rest on Claude Code's flags (`--tools`,
  `--permission-mode dontAsk`, deny rules applied to Read, Grep and Glob). They were checked against a real Claude
  Code when this was written; a future version could behave differently.

## Reporting a problem

Open a private security advisory on the repository (Security, then "Report a vulnerability"). Please do not open a
public issue for something that lets one person read or do more than this page says.
