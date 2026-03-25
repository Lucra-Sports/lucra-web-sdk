import { LucraClientBase } from "./base.js";
import {
  LucraClientMessageType,
  MessageTypeToLucraClient,
  type LucraEventMap,
  type LucraMatchupInviteUrlTransformer,
  type LucraV1ClientConstructor,
} from "./types/types.js";

export class LucraClient extends LucraClientBase {
  private static instance: LucraClient | null = null;
  private listenerMap = new Map<string, Map<Function, EventListener>>();
  private matchupInviteUrlTransformer?: LucraMatchupInviteUrlTransformer;

  private constructor(config: LucraV1ClientConstructor) {
    super(config);
  }

  protected override _eventListener = async (event: MessageEvent<any>) => {
    if (!this.urlOrigin || event.origin !== this.urlOrigin) return;
    if (!event.data || typeof event.data !== 'object') return;
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
      } catch (e) {
        console.error("matchupDeepLinkHandler threw an error", e);
      }
      return;
    }
    this.dispatchEvent(new CustomEvent(event.data.type, { detail: event.data.data }));
  };

  on<K extends keyof LucraEventMap>(
    type: K,
    listener: (data: LucraEventMap[K]) => void
  ): void {
    const wrapped: EventListener = (e) =>
      listener((e as CustomEvent<LucraEventMap[K]>).detail);
    if (!this.listenerMap.has(type)) {
      this.listenerMap.set(type, new Map());
    }
    this.listenerMap.get(type)!.set(listener, wrapped);
    this.addEventListener(type, wrapped);

    if (type === "exitLucra") {
      this._sendMessage({
        type: MessageTypeToLucraClient.enableExitLucra,
        body: true,
      });
    }
  }

  off<K extends keyof LucraEventMap>(
    type: K,
    listener: (data: LucraEventMap[K]) => void
  ): void {
    const wrapped = this.listenerMap.get(type)?.get(listener);
    if (wrapped) {
      this.removeEventListener(type, wrapped);
      this.listenerMap.get(type)?.delete(listener);
    }
  }

  setMatchupDeepLinkHandler(transformer: LucraMatchupInviteUrlTransformer): void {
    this.matchupInviteUrlTransformer = transformer;
  }

  static initialize(config: LucraV1ClientConstructor): LucraClient {
    if (LucraClient.instance) {
      throw new Error(
        "LucraClient is already initialized. Call LucraClient.getInstance() to retrieve the existing instance."
      );
    }
    LucraClient.instance = new LucraClient(config);
    return LucraClient.instance;
  }

  static getInstance(): LucraClient {
    if (!LucraClient.instance) {
      throw new Error(
        "LucraClient has not been initialized. Call LucraClient.initialize(config) first."
      );
    }
    return LucraClient.instance;
  }

  static destroy(): void {
    if (LucraClient.instance) {
      LucraClient.instance.listenerMap.forEach((listeners, type) => {
        listeners.forEach((wrapped) => {
          LucraClient.instance!.removeEventListener(type, wrapped);
        });
      });
      LucraClient.instance.listenerMap.clear();
      LucraClient.instance.close();
      LucraClient.instance = null;
    }
  }
}
