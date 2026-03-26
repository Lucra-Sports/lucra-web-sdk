import { LucraClientBase } from "./base.js";
import { LucraClientMessageType, MessageTypeToLucraClient, } from "./types/types.js";
export class LucraClient extends LucraClientBase {
    static instance = null;
    listenerMap = new Map();
    matchupInviteUrlTransformer;
    constructor(config) {
        super(config);
    }
    _eventListener = async (event) => {
        if (!this.urlOrigin || event.origin !== this.urlOrigin)
            return;
        if (!event.data || typeof event.data !== 'object')
            return;
        if (event.data.type === LucraClientMessageType.matchupInviteUrl) {
            if (!this.matchupInviteUrlTransformer) {
                console.warn("matchupDeepLinkHandler not configured, falling back to deepLink");
                return;
            }
            try {
                const urlResult = await this.matchupInviteUrlTransformer(event.data.data.matchupId);
                if (!urlResult || urlResult.trim() === "") {
                    console.warn("matchupDeepLinkHandler returned empty, falling back to deepLink");
                    return;
                }
                this._matchupInviteUrlResponse({ url: urlResult });
            }
            catch (e) {
                console.error("matchupDeepLinkHandler threw an error", e);
            }
            return;
        }
        this.dispatchEvent(new CustomEvent(event.data.type, { detail: event.data.data }));
    };
    on(type, listener) {
        const wrapped = (e) => listener(e.detail);
        if (!this.listenerMap.has(type)) {
            this.listenerMap.set(type, new Map());
        }
        this.listenerMap.get(type).set(listener, wrapped);
        this.addEventListener(type, wrapped);
        if (type === "exitLucra") {
            this._sendMessage({
                type: MessageTypeToLucraClient.enableExitLucra,
                body: true,
            });
        }
    }
    off(type, listener) {
        const wrapped = this.listenerMap.get(type)?.get(listener);
        if (wrapped) {
            this.removeEventListener(type, wrapped);
            this.listenerMap.get(type)?.delete(listener);
        }
    }
    setMatchupDeepLinkHandler(transformer) {
        this.matchupInviteUrlTransformer = transformer;
    }
    static initialize(config) {
        if (LucraClient.instance) {
            throw new Error("LucraClient is already initialized. Call LucraClient.getInstance() to retrieve the existing instance.");
        }
        LucraClient.instance = new LucraClient(config);
        return LucraClient.instance;
    }
    static getInstance() {
        if (!LucraClient.instance) {
            throw new Error("LucraClient has not been initialized. Call LucraClient.initialize(config) first.");
        }
        return LucraClient.instance;
    }
    static destroy() {
        if (LucraClient.instance) {
            LucraClient.instance.listenerMap.forEach((listeners, type) => {
                listeners.forEach((wrapped) => {
                    LucraClient.instance.removeEventListener(type, wrapped);
                });
            });
            LucraClient.instance.listenerMap.clear();
            LucraClient.instance.close();
            LucraClient.instance = null;
        }
    }
}
