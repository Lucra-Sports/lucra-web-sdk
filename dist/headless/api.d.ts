import { type LucraAchievement, type LucraAutoJoinedTournamentsBody, type LucraCancelRecreationalGameResult, type LucraCreateRecreationalGameInput, type LucraJoinTournamentResponse, type LucraMatchup, type LucraMatchupDetails, type LucraPresentMinigameBody, type LucraPresentMinigameResponse, type LucraRecreationalGameResult, type LucraSearchMatchupsByMetadataInput, type LucraTournament, type LucraTournamentDetail, type LucraUserMatchups, type LucraUserMatchupsInput, type LucraUserMatchupsByTypeStatusInput, type LucraUserMatchupsPage, type LucraUserTournamentReward } from "../types/types.js";
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
        searchByMetadata(filters: LucraSearchMatchupsByMetadataInput): Promise<string[]>;
        list(options: LucraUserMatchupsInput): Promise<LucraUserMatchups>;
        listByTypeStatus(options: LucraUserMatchupsByTypeStatusInput): Promise<LucraUserMatchupsPage>;
        create(input: LucraCreateRecreationalGameInput): Promise<LucraRecreationalGameResult>;
        accept(matchupId: string, options?: {
            groupId?: string;
        }): Promise<LucraRecreationalGameResult>;
        cancel(matchupId: string): Promise<LucraCancelRecreationalGameResult>;
    };
    achievements: {
        list(): Promise<LucraAchievement[]>;
        claim(userAchievementId: string): Promise<void>;
        markViewed(userAchievementId: string): Promise<void>;
    };
    rewards: {
        list(filters?: {
            tournamentId?: string;
            viewed?: boolean;
            claimed?: boolean;
        }): Promise<LucraUserTournamentReward[]>;
        claim(rewardId: string): Promise<void>;
    };
    whenWriteSettled(): Promise<void>;
    startMinigame(body: LucraPresentMinigameBody): Promise<LucraPresentMinigameResponse>;
};
export declare function createApi(options: {
    session: Session;
    auth: Auth;
    activity: Activity;
    requestMs: number;
}): Api;
