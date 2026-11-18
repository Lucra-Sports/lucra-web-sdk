import type { LucraEnvironment, LucraMatchupDetails, SDKLucraUser } from "../types/types.js";
import type { LucraError } from "./errors.js";
export type { LucraEnvironment, LucraAchievement, LucraTournament, LucraTournamentDetail, LucraTournamentLeaderboard, LucraLeaderboardRow, LucraLeaderboardColumn, LucraLeaderboardPagination, LucraTournamentTimer, LucraTournamentGame, LucraTournamentHowToPlayStep, LucraTournamentConfirmationTerm, LucraTournamentNotice, LucraTournamentAttemptScores, LucraTournamentAttemptData, LucraTournamentCatalogReward, LucraTournamentEarnedReward, LucraTournamentPayoutReward, LucraTournamentPayoutStructure, LucraJoinTournamentResponse, LucraAutoJoinedTournamentsBody, LucraMatchup, LucraMatchupStatus, LucraPlayStyle, LucraAtStake, LucraCashStake, LucraRecreationalGame, LucraMatchupParticipantGroup, LucraMatchupDetails, LucraMatchupGroup, LucraMatchupParticipant, LucraMatchupParticipantScore, LucraCreateRecreationalGameInput, LucraRecreationalGameResult, LucraCancelRecreationalGameResult, LucraSearchMatchupsByMetadataInput, LucraReward, } from "../types/types.js";
export type LucraUser = SDKLucraUser;
export type LucraClientConfig = {
    apiKey: string;
    tenantId: string;
    env: LucraEnvironment;
    locationId?: string;
    autoJoin?: boolean;
    container?: HTMLElement;
};
export type LucraAuthStatus = "loading" | "loggedOut" | "loggedIn";
export type LucraAuthState = {
    readonly status: LucraAuthStatus;
    readonly user: LucraUser | null;
};
export type LucraPresentResult = {
    status: "completed";
} | {
    status: "dismissed";
};
export type LucraLoginResult = {
    status: "completed";
    user: LucraUser;
} | {
    status: "dismissed";
};
export type LucraAddFundsResult = {
    status: "completed";
    message: string;
} | {
    status: "failed";
    message: string;
} | {
    status: "dismissed";
};
export type LucraMatchupWatchHandlers = {
    onUpdate: (details: LucraMatchupDetails) => void;
    onError?: (error: LucraError) => void;
};
export type LucraMatchupWatch = {
    stop: () => void;
};
export type LucraHeadlessEventMap = {
    matchupCreated: {
        matchupId: string;
    };
    matchupAccepted: {
        matchupId: string;
    };
    matchupStarted: {
        matchupId: string;
    };
    matchupCanceled: {
        matchupId: string;
    };
    activeMatchupStarted: {
        matchupId: string;
    };
    tournamentJoined: {
        matchupId: string;
    };
    autoJoinedTournaments: {
        matchupIds: string[];
    };
};
