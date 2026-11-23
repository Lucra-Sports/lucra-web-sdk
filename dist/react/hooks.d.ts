import type { LucraAuthState, LucraError, LucraLoginResult, LucraMatchupDetails, LucraMatchupWatchHandlers, LucraPresentation, LucraPresentResult, LucraPresentState, LucraScreen } from "../headless/index.js";
export declare function useLucraAuth(): LucraAuthState;
export declare function useLucraPresentState(): LucraPresentState;
export type LucraScreenOptions<TResult> = {
    presentation?: LucraPresentation;
    onClose?: (result: TResult) => void;
    onError?: (error: unknown) => void;
};
export declare function useLucraScreen(screen: "login", options?: LucraScreenOptions<LucraLoginResult> & {
    phoneNumber?: string;
}): void;
export declare function useLucraScreen(screen: Exclude<LucraScreen, "login">, options?: LucraScreenOptions<LucraPresentResult>): void;
export declare function useLucraScreen(screen: LucraScreen, options?: LucraScreenOptions<LucraLoginResult | LucraPresentResult>): void;
export type LucraMatchupWatchState = {
    readonly details: LucraMatchupDetails | null;
    readonly error: LucraError | null;
};
export type LucraMatchupWatchOptions = Partial<LucraMatchupWatchHandlers>;
export declare function useMatchupWatch(matchupId: string, options?: LucraMatchupWatchOptions): LucraMatchupWatchState;
