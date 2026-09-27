import { EventEmitter, ValueStream } from "../../src/core/observable";

describe("ValueStream", () => {
  it("emits the current value on subscribe and every change", () => {
    const s = new ValueStream(1);
    const seen: number[] = [];
    s.subscribe((v) => seen.push(v));
    s.next(2);
    s.next(3);
    expect(seen).toEqual([1, 2, 3]);
    expect(s.value).toBe(3);
  });

  it("does not emit when the value is unchanged", () => {
    const s = new ValueStream("a");
    const fn = jest.fn();
    s.subscribe(fn);
    s.next("a");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after unsubscribe", () => {
    const s = new ValueStream(0);
    const fn = jest.fn();
    const sub = s.subscribe(fn);
    sub.unsubscribe();
    s.next(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(s.listenerCount).toBe(0);
  });

  it("tolerates listeners unsubscribing during notification", () => {
    const s = new ValueStream(0);
    const second = jest.fn();
    const sub = s.subscribe((v) => {
      if (v === 1) sub.unsubscribe();
    });
    s.subscribe(second);
    s.next(1);
    s.next(2);
    expect(second).toHaveBeenLastCalledWith(2);
  });
});

describe("EventEmitter", () => {
  it("delivers events to handlers until removed", () => {
    const e = new EventEmitter<{ ping: number }>();
    const fn = jest.fn();
    const sub = e.on("ping", fn);
    e.emit("ping", 1);
    sub.unsubscribe();
    e.emit("ping", 2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
  });

  it("removeAll clears every handler", () => {
    const e = new EventEmitter<{ a: void }>();
    const fn = jest.fn();
    e.on("a", fn);
    e.removeAll();
    e.emit("a", undefined);
    expect(fn).not.toHaveBeenCalled();
  });
});
