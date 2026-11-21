# Copilot instructions: react-native-sip-voice

## Always read first
- End-to-end call design: docs/architecture/end-to-end-calls.md. Call state, answer gate, status-code mapping,
  rating and native bridge changes must match it.

## Rules
- Source of truth is src/. The app vendors a copy at vendors/react-native-sip-voice; sync it and check diff -rq.
- SIP mapping (src/core/utils.ts): 486/600/603 -> busy; 403 -> rejected; 408 and 480/404/410/484/503 -> unavailable.
- An incoming call that cannot get a signalling session ends (finish("failed")); it never throws and never leaves the native screen connected.
- Rate a call only when it connected (answeredAt set).
- Tests: npx jest. Every change needs a test.
