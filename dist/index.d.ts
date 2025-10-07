import { type LucraClientSendMessage, type LucraConvertToCreditBody, type LucraDeepLinkBody, type LucraMatchupAcceptedBody, type LucraMatchupCanceledBody, type LucraMatchupCreatedBody, type LucraNavigationEventBody, type LucraTournamentJoinedBody, type LucraUserInfoBody, type StateCode, type StateFull, type LucraClientConstructor, type LucraClaimRewardBody, type LucraMatchupStartedBody, type LucraLoginSuccessBody, type LucraActiveMatchupStartedBody, type MatchupInviteUrlTransformer } from "./types/types.js";
export declare const LucraClientIframeId = "__lucrasports__";
export declare const States: {
    state: StateFull;
    code: StateCode;
}[];
type LucraNavigation = {
    /**
     * Open directly to the user's profile page
     */
    profile: () => LucraClient;
    /**
     * Open to the home page
     */
    home: (locationId?: string) => LucraClient;
    /**
     * Open directly into add funds
     */
    deposit: () => LucraClient;
    /**
     * Open directly into withdraw funds
     */
    withdraw: () => LucraClient;
    /**
     * Open directly into create matchup flow. If gameId is provided, the game selection screen will be skipped.
     */
    createMatchup: (gameId?: string) => LucraClient;
    /**
     * Open directly to a matchup where the user can accept, cancel, or wager on the matchup.
     */
    matchupDetails: (matchupId: string) => LucraClient;
    /**
     * Open directly to a tournament where the user can join.
     */
    tournamentDetails: (matchupId: string) => LucraClient;
    /**
     * Open directly to the deep link
     * @param url deepLink url
     */
    deepLink: (url: string) => LucraClient;
};
export declare class LucraClient {
    private iframe?;
    private tenantId;
    private env;
    private urlOrigin;
    private url;
    private messages;
    private locationId;
    private onExitLucra;
    private onMessage;
    private controller;
    private iframeParentElement?;
    private iframeUrlOrigin;
    private _eventListener;
    private setUpEventListener;
    /**
     * Create a new instance of LucraClient
     * @param tenantId Your Lucra tenantId
     * @param env sandbox | production
     * @param onMessage Message Handler for messages from LucraClient
     */
    constructor({ env, locationId, onMessage, tenantId, }: LucraClientConstructor);
    set loginSuccessHandler(handlerFn: (data: LucraLoginSuccessBody) => void);
    /**
     * @deprecated Use matchupDeepLinkHandler instead.
     * The deepLinkHandler method is being phased out in favor of the more specific
     * matchupDeepLinkHandler which provides better clarity for matchup invitations.
     */
    set deepLinkHandler(handlerFn: (data: LucraDeepLinkBody) => void);
    set matchupDeepLinkHandler(transformer: MatchupInviteUrlTransformer);
    set userInfoHandler(handlerFn: (data: LucraUserInfoBody) => void);
    set matchupCreatedHandler(handlerFn: (data: LucraMatchupCreatedBody) => void);
    set activeMatchupStartedHandler(handlerFn: (data: LucraActiveMatchupStartedBody) => void);
    set matchupStartedHandler(handlerFn: (data: LucraMatchupStartedBody) => void);
    set matchupAcceptedHandler(handlerFn: (data: LucraMatchupAcceptedBody) => void);
    set matchupCanceledHandler(handlerFn: (data: LucraMatchupCanceledBody) => void);
    set tournamentJoinedHandler(handlerFn: (data: LucraTournamentJoinedBody) => void);
    set navigationEventHandler(handlerFn: (data: LucraNavigationEventBody) => void);
    set convertToCreditHandler(handlerFn: (data: LucraConvertToCreditBody) => void);
    set claimReward(handlerFn: (data: LucraClaimRewardBody) => void);
    set exitLucraHandler(handlerFn: () => void);
    private _open;
    private _redirect;
    /**
     * Force a user to logout
     */
    logout(): LucraClient;
    /**
     * Redirect an open LucraClient
     */
    redirect(): LucraNavigation;
    /**
     * Open Lucra in an iframe
     * @param element parent element to contain the LucraClient iframe
     * @param phoneNumber optional phone number to prefill and auto-send verification SMS
     */
    open(element: HTMLElement, phoneNumber?: string): LucraNavigation;
    /**
     * Close iframe and stop listening to any messages sent from LucraClient
     */
    close(): void;
    private _sendMessage;
    private _matchupInviteUrlResponse;
    /**
     * Send a message to LucraClient
     */
    sendMessage: LucraClientSendMessage;
}
export default LucraClient;
