# Permission-Scoped Multiplayer Agent Sessions — Build Plan

Source: https://claude.ai/artifact/7fmMU7UsmWnE9PAEQxnk1p (Sep 25, 2026 · Khushi
Chandra)

## Overview

Most "multiplayer AI" tools (Mosaic, Superconductor, Claude Tag, Hops) sync
agent session history and memory across a team. None of them, based on public
launch material as of September 2026, solve two problems:

1. **Permission scoping** — when a second teammate joins a live agent session,
   they see everything the agent has done, including output from tool calls that
   used the first teammate's private integrations. There is no visibility
   boundary per participant.
2. **Duplicate-work race conditions** — two agents (or teammates) can
   independently pick up the same piece of work and both act on it, because
   approval and "who's working on this" tracking is per-session, not per-object.

**Pitch:** a small, local-first proof of concept for a multiplayer agent session
where each participant only sees the parts of the session their permissions
allow, and a lightweight claim-lock stops two agents from double-acting on the
same piece of work.

## Demo scenario

Alice and Bob join the same live agent session in a browser. The agent has two
mock tools: `send_email` (Alice's) and `update_crm` (Bob's). When the agent
calls Alice's email tool, Bob sees
`[redacted: tool call using another participant's integration]` instead of the
call and its output. Then both try to have the agent act on the same ticket at
the same time — the second attempt is blocked with "claimed by X".

### In scope (v1)

- Live shared terminal view of one agent process, multiple browser clients
- Hardcoded permission map (participant → owned mock tools)
- Per-client redaction of tool output the viewer does not own
- Claim-lock keyed on a resource id (e.g. ticket id) with visible "claimed by X"
  state
- 2-3 mock tools

### Out of scope (README "future work")

- Real OAuth / integrations
- Multi-session history sync
- Auth/login — "pick your name" per tab instead
- Hosting — local + `ngrok http <port>`

## Architecture

Node.js + TypeScript. Forked from [wetty](https://github.com/butlerx/wetty)
(MIT; node-pty + xterm.js + WebSockets). Not sshx: its E2E encryption means the
server cannot see terminal content, which redaction needs.

1. **Agent runner** — wetty's pty spawn, pointed at `agent-stub` instead of a
   login shell.
2. **Session broker** — wetty's WebSocket bridge, extended to:
   - tag each output chunk with tool + owner
   - per client, replace chunks for tools the client does not own with a
     redacted placeholder
   - keep an in-memory claim table `{ resourceId: participantId }`; reject input
     that acts on a resource claimed by someone else
3. **Browser client** — xterm.js page, name picker, sidebar with "who's here"
   and "what's claimed".
4. **Mock tools** — `send_email`, `update_crm` print tagged JSON to stdout.

**Data flow:** browser input → WebSocket → broker (claim check) → pty stdin →
agent → pty stdout → broker (tag + redact per client) → WebSocket → each
xterm.js renders its own view.

## Permission scoping

```ts
type Participant = { id: string; name: string; ownedTools: string[] };

const participants: Participant[] = [
  { id: 'alice', name: 'Alice', ownedTools: ['send_email'] },
  { id: 'bob', name: 'Bob', ownedTools: ['update_crm'] },
];
```

Tool output marker (stripped by the broker, never sent raw):

```
##TOOL_CALL##{"tool":"send_email","owner":"alice","output":"..."}
```

```ts
function filterForClient(chunk: TaggedChunk, client: Participant): string {
  if (!chunk.tool) return chunk.text; // plain narration, everyone sees it
  if (client.ownedTools.includes(chunk.tool)) return chunk.text;
  return `[redacted: ${chunk.tool} call by another participant]`;
}
```

## Claim-lock

```ts
type Claim = { resourceId: string; claimedBy: string; claimedAt: number };
const claims = new Map<string, Claim>();

function tryClaim(resourceId: string, participantId: string): Claim | null {
  const existing = claims.get(resourceId);
  if (existing && existing.claimedBy !== participantId) return existing;
  const claim = { resourceId, claimedBy: participantId, claimedAt: Date.now() };
  claims.set(resourceId, claim);
  return null;
}
```

Demo: both see "resolve ticket #42". Alice clicks first, broker claims
`ticket-42` for Alice. Bob clicks a second later, sees "Alice is already
handling this".

Stretch: bind the claim to a hash of the output text, so an edited draft
invalidates a stale approval.

## Target repo structure

```
src/server/index.ts          HTTP + WebSocket entrypoint
src/server/pty-runner.ts     spawns agent in a pty
src/server/session-broker.ts WebSocket, redaction, claim-lock
src/server/permissions.ts    participant/ownedTools map
src/server/claims.ts         claim table + tryClaim
src/mock-tools/send-email.ts
src/mock-tools/update-crm.ts
src/agent-stub.ts            scripted agent calling mock tools
public/index.html            xterm.js viewer + name picker + claim UI
docs/demo-script.md
```

(Adapt to wetty's existing layout rather than forcing this tree.)

`agent-stub.ts`: scripted stand-in, not a real Claude Code/Codex session, so the
demo is repeatable. Real agent CLI is a fast-follow.

## Milestones

1. **Fork and run wetty as-is** — install, run, watch a live shell in the
   browser. No custom code.
2. **Agent-stub + multiple viewers** — pty target → agent-stub; two tabs see
   identical output; name picker + "who's here".
3. **Permission scoping** — mock tools, permission map, redaction. Make the
   placeholder look intentional.
4. **Claim-lock** — 2-3 fake tickets, claim table, "already claimed by X".
5. **Polish** — README, 30-60s recording, clean history.

Feed each milestone to Claude Code as its own prompt, in order.
