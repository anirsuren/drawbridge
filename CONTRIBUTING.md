# Contributing

Drawbridge is one file with no dependencies, on purpose: anyone should be able to read all of it before letting it
run on their computer.

- Run `npm test` before sending a change. The tests run the real script against stand-ins for `gh` and `claude`
  (`test/stubs`), so no network or sign-in is needed.
- A change to what an answering Claude can see or do needs a test that proves the new boundary, and a line in
  `SECURITY.md`.
- Keep error messages as sentences that say what to do next.
- No dependencies, no build step, no telemetry.
