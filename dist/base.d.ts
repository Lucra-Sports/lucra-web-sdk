import { type LucraClientSendMessage, type LucraDeepLinkResponse, type LucraClientConstructor, type LucraAchievementsResponse, type LucraTournamentsResponse, type LucraTournamentResponse, type LucraTournamentLeaderboardResponse, type LucraAutoJoinedTournamentsBody, type LucraJoinTournamentResponse, type LucraApiErrorBody, type LucraIsLoggedInResponse, type SDKLucraUser, type LucraMinigamesTriggerInput, type LucraStartMinigamesSessionResponse, type LucraInitializedBody, type LucraDialog, type LucraPopup, type LucraPopupResult } from "./types/types.js";
type LucraNavigation = {
    profile: () => LucraClientBase;
    wallet: () => LucraClientBase;
    home: (locationId?: string) => LucraClientBase;
    /**
     * @deprecated Add Funds must run in a popup (Apple Pay does not run in a
     * cross-origin iframe). Use popup().deposit() from a user gesture.
     */
    deposit: () => LucraClientBase;
    withdraw: () => LucraClientBase;
    createMatchup: (gameId?: string) => LucraClientBase;
    matchupDetails: (matchupId: string) => LucraClientBase;
    tournamentDetails: (matchupId: string) => LucraClientBase;
    deepLink: (url: string) => LucraClientBase;
    kyc: () => LucraClientBase;
    demographic: () => LucraClientBase;
    locationGrant: () => LucraClientBase;
};
type LucraOpenNavigation = LucraNavigation & {
    minigamesTrigger: (input: LucraMinigamesTriggerInput) => Promise<LucraStartMinigamesSessionResponse>;
    login: () => LucraClientBase;
};
type LucraDialogNavigation = {
    profile: () => LucraDialog;
    wallet: () => LucraDialog;
    home: (locationId?: string) => LucraDialog;
    /**
     * @deprecated Add Funds must run in a popup (Apple Pay does not run in a
     * cross-origin iframe). Use popup().deposit() from a user gesture.
     */
    deposit: () => LucraDialog;
    withdraw: () => LucraDialog;
    createMatchup: (gameId?: string) => LucraDialog;
    matchupDetails: (matchupId: string) => LucraDialog;
    tournamentDetails: (matchupId: string) => LucraDialog;
    deepLink: (url: string) => LucraDialog;
    kyc: () => LucraDialog;
    demographic: () => LucraDialog;
    locationGrant: () => LucraDialog;
};
type LucraPopupNavigation = {
    deposit: () => LucraPopup;
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
    private autoJoin;
    private controller;
    private _achievementsRequest;
    private _tournamentsRequest;
    private _tournamentRequest;
    private _tournamentLeaderboardRequest;
    private _joinTournamentRequest;
    private _autoJoinTournamentsRequest;
    private _isLoggedInRequest;
    protected triggerFrames: Map<Window, TriggerHandle>;
    protected _user: SDKLucraUser | null;
    protected _isInitialized: boolean;
    private _host;
    private _activeDialog;
    private _activePopup;
    private _warnedDeprecations;
    private _readyResolve;
    private _readyReject;
    private _initializedPromise;
    private _readyPromise;
    private _createInitializedPromise;
    private _createReadyPromise;
    private _assertLoggedIn;
    get ready(): Promise<void>;
    get isInitialized(): boolean;
    get user(): SDKLucraUser | null;
    private iframeUrlOrigin;
    protected _eventListener: (_event: MessageEvent<any>) => Promise<void>;
    private setUpEventListener;
    constructor({ apiKey, tenantId, env, locationId, autoJoin, }: LucraClientConstructor);
    private _buildIframeUrl;
    private _open;
    private _minigamesTrigger;
    private _assertOpen;
    private _warnDeprecated;
    private _redirect;
    logout(): LucraClientBase;
    redirect(): LucraNavigation;
    dialog(): LucraDialogNavigation;
    private _presentDialog;
    protected _closeActiveDialog(): boolean;
    popup(): LucraPopupNavigation;
    private _presentPopup;
    protected _resolveActivePopup(result: LucraPopupResult): void;
    open(element: HTMLElement, phoneNumber?: string, options?: {
        hidden?: boolean;
    }): LucraOpenNavigation;
    close(): void;
    /**
     * @deprecated Re-parenting the iframe reloads it, losing page state and any
     * in-flight request. Keep it in one container and use show()/hide(), or dialog().
     */
    moveTo(element: HTMLElement): LucraClientBase;
    hide(): LucraClientBase;
    show(): LucraClientBase;
    protected _sendMessage(message: any): this;
    protected _matchupInviteUrlResponse(data: LucraDeepLinkResponse): void;
    protected _resolveAchievements(data: LucraAchievementsResponse): void;
    protected _resolveTournaments(data: LucraTournamentsResponse): void;
    protected _resolveTournament(data: LucraTournamentResponse): void;
    protected _resolveTournamentLeaderboard(data: LucraTournamentLeaderboardResponse): void;
    protected _resolveJoinTournament(data: LucraJoinTournamentResponse): void;
    protected _rejectJoinTournament(body: LucraApiErrorBody): void;
    protected _resolveAutoJoinTournaments(data: LucraAutoJoinedTournamentsBody): void;
    protected _rejectAutoJoinTournaments(body: LucraApiErrorBody): void;
    protected _resolveIsLoggedIn(data: LucraIsLoggedInResponse): void;
    protected _resolveTrigger(win: Window, data: LucraStartMinigamesSessionResponse): boolean;
    protected _handleInitialized(body: LucraInitializedBody): void;
    protected _handleUserInfo(body: SDKLucraUser): void;
    protected _handleLoginSuccess(): void;
    api: {
        achievements: () => Promise<LucraAchievementsResponse>;
        tournaments: () => Promise<LucraTournamentsResponse>;
        tournament: (matchupId: string) => Promise<LucraTournamentResponse>;
        tournamentLeaderboard: (matchupId: string, pagination?: {
            limit?: number;
            offset?: number;
        }) => Promise<LucraTournamentLeaderboardResponse>;
        joinTournament: (tournamentId: string) => Promise<LucraJoinTournamentResponse>;
        autoJoinTournaments: () => Promise<LucraAutoJoinedTournamentsBody>;
    };
    sendMessage: LucraClientSendMessage;
}
export {};
