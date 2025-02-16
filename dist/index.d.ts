import { type LucraSportsOnMessage, type LucraSportsSendMessage, type UserInfo } from "./types";
export declare const LucraSportsIframeId = "__lucrasports__";
export declare class LucraSports {
    private userInfo?;
    private iframe?;
    private url?;
    private messages;
    private onMessage;
    private controller;
    private iframeParentElement?;
    private _eventListener;
    private setUpEventListener;
    /**
     * Create a new instance of LucraSports
     * @param url Url for LucraSports - https://app.lucrasports.com/<tenantId>
     * @param onMessage Message Handler for messages from LucraSports
     * @param userInfo User information for pre-populating KYC flow
     * @param destination home, profile, or create-matchup
     */
    constructor({ url, onMessage, destination, userInfo, }: {
        url: string;
        onMessage: LucraSportsOnMessage;
        destination: "home" | "profile" | "create-matchup";
        userInfo?: UserInfo;
    });
    /**
     * Open LucraSports in an iframe and start listening to messages
     * @param element parent element to contain the LucraSports iframe
     */
    open(element: HTMLElement): this;
    /**
     * Close iframe and stop listening to any messages sent from LucraSports
     */
    close(): void;
    private _sendMessage;
    /**
     * Send a message to LucraSports
     */
    sendMessage: LucraSportsSendMessage;
}
export default LucraSports;
