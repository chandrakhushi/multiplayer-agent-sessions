# Demo script

Target: a 30–60 second screen recording that shows the redaction and the
claim-lock.

## Setup (before recording)

1. Build and start a fresh server, so the session and claims are empty:

   ```bash
   pnpm build && pnpm start
   ```

2. Open two browser windows side by side, each about half the screen width. Use
   two windows rather than two tabs, so both views are visible at once. Two
   different browsers (or a normal and a private window) also work.
3. Load <http://localhost:3000> in both. Do not pick a name yet.
4. Start recording.

The agent's warm-up pass takes about 5–8 seconds after the first person joins.
Late joiners see the full history, redacted for them, so the order you join in
doesn't matter.

## Script

| Time   | Action                                                                                                           | Say / caption                                                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 0–5s   | Left window: pick **Nina** (Support lead). Right window: **Theo** (Account executive).                           | "Two teammates join the same live agent session."                                                               |
| 5–15s  | Wait while the agent runs its warm-up triage.                                                                    | "The agent uses Nina's support inbox and Theo's CRM."                                                           |
| 15–25s | Point at the email block on the left and the 🔒 line on the right, then the reverse for the CRM update.          | "Each person sees only their own integration's output. The other's is redacted by the server."                  |
| 25–35s | Click **Resolve** on ticket-42 in Nina's window, then immediately in Theo's.                                     | "Both try to have the agent resolve the same ticket."                                                           |
| 35–45s | Show Theo's "Nina is already handling ticket-42" toast, then the agent working the ticket once in Nina's window. | "The first claim wins. The second is blocked, so the work isn't duplicated."                                    |
| 45–55s | Optional: open a third window as **Sam** (Contractor) and resolve ticket-43.                                     | "Sam has no integrations, so every tool call is redacted for Sam, and the agent can only summarise the ticket." |

## Tips

- If Theo's button is already disabled before you click it, you were too slow.
  That still shows the lock ("Nina is handling this"). For the toast, click both
  windows within about half a second.
- Zoom the browser to 110–125% so the terminal text is readable in the video.
- To re-record, restart the server (Ctrl-C, then `pnpm start`). The chosen name
  is stored per tab, so open fresh tabs to get the picker again.
- Export the recording as `docs/demo.gif` (or upload the video and link it) and
  replace the comment near the top of the README.
