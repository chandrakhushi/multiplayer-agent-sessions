# Multiplayer Agent Sessions

A small, local-first proof of concept for a **multiplayer agent session** where
each participant only sees the parts of the session their own permissions allow,
and a **claim-lock** stops two people from having the agent act on the same
piece of work twice.

<!-- Demo recording: docs/demo.gif (see docs/demo-script.md) -->

## The gap

Multiplayer AI tools (Mosaic, Superconductor, Claude Tag, Hops) focus on syncing
agent session history and memory across a team. The Multiplayer AI Manifesto
(multiplayer-ai.com, September 2026) names the permissions problem as a "privacy
pitfall" and says no vendor it knows of satisfies its principles. As far as we
know, the public launch material for these tools does not show either of these:

1. **A per-viewer redaction boundary.** When a second teammate joins a live
   agent session, they see everything the agent has done, including output from
   tool calls that ran on the first teammate's private integrations (their
   email, their CRM, their credentials).
2. **Per-object locks.** Two agents or teammates can independently pick up the
   same customer thread and both act on it, because "who is working on this" is
   tracked per session, not per object.

This repo is a small working implementation of both: per-viewer redaction and
per-object claim-locks, built small enough to read in one sitting.

## What the demo shows

Three people open the same live agent session in separate browser tabs:

- **Nina** (Support lead) owns `send_email`, the support inbox.
- **Theo** (Account executive) owns `update_crm`, the CRM with deal values.
- **Sam** (Contractor) owns no integrations.

What each of them sees:

- **Redaction.** When the agent calls Nina's email tool, Nina sees the full
  drafted email. Theo and Sam see a single line in its place:
  `🔒 [redacted: send_email call using another participant's integration]`. The
  same happens for Theo's CRM update. Sam sees every tool call redacted.
- **Claim-lock.** Everyone sees three tickets with a Resolve button. Nina clicks
  Resolve on `ticket-42`; a moment later Theo clicks it too. The agent works the
  ticket once, for Nina. Theo gets "Nina is already handling ticket-42", and his
  button shows who holds the claim. If Sam resolves a ticket, the claim still
  wins, but the agent can only summarise it, since Sam has no integrations.

## Run it

Requires Node 20+ and pnpm.

```bash
pnpm install
pnpm build
pnpm start
```

Open <http://localhost:3000> in two or three tabs (or browsers) and pick a
different person in each. The name you pick is remembered per tab, so reloading
keeps it. Restart the server to reset the session and all claims.

To show it from another machine: `ngrok http 3000`.

## How it works

```
browser ──join / claim──▶ session broker ──resolve <ticket> <who>──▶ pty stdin
                                                                        │
                                                                   agent stub
                                                                        │
each browser ◀── output redacted for that viewer ── session broker ◀── pty stdout
```

- **One shared agent process.** The server runs a single agent in a pty and fans
  its output out to every connected browser. This is built on
  [wetty](https://github.com/butlerx/wetty) (node-pty + xterm.js + socket.io),
  whose server can see terminal content in plain text. That visibility is what
  makes server-side redaction possible. An end-to-end encrypted terminal like
  sshx could not do this.
- **Tagged tool calls.** Mock tools print each call as one line:
  `##TOOL_CALL##{"tool":"send_email","owner":"support","output":"..."}`. The
  broker parses these lines out of the stream and never forwards the raw marker
  to anyone.
- **Per-viewer filtering.** For each viewer, the broker checks the permission
  map. A viewer who owns the tool gets a formatted block with the output; anyone
  else gets the redacted placeholder. Ownership comes from the permission map,
  not from the `owner` field the agent reports.
- **Claim-lock.** The broker keeps an in-memory `ticketId → participant` table.
  A claim that loses gets a rejection naming the holder. Only a claim that wins
  is written to the agent's stdin, so the agent can never be asked to work the
  same ticket twice.
- **Read-only terminal.** In v1, viewers steer the agent only through the claim
  buttons, so every instruction the agent receives has passed the lock.

### Code map

| File                                | What it does                                                           |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `src/shared/session.ts`             | Participants and their owned tools, tickets, socket event contract     |
| `src/server/session-broker.ts`      | Shared pty, marker parsing, per-viewer redaction, claim handling       |
| `src/server/claims.ts`              | Claim table and `tryClaim`                                             |
| `src/agent/agent-stub.ts`           | Scripted agent that narrates and calls tools, reads `resolve` commands |
| `src/agent/mock-tools.ts`           | Fake `send_email` and `update_crm` with private-looking output         |
| `src/client/wetty/session.ts`       | Name picker, presence list, tickets, "already handling" toast          |
| `src/server/session-broker.spec.ts` | Tests for parsing, redaction and claims (`pnpm test`)                  |

The agent is a scripted stand-in, not a real Claude Code or Codex session, so
the demo is identical every run and the focus stays on the scoping and lock
logic.

## Future work

Deliberately out of scope for v1:

- Real OAuth scopes and real integrations (Gmail, Slack, a CRM)
- A real agent CLI in the pty in place of the scripted stub
- Auth and login (v1 uses "pick your name" per tab)
- Persisted claims and session history (both are in memory)
- Typed input from viewers, claim-checked per command
- Binding a claim to a hash of the drafted output, so an edited draft
  invalidates a stale approval
- Multi-session history sync, which is Mosaic's product and not the point here
- Hosting (local plus ngrok is enough for a demo)

## Credits

Forked from [wetty](https://github.com/butlerx/wetty) by Cian Butler and
contributors, MIT licensed. The original wetty README is kept at
[docs/wetty.md](docs/wetty.md).
