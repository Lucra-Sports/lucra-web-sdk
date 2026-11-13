// A small typed event emitter. `on` returns the function that removes the listener.
export type Emitter<TEvents> = {
  on<K extends keyof TEvents>(
    type: K,
    listener: (data: TEvents[K]) => void
  ): () => void;
  emit<K extends keyof TEvents>(type: K, data: TEvents[K]): void;
  clear(): void;
};

export function createEmitter<TEvents>(): Emitter<TEvents> {
  const listeners = new Map<keyof TEvents, Set<(data: never) => void>>();

  return {
    on(type, listener) {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(listener as (data: never) => void);
      return () => {
        listeners.get(type)?.delete(listener as (data: never) => void);
      };
    },
    emit(type, data) {
      const set = listeners.get(type);
      if (!set) return;
      // Copy first so a listener that unsubscribes during emit does not skip others.
      for (const listener of [...set]) {
        try {
          (listener as (data: unknown) => void)(data);
        } catch (e) {
          // One failing listener must not stop the rest or break message routing.
          console.error("Lucra listener threw an error", e);
        }
      }
    },
    clear() {
      listeners.clear();
    },
  };
}
