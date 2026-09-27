export interface Subscription {
  unsubscribe(): void;
}

export type Listener<T> = (value: T) => void;

/**
 * Minimal read-only observable of a current value (BehaviorSubject semantics).
 * Subscribers receive the current value immediately, then every change.
 */
export interface ReadonlyValueStream<T> {
  readonly value: T;
  subscribe(listener: Listener<T>): Subscription;
}

/** Writable {@link ReadonlyValueStream}. Kept dependency-free so the package does not pull in RxJS. */
export class ValueStream<T> implements ReadonlyValueStream<T> {
  private listeners = new Set<Listener<T>>();

  constructor(private current: T) {}

  get value(): T {
    return this.current;
  }

  next(value: T): void {
    if (Object.is(value, this.current)) return;
    this.current = value;
    // Copy so listeners can unsubscribe while being notified.
    for (const listener of [...this.listeners]) {
      listener(value);
    }
  }

  subscribe(listener: Listener<T>): Subscription {
    this.listeners.add(listener);
    listener(this.current);
    return { unsubscribe: () => this.listeners.delete(listener) };
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  asReadonly(): ReadonlyValueStream<T> {
    return this;
  }
}

/** Typed event emitter for one-shot events (no current value). */
export class EventEmitter<Events extends Record<string, unknown>> {
  private handlers: { [K in keyof Events]?: Set<(payload: Events[K]) => void> } = {};

  on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): Subscription {
    const set = (this.handlers[event] ??= new Set());
    set.add(handler);
    return { unsubscribe: () => set.delete(handler) };
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers[event];
    if (!set) return;
    for (const handler of [...set]) handler(payload);
  }

  removeAll(): void {
    this.handlers = {};
  }
}
