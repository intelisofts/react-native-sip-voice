import { untilIncomingCallsEnd } from "../../src/native/incomingCallTask";

type Snapshot = { outgoing: boolean };

function fakeNative(initial: Snapshot[]) {
  let calls = initial;
  const listeners = new Set<() => void>();
  return {
    getCalls: jest.fn(async () => calls as any),
    addListener: jest.fn((_e: "callStateChanged", l: () => void) => {
      listeners.add(l);
      return { remove: () => listeners.delete(l) };
    }),
    set(next: Snapshot[]) {
      calls = next;
      listeners.forEach((l) => l());
    },
    listenerCount: () => listeners.size,
  };
}

const flush = () => new Promise((r) => setImmediate(r));

describe("untilIncomingCallsEnd", () => {
  it("stays running while an incoming call is live and ends when it is over", async () => {
    const native = fakeNative([{ outgoing: false }]);
    let ended = false;
    void untilIncomingCallsEnd(native).then(() => (ended = true));
    await flush();
    expect(ended).toBe(false);
    native.set([]);
    await flush();
    expect(ended).toBe(true);
    expect(native.listenerCount()).toBe(0);
  });

  it("ends at once when there is no incoming call (an outgoing paid call does not keep it)", async () => {
    await expect(untilIncomingCallsEnd(fakeNative([{ outgoing: true }]))).resolves.toBeUndefined();
  });

  it("ends when the native module or getCalls is missing", async () => {
    await expect(untilIncomingCallsEnd(null)).resolves.toBeUndefined();
  });
});

describe("runIncomingCallTask", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { runIncomingCallTask } = require("../../src/native/incomingCallTask");

  it("starts the call handling first, then runs until the call is over", async () => {
    const native = fakeNative([{ outgoing: false }]);
    const onIncomingCall = jest.fn();
    let ended = false;
    void runIncomingCallTask(native, onIncomingCall).then(() => (ended = true));
    await flush();
    expect(onIncomingCall).toHaveBeenCalledTimes(1);
    expect(ended).toBe(false);
    native.set([]);
    await flush();
    expect(ended).toBe(true);
  });

  it("keeps running when the start fails, so the app's screens can still take the call", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const native = fakeNative([{ outgoing: false }]);
    let ended = false;
    void runIncomingCallTask(native, () => Promise.reject(new Error("offline"))).then(() => (ended = true));
    await flush();
    expect(ended).toBe(false);
    native.set([]);
    await flush();
    expect(ended).toBe(true);
    warn.mockRestore();
  });
});
