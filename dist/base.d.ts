import { type LucraClientSendMessage, type LucraDeepLinkResponse, type LucraClientConstructor } from "./types/types.js";
type LucraNavigation = {
    profile: () => LucraClientBase;
    home: (locationId?: string) => LucraClientBase;
    deposit: () => LucraClientBase;
    withdraw: () => LucraClientBase;
    createMatchup: (gameId?: string) => LucraClientBase;
    matchupDetails: (matchupId: string) => LucraClientBase;
    tournamentDetails: (matchupId: string) => LucraClientBase;
    deepLink: (url: string) => LucraClientBase;
};
export declare class LucraClientBase extends EventTarget {
    private iframe?;
    private apiKey;
    private tenantId;
    private env;
    protected urlOrigin: string;
    private url;
    private messages;
    private locationId;
    private controller;
    private iframeUrlOrigin;
    protected _eventListener: (_event: MessageEvent<any>) => Promise<void>;
    private setUpEventListener;
    constructor({ apiKey, tenantId, env, locationId, }: LucraClientConstructor);
    private _open;
    private _redirect;
    logout(): LucraClientBase;
    redirect(): LucraNavigation;
    open(element: HTMLElement, phoneNumber?: string, options?: {
        hidden?: boolean;
    }): LucraNavigation;
    close(): void;
    moveTo(element: HTMLElement): LucraClientBase;
    hide(): LucraClientBase;
    show(): LucraClientBase;
    protected _sendMessage(message: any): this;
    protected _matchupInviteUrlResponse(data: LucraDeepLinkResponse): void;
    sendMessage: LucraClientSendMessage;
}
export {};
