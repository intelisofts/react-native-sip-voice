# End-to-end calls: architecture

Single source of truth for how a Noah Call call works from the caller's screen to the callee's phone and back.
Keep it in sync with code changes. The same file is copied to the other repositories (`voip-backed`,
`react-native-sip-voice`, `sbc-config`) under `docs/architecture/`, and each has a `.github/copilot-instructions.md`
that points here.

## 1. Parts and where they live

| Part | Repo / path | Responsibility |
|---|---|---|
| App UI | `TalkPro_Intelisofts` `components/CallLauncher.tsx`, `components/CallManager.tsx`, `components/AppCallBridge.tsx` | Starts calls, shows call screens and failure messages, cancels/ends app calls on the backend |
| App services | `app/services/appCalls.ts`, `app/services/sipCredentials.ts`, `app/utils/appCallIncoming.ts` | Backend calls for free app calls (start, cancel, answer claim, decline, end, registration) |
| App failure text | `app/utils/sipCallFailure.ts` | Maps SIP status codes and end reasons to user messages |
| Status bar | `app/utils/statusBar.ts`, `app/_layout.tsx` | One rule for icon colour on every screen |
| SIP library | `react-native-sip-voice` (vendored at `vendors/react-native-sip-voice`, source of truth `~/react-native-sip-voice`) | SIP.js over WebSocket + WebRTC, call state machine, answer gate, native CallKit / ConnectionService bridge, call UI |
| Backend API | `voip-backed` `voip.host/Controllers/Apis/AppCallsApiController.cs`, `TransactionsApisController.cs`, `DeviceApiController.cs` | Auth, permissions, free call start/cancel/answer/decline/end, call history, ratings |
| Backend logic | `voip.services/Services/AppCallService.cs`, `AppCallEventService.cs`, `CallHandlerService.cs`, `CallRatingService.cs`, `AdminDashboardService.cs` | Call state machine, push decisions, phone-call billing from Telnyx webhooks, dashboard totals |
| Push | `voip.externalService/Push/PushNotifier.cs`, `ApnsVoipClient.cs`, `FcmClient.cs`, `ExpoPushClient.cs` | Wake-up and call-end pushes to phones |
| Data | `voip.data` (`CallHistories`, `AppCalls`, devices, wallets) | Durable records, one `CallHistory` row per person per free call |
| SBC | `sbc-config/sbc/next/kamailio.cfg` (new SBC); `sbc/kamailio.cfg` is the live legacy config and is never edited for these features | SIP routing, holding a call while a phone wakes, ring timeout, dialog keepalive |
| Carrier | Telnyx (paid phone calls) | Phone-network calls and their cost webhooks |

## 2. Two kinds of call

- **Free app call (Noah Call to Noah Call).** Both people use the app. Routed through the SBC over SIP. No cost, no
  wallet or plan change. Recorded as `CallHistory` rows with `CallKind = "app"` (caller leg and callee leg).
- **Paid phone call.** The app dials a phone number. The call goes through Telnyx. Billed from the Telnyx `call.cost`
  webhook (wallet debit or plan minutes). Recorded as `CallHistory` rows with `CallStatus = "call.cost"`.

The app decides which one to use per person (`/api/permissions` plus the free-calls flag). A free call that fails
can be retried as a paid phone call from the same screen.

## 3. Free app call: end to end

```mermaid
sequenceDiagram
    autonumber
    participant CA as Caller app (JS + SIP)
    participant BE as Backend (AppCallService)
    participant SBC as SBC (kamailio next)
    participant PN as Push (APNs VoIP / FCM)
    participant CE as Callee phone (CallKit / app)

    CA->>BE: POST /api/calls/app {callee}
    alt callee registered on SBC
        BE-->>CA: 200 {callId, token, sbc, calleeState: ready}
    else callee not registered but has a push address
        BE->>PN: wake-up (VoIP / FCM high priority), TTL 60 s
        BE-->>CA: 200 {callId, token, sbc, calleeState: waking}
    end
    CA->>SBC: WebSocket connect (token from this call only)
    CA->>SBC: SIP INVITE (X-Call-Id, token)
    alt callee registered
        SBC->>CE: INVITE (ring up to RING_MS = 45 s)
    else callee waking
        SBC-->>CA: 100 Waiting For Device (hold up to WAKE_SECS = 20 s)
        CE->>SBC: REGISTER (phone woke, app started)
        SBC->>CE: held INVITE delivered
    end
    CE->>BE: POST /api/calls/app/{id}/answer {deviceId} (claim)
    BE-->>CE: 204 granted (other phones get 409 / cancel push)
    CE-->>SBC: 180 Ringing (to caller) then 200 OK
    SBC-->>CA: 200 OK, media (SRTP) flows
    Note over CA,CE: Call active. Hang-up from either side sends BYE through the SBC.
    CA->>BE: POST /api/calls/app/{id}/end (either side)
    BE->>PN: call_ended (Android only; iOS is never sent a VoIP push for an ended call)
```

