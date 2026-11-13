import { type LucraAchievement, type LucraAutoJoinedTournamentsBody, type LucraCancelRecreationalGameResult, type LucraCreateRecreationalGameInput, type LucraJoinTournamentResponse, type LucraMatchup, type LucraMatchupDetails, type LucraRecreationalGameResult, type LucraTournament, type LucraTournamentDetail } from "../types/types.js";
import type { Auth } from "./auth.js";
import type { Session } from "./session.js";
export type Activity = {
    screenOpen: boolean;
};
export type Api = {
    tournaments: {
        list(): Promise<LucraTournament[]>;
        get(tournamentId: string): Promise<LucraTournamentDetail | null>;
        leaderboard(tournamentId: string, page?: {
            limit?: number;
            offset?: number;
        }): Promise<LucraTournamentDetail | null>;
        join(tournamentId: string): Promise<LucraJoinTournamentResponse>;
        autoJoin(): Promise<LucraAutoJoinedTournamentsBody>;
    };
    matchups: {
        get(matchupId: string): Promise<LucraMatchup>;
        getDetails(matchupId: string): Promise<LucraMatchupDetails>;
        create(input: LucraCreateRecreationalGameInput): Promise<LucraRecreationalGameResult>;
        accept(matchupId: string, options?: {
            groupId?: string;
        }): Promise<LucraRecreationalGameResult>;
        cancel(matchupId: string): Promise<LucraCancelRecreationalGameResult>;
    };
    achievements: {
        list(): Promise<LucraAchievement[]>;
    };
    whenWriteSettled(): Promise<void>;
};
export declare function createApi(options: {
    session: Session;
    auth: Auth;
    activity: Activity;
}): Api;
