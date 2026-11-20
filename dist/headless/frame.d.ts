import { type LucraPopupHandle } from "../popup.js";
import { type MessageTypeToLucraClient } from "../types/types.js";
import type { LucraPresentation } from "./types.js";
export type OutboundMessage = {
    type: MessageTypeToLucraClient;
    body: unknown;
    requestId?: string;
};
export type InboundMessage = {
    type: string;
    data: unknown;
    requestId?: string;
};
export type Overlay = {
    close(): void;
};
export type Popup = LucraPopupHandle & {
    focus(): boolean;
};
export type Frame = {
    mount(url: string): void;
    reload(url: string): void;
    post(message: OutboundMessage): void;
    onMessage(listener: (message: InboundMessage) => void): () => void;
    openOverlay(presentation?: LucraPresentation): Overlay;
    openPopup(url: string): Popup;
    destroy(): void;
};
export declare function hasDom(): boolean;
export declare function pageOrigin(): string;
export declare function createNullFrame(): Frame;
export declare const PRESENTATIONS: readonly LucraPresentation[];
export declare function createDomFrame(origin: string, container?: HTMLElement): Frame;