### Caller outcomes
- Answered: call screen shows the timer; both phones end the call through the SBC (BYE relay, socket close,
  in-dialog keepalive). The backend `end` call releases both SBC sessions.
- Not answered, callee declines: 603 → **busy** message. Not a failure.
- Callee busy on another call: 486 / 600 → **busy** message.
- Callee phone off, no internet, or ring timeout: 408 → **couldn't reach** message with "call by phone" option.
- Callee not registered and did not wake in time: 480 → **unavailable** message.
- Caller cancels before answer: `POST /api/calls/app/{id}/cancel` → callee stopped (FCM cancel on Android).
- Caller's SIP call ends unanswered for any reason: the app also sends cancel (so the callee stops ringing).

### Backend call states
`Created` → `Notifying` (callee not registered, push sent) or `Ringing` (callee registered) → `Answered` → `Ended`.
Unanswered exits: `Cancelled`, `Declined`, `NoAnswer`, `Busy`, `Blocked`, `Unavailable`. Timers: `RingSeconds` 45,
`WakeSeconds` 20 (keep equal to the SBC `RING_MS` and `WAKE_SECS`). An expired call answers `410 Ended`.

### Answer claim
Before a device answers, the app's answer gate calls `POST /api/calls/app/{id}/answer`. Only one phone wins (atomic
update). A failed or refused claim ends the call locally (`Call.answer()` never connects without the claim).

### Push rules
- VoIP push (iOS) must show a CallKit call. A stale call cannot be silently withdrawn on iOS; it is expired on the
  backend and the claim refuses it.
- FCM high-priority data (Android) for incoming calls, `call_cancelled`, and `call_ended`.
- Missed calls: Expo notification (`missed_call`).
- Pushes are never sent to tokens of devices no longer verified (`DevicePushTokens` cleared on sign-out/transfer).

## 4. Paid phone call: end to end
1. App checks `/api/permissions` (plan or balance, rate) and shows the price card when needed.
2. App connects to the SBC with the call's token and dials the number.
3. Telnyx sends webhooks. `call.cost` writes the `CallHistory` row, the wallet debit (`DetectedFromWallet`) or plan
   minutes, and the `PaymentTransaction`. The dashboard reconciles these (billing checks).
4. Call history and "Recent charges" read from `CallHistory` (`GET /api/transactions/calls`).

## 5. Call history, ratings, dashboard
- `GET /api/transactions/calls`: the user's rows (phone calls with `call.cost`, plus all app-call rows), newest first,
  up to 100. The app groups them per person (`groupByPerson`) and shows 10 at a time with "Load more".
- Rating: `POST /api/transactions/calls/rating` writes `Liked` / `RatedAt` on the caller's or callee's own latest row.
- Dashboard (admin only): billed totals use `call.cost` rows only. Free calls are counted once from the caller leg
  (`LegRole = caller`) and listed with masked destinations (`PhoneMask`: leading `+`, first and last two digits).
  Free calls never change billed totals or billing checks.

## 6. Failure handling principles
- Never leave a native call screen connected without a session: an answer that cannot connect ends the call.
- A failure is shown once: on the call screen (footer message and "call by phone"), not again on a second screen.
- 603 and 486 are busy; 408 is "couldn't reach"; 480 and similar are "unavailable". No status code is shown raw.
- Every app-call end that never connected also cancels on the backend.
- Debug logs never contain secrets or tokens; phone numbers are masked (`PhoneMask`). The one exception is the
  verification code, logged only when `ASPNETCORE_ENVIRONMENT=Development`.

## 7. Deploying changes that touch calls
- JS-only app changes: EAS Update. Native changes (library native code, Podfile, Android Kotlin): new build, and
  bump `runtimeVersion` so updates never reach old binaries.
- SBC: deploy `sbc/next` with the provisioning script (see `sbc-config/sbc/next/PROVISIONING.md`). Never edit the
  live `sbc/kamailio.cfg` for these features.
- Backend: restart the API after changes to call state or the history query.

## 8. Tests that protect this flow
- App: `__tests__/CallLauncher.test.tsx`, `sipCallFailure.test.ts`, `callHistoryItemApp.test.tsx`, `groupByPerson.test.ts`,
  `statusBar.test.ts`.
- Library: `__tests__/core/Call.test.ts`, `core/utils.test.ts`, `ui/components.test.tsx`, `sip/SipJsAdapter.test.ts`.
- Backend: `AppCallServiceTests`, `AppCallLifecycleTests`, `AppCallEventTests`, `PushNotifierTests`,
  `CallRatingServiceTests`, `CallHistoryTests`, `AdminDashboardRatingsAndFreeCallsTests`, `TransactionsApiTests`.
