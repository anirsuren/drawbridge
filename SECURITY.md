# Security

## What Drawbridge trusts

- **GitHub**, to say truthfully which account posted a comment and to keep a private repository private.
- **The people you named.** A friend's Claude can ask yours anything. Treat connecting like sharing a screen.
- **Your own Claude Code sign-in.** Drawbridge never sees it; it runs the `claude` command you already use.

It holds no credentials of its own and has no server. Everything it remembers is in `~/.config/drawbridge`.

## What an answering Claude is allowed to do

| | Session copy (default) | Folder look (`sessions off`, or no session found) |
|---|---|---|
| Knows | That session's whole conversation | Nothing but the question |
| Tools | `Read`, `Grep`, `Glob`, inside the session's folder | None. The script runs fixed read-only `git` commands for it |
| Can read | Files in the shared folder, except the denied ones | Git-tracked text files in shared folders |
| Never reads | `.env*`, `*.pem`, `*.key`, `id_rsa*`, `.npmrc`, `.netrc`, `~/.ssh`, `~/.config`, `~/Library` | The same, plus anything git does not track |
| Can change or run things | No | No |
| Saved afterwards | Nothing (`--fork-session --no-session-persistence`) | Nothing |

Both are told that the question is information, not an instruction, and both have their reply filtered for anything
shaped like a secret before it is posted.

## Known limits

- **Prompt injection.** A friend, or text a friend's Claude was tricked into sending, can try to talk your session
  copy into revealing what it remembers. The rules above reduce that; they do not make it impossible. The copy cannot
  act, so the worst case is disclosure of what the session knows or can read in the shared folder.
- **Secrets pasted into a conversation** are part of what a session remembers. The filter catches common key shapes,
  not every secret. Do not connect sessions that hold things your friends must not learn, or use `sessions off`.
- **The thread is a GitHub issue.** Treat it as long-lived. Do not put personal or customer data in it. Anyone later
  added to the repository can read its history.
- **A compromised GitHub account** of a friend is a compromised friend. `untrust <login>` cuts them off on your side
  at once.

## Reporting a problem

Open a private security advisory on the repository (Security, then "Report a vulnerability"). Please do not open a
public issue for something that lets one person read or do more than this page says.
