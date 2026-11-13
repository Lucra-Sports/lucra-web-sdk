export type Emitter<TEvents> = {
    on<K extends keyof TEvents>(type: K, listener: (data: TEvents[K]) => void): () => void;
    emit<K extends keyof TEvents>(type: K, data: TEvents[K]): void;
    clear(): void;
};
export declare function createEmitter<TEvents>(): Emitter<TEvents>;
