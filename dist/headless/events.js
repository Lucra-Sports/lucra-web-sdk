export function createEmitter() {
    const listeners = new Map();
    return {
        on(type, listener) {
            let set = listeners.get(type);
            if (!set) {
                set = new Set();
                listeners.set(type, set);
            }
            set.add(listener);
            return () => {
                listeners.get(type)?.delete(listener);
            };
        },
        emit(type, data) {
            const set = listeners.get(type);
            if (!set)
                return;
            // Copy first so a listener that unsubscribes during emit does not skip others.
            for (const listener of [...set]) {
                try {
                    listener(data);
                }
                catch (e) {
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
