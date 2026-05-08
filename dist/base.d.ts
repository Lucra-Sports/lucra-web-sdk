import { type LucraClientSendMessage, type LucraDeepLinkResponse, type LucraClientConstructor, type LucraAchievementsResponse, type SDKLucraUser, type LucraStartMinigamesSessionResponse, type LucraInitializedBody } from "./types/types.js";
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
type TriggerHandle = {
    iframe: HTMLIFrameElement;
    resolve: (response: LucraStartMinigamesSessionResponse) => void;
    reject: (reason?: unknown) => void;
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
    private achievementsResolve;
    private achievementsReject;
    private achievementsTimer;
    protected triggerFrames: Map<Window, TriggerHandle>;
    protected _user: SDKLucraUser | null;
    protected _isInitialized: boolean;
    private _readyResolve;
    private _readyReject;
    private _readyPromise;
    private _createReadyPromise;
    get ready(): Promise<void>;
    get isInitialized(): boolean;
    get user(): SDKLucraUser | null;
    private iframeUrlOrigin;
    protected _eventListener: (_event: MessageEvent<any>) => Promise<void>;
    private setUpEventListener;
    constructor({ apiKey, tenantId, env, locationId, }: LucraClientConstructor);
    private _buildIframeUrl;
    private _open;
    private _minigamesTrigger;
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
    private _clearAchievements;
    protected _resolveAchievements(data: LucraAchievementsResponse): void;
    protected _resolveTrigger(win: Window, data: LucraStartMinigamesSessionResponse): boolean;
    protected _handleInitialized(body: LucraInitializedBody): void;
    protected _handleUserInfo(body: SDKLucraUser): void;
    api: {
        achievements: () => Promise<LucraAchievementsResponse>;
    };
    sendMessage: LucraClientSendMessage;
}
export {};
