# IMAP trigger: "Force Reconnect Every Minutes"

Checked 2026-10-30 against production n8n **2.27.4**, node `Hostinger Email Trigger - Watch Replies` (`n8n-nodes-base.emailReadImap`, typeVersion **2.1**, credential "IMAP account").

## Does the setting exist? Yes.

* `EmailReadImapV2` (handles versions 2 and 2.1) defines option **`forceReconnect`**, "Force Reconnect Every Minutes", a number of minutes (the UI pre-fills 60). It has no version restriction.
* **Today it is not set**: the live node has `"options": {}`. The code is `if (options.forceReconnect !== undefined) setInterval(handleReconnect, forceReconnect × 60 000)`, so with `{}` no proactive reconnect happens: one long-lived connection is held until the server resets it.
* A 15–20 minute value is valid. `handleReconnect` closes the mailbox, ends the connection and opens a new one; a `close` during it is logged as "forced reconnecting" and does **not** raise an error (no alert).

Exact setting (node → Options → *Add option* → **Force Reconnect Every Minutes**), resulting in:

```json
"options": { "forceReconnect": 20 }
```

## Is it likely to help? Probably not, based on the data.

From the n8n log (14 days, 24 drops; 19 connection lifetimes with a known start):

| Connection lived | count |
|---|---|
| < 1 min | 2 |
| 1–5 min | 1 |
| 5–20 min | 2 |
| 20–60 min | 2 |
| 1–6 h | 4 |
| 6–24 h | 2 |
| > 24 h | 6 |

Lifetimes range from under a minute to ~2 days (median ≈ 100 min, 14 of 19 ≥ 20 min). If the server enforced a maximum connection age, lifetimes would bunch below it; they do not. Fresh connections drop as readily as old ones, so the drops look like random server/network resets (`ECONNRESET`, `EPIPE`, "socket ended by the other party"). A periodic reconnect only helps against an age limit; here it would not remove the resets and would add ~72 deliberate reconnects/day. (The `imap` library n8n uses, v0.8.19, keeps its own keep-alive on by default (`keepalive` unless explicitly false), so the drops happen despite it.)

## Risk to reply monitoring

* The trigger does **not** fetch anything when it (re)connects. Mail that arrives while it is reconnecting is only picked up at the **next** "new mail" event, via `UID <lastMessageUid>:*` (typeVersion 2.1 tracks the last UID in static data), so it is delayed until another message arrives, not lost.
* This exposure already exists on every involuntary drop (reactivation took ~2 s each time; ~1.7 drops/day). A 20-minute interval would add 72 deliberate gaps/day, about 40× as many gaps (their length is not measured; a reconnect is typically about a second). Replies are rare, so the absolute chance of hitting a gap is low, but a missed reply (e.g. an unsubscribe) would sit unprocessed until the next message arrives.
* Saving the outbound workflow while active re-registers its triggers (a brief reconnect of the same kind). Do it when no campaign run is in progress.

## Recommendation

**Do not apply 15–20 minutes** on current evidence. Rely on the error notifier for the noise. If you still want to try it, use the procedure below and keep it only if drops fall clearly.

## Safe test and rollback (do not duplicate the workflow)

Never test on a copy: two active IMAP triggers on one mailbox would both process every reply (double replies, double unsubscribes).

1. **Baseline**: 24 drops / 14 days (~1.7/day). No campaign running; pick a quiet period.
2. **Apply** in the n8n editor on the live node (value 20), Save. Expect "Activation of workflow … was successful!" in the n8n log.
3. **Watch 24 h**: `docker logs -t n8n-n8n-1 | grep "Hostinger Email Trigger"`. Success = no new `failed with the error` at the 20-minute marks. (Forced reconnects are debug-level, so silence is expected.)
4. **Reply continuity** (you send it, not automation): from an external address send one test reply to the monitored mailbox just after a 20-minute boundary and one mid-interval. Each must create an execution of the outbound workflow within about a minute.
5. **Decide after 7 days**: keep only if drops/day are materially below the ~1.7 baseline and every test reply was processed.
6. **Rollback**: remove the option (or clear it) and Save. That restores today's behaviour exactly.
