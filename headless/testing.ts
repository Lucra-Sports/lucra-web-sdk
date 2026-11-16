import type { LucraPopupHandle } from "../popup.js";
import type { LucraPopupResult } from "../types/types.js";
import type { Frame, InboundMessage, OutboundMessage, Overlay } from "./frame.js";

export type FakePopup = {
  url: string;
  closed: boolean;
  // The user closed the popup window by hand.
  userClose(): void;
};

// A Frame with no DOM. Tests drive it by hand.
export type FakeFrame = Frame & {
  // Every URL passed to mount() and reload(), in order.
  urls: string[];
  // Every message passed to post(), in order.
  posted: OutboundMessage[];
  overlayOpen: boolean;
  overlaysOpened: number;
  popups: FakePopup[];
  // When true, openPopup throws like a blocked popup.
  blockPopups: boolean;
  destroyed: boolean;
  // Simulates a message from the Lucra app.
  deliver(type: string, data?: unknown, requestId?: string): void;
  // The most recent posted message of this type.
  lastPosted(type: string): OutboundMessage | undefined;
  // Answers the most recent posted request of `requestType` with its requestId.
  answer(requestType: string, responseType: string, data: unknown): void;
};

export function createFakeFrame(): FakeFrame {
  const listeners = new Set<(message: InboundMessage) => void>();
  // The overlay on show. Closing an older one late leaves it open.
  let currentOverlay: Overlay | null = null;

  const frame: FakeFrame = {
    urls: [],
    posted: [],
    overlayOpen: false,
    overlaysOpened: 0,
    popups: [],
    blockPopups: false,
    destroyed: false,

    mount(url) {
      frame.urls.push(url);
    },
    reload(url) {
      frame.urls.push(url);
    },
    post(message) {
      frame.posted.push(message);
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    openOverlay() {
      frame.overlayOpen = true;
      frame.overlaysOpened += 1;
      const overlay: Overlay = {
        close() {
          if (currentOverlay !== overlay) return;
          currentOverlay = null;
          frame.overlayOpen = false;
        },
      };
      currentOverlay = overlay;
      return overlay;
    },
    openPopup(url) {
      if (frame.blockPopups) throw new Error("Popup blocked");
      const callbacks = new Set<(result?: LucraPopupResult) => void>();
      let result: LucraPopupResult | undefined;
      const record: FakePopup = {
        url,
        closed: false,
        userClose() {
          handle.close();
        },
      };
      const handle: LucraPopupHandle = {
        close() {
          if (record.closed) return;
          record.closed = true;
          callbacks.forEach((callback) => callback(result));
          callbacks.clear();
        },
        onClose(callback) {
          callbacks.add(callback);
        },
        resolve(value) {
          result = value;
          handle.close();
        },
      };
      frame.popups.push(record);
      return handle;
    },
    destroy() {
      frame.destroyed = true;
      frame.overlayOpen = false;
      currentOverlay = null;
      listeners.clear();
    },

    deliver(type, data, requestId) {
      for (const listener of [...listeners]) listener({ type, data, requestId });
    },
    lastPosted(type) {
      for (let i = frame.posted.length - 1; i >= 0; i -= 1) {
        if (frame.posted[i].type === type) return frame.posted[i];
      }
      return undefined;
    },
    answer(requestType, responseType, data) {
      const request = frame.lastPosted(requestType);
      if (!request || request.requestId === undefined) {
        throw new Error(`No posted ${requestType} request to answer`);
      }
      frame.deliver(responseType, data, request.requestId);
    },
  };

  return frame;
}
