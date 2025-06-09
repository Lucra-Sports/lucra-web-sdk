import {
  type LucraClientSendMessage,
  type LucraConvertToCreditBody,
  type LucraDeepLinkBody,
  type LucraMatchupAcceptedBody,
  type LucraMatchupCanceledBody,
  type LucraMatchupCreatedBody,
  type LucraNavigationEventBody,
  type LucraTournamentJoinedBody,
  type LucraUserInfoBody,
  type StateCode,
  type StateFull,
  type LucraClientConstructor,
} from "./types/types.js";
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
  matchupDetails: (matchupId: string, teamInvitedId?: string) => LucraClient;
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
  constructor({ tenantId, env, onMessage }: LucraClientConstructor);
  set deepLinkHandler(handlerFn: (data: LucraDeepLinkBody) => void);
  set userInfoHandler(handlerFn: (data: LucraUserInfoBody) => void);
  set matchupCreatedHandler(handlerFn: (data: LucraMatchupCreatedBody) => void);
  set matchupAcceptedHandler(
    handlerFn: (data: LucraMatchupAcceptedBody) => void
  );
  set matchupCanceledHandler(
    handlerFn: (data: LucraMatchupCanceledBody) => void
  );
  set tournamentJoinedHandler(
    handlerFn: (data: LucraTournamentJoinedBody) => void
  );
  set navigationEventHandler(
    handlerFn: (data: LucraNavigationEventBody) => void
  );
  set convertToCreditHandler(
    handlerFn: (data: LucraConvertToCreditBody) => void
  );
  private _open;
  private _redirect;
  /**
   * Redirect an open LucraClient
   */
  redirect(): LucraNavigation;
  /**
   * Open Lucra in an iframe
   * @param element parent element to contain the LucraClient iframe
   */
  open(
    element: HTMLElement,
    phoneNumber?: string
  ): {
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
    matchupDetails: (matchupId: string, teamInvitedId?: string) => LucraClient;
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
  /**
   * Close iframe and stop listening to any messages sent from LucraClient
   */
  close(): void;
  private _sendMessage;
  /**
   * Send a message to LucraClient
   */
  sendMessage: LucraClientSendMessage;
}
export default LucraClient;
