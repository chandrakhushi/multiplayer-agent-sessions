/**
 * Shared contract between the session broker (server) and the browser client.
 *
 * Socket.IO events:
 *   client -> server
 *     'join'   JoinRequest        pick a participant; server replies 'joined'
 *     'claim'  ClaimRequest       ask the agent to resolve a ticket
 *   server -> client
 *     'joined'   SessionState     sent once after a valid 'join'
 *     'data'     string           terminal output, already redacted for this client
 *     'presence' Participant[]    everyone currently connected (on every join/leave)
 *     'claims'   Claim[]          full claim table (on every change)
 *     'claim-rejected' ClaimRejected  only to the client whose claim lost
 *     'logout'                    agent process exited
 *
 * Agent-stub protocol (pty):
 *   stdout: tool calls are one line: TOOL_MARKER + JSON.stringify(ToolCall)
 *   stdin:  broker writes `resolve <ticketId> <participantId>\n` after a won claim
 */

export interface Participant {
  id: string;
  name: string;
  ownedTools: string[];
}

export const participants: Participant[] = [
  { id: 'alice', name: 'Alice', ownedTools: ['send_email'] },
  { id: 'bob', name: 'Bob', ownedTools: ['update_crm'] },
];

export interface Ticket {
  id: string;
  title: string;
}

export const tickets: Ticket[] = [
  { id: 'ticket-42', title: 'Refund request from Acme Corp' },
  { id: 'ticket-43', title: 'Login loop on mobile app' },
  { id: 'ticket-44', title: 'Invoice shows wrong currency' },
];

export const TOOL_MARKER = '##TOOL_CALL##';

export interface ToolCall {
  tool: string;
  owner: string;
  output: string;
}

export interface Claim {
  resourceId: string;
  claimedBy: string;
  claimedAt: number;
}

export interface JoinRequest {
  participantId: string;
}
export interface ClaimRequest {
  resourceId: string;
}
export interface ClaimRejected {
  resourceId: string;
  claimedBy: Participant;
}

export interface SessionState {
  you: Participant;
  participants: Participant[]; // currently connected
  tickets: Ticket[];
  claims: Claim[];
}
