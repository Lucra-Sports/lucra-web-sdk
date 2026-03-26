import { LucraClientBase } from "./base.js";
import { type LucraEventMap, type LucraMatchupInviteUrlTransformer, type LucraClientConstructor } from "./types/types.js";
export declare class LucraClient extends LucraClientBase {
    private static instance;
    private listenerMap;
    private matchupInviteUrlTransformer?;
    private constructor();
    protected _eventListener: (event: MessageEvent<any>) => Promise<void>;
    on<K extends keyof LucraEventMap>(type: K, listener: (data: LucraEventMap[K]) => void): void;
    off<K extends keyof LucraEventMap>(type: K, listener: (data: LucraEventMap[K]) => void): void;
    setMatchupDeepLinkHandler(transformer: LucraMatchupInviteUrlTransformer): void;
    static initialize(config: LucraClientConstructor): LucraClient;
    static getInstance(): LucraClient;
    static destroy(): void;
}
