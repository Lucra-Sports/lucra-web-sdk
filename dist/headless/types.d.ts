import type { LucraEnvironment, LucraMatchupDetails, LucraMinigameMode, LucraReward, SDKClientUser, SDKLucraUser } from "../types/types.js";
import type { LucraError } from "./errors.js";
export type { LucraEnvironment, LucraAchievement, LucraTournament, LucraTournamentDetail, LucraTournamentLeaderboard, LucraLeaderboardRow, LucraLeaderboardColumn, LucraLeaderboardPagination, LucraTournamentTimer, LucraTournamentGame, LucraTournamentHowToPlayStep, LucraTournamentConfirmationTerm, LucraTournamentNotice, LucraTournamentAttemptScores, LucraTournamentAttemptData, LucraTournamentCatalogReward, LucraTournamentEarnedReward, LucraTournamentPayoutReward, LucraTournamentPayoutStructure, LucraJoinTournamentResponse, LucraAutoJoinedTournamentsBody, LucraMatchup, LucraMatchupStatus, LucraPlayStyle, LucraAtStake, LucraCashStake, LucraRecreationalGame, LucraMatchupParticipantGroup, LucraMatchupDetails, LucraMatchupGroup, LucraMatchupParticipant, LucraMatchupParticipantScore, LucraCreateRecreationalGameInput, LucraRecreationalGameResult, LucraCancelRecreationalGameResult, LucraSearchMatchupsByMetadataInput, LucraUserMatchups, LucraUserMatchupsGroup, LucraUserMatchupsPage, LucraUserMatchup, LucraUserMatchupType, LucraUserMatchupStatus, LucraUserMatchupsInput, LucraUserMatchupsByTypeStatusInput, LucraUserTournamentReward, LucraReward, LucraMinigameMode, LucraMinigame, LucraMinigameOption, } from "../types/types.js";
export type LucraUser = SDKLucraUser;
export type LucraUpdateUserInput = SDKClientUser;
export type LucraPresentation = "fullScreen" | "modal" | "sheet" | "bottomSheet";
export type LucraClientConfig = {
    apiKey: string;
    tenantId: string;
    env: LucraEnvironment;
    locationId?: string;
    autoJoin?: boolean;
    presentation?: LucraPresentation;
};
export type LucraAuthStatus = "loading" | "loggedOut" | "loggedIn";
export type LucraAuthState = {
    readonly status: LucraAuthStatus;
    readonly user: LucraUser | null;
};
export type LucraPresentOptions = {
    signal?: AbortSignal;
    presentation?: LucraPresentation;
};
export type LucraLoginOptions = LucraPresentOptions & {
    phoneNumber?: string;
};
export type LucraDismissReason = "exit" | "dismissed" | "replaced" | "loggedOut" | "destroyed" | "aborted" | "restarted";
export type LucraPresentResult = {
    status: "completed";
} | {
    status: "dismissed";
    reason: LucraDismissReason;
};
export type LucraLoginResult = {
    status: "completed";
    user: LucraUser;
} | {
    status: "dismissed";
    reason: LucraDismissReason;
};
export type LucraMinigameInput = {
    gameId: string;
    mode: LucraMinigameMode;
    amount?: number;
    matchupId?: string;
    signal?: AbortSignal;
    presentation?: LucraPresentation;
};
export type LucraMinigameResult = {
    status: "completed";
    sessionId: string;
    matchupId: string | null;
} | {
    status: "dismissed";
    reason: LucraDismissReason;
    sessionId: string | null;
    matchupId: string | null;
};
export type LucraAddFundsResult = {
    status: "completed";
    message: string;
} | {
    status: "failed";
    message: string;
} | {
    status: "dismissed";
} | {
    status: "alreadyOpen";
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
    claimReward: {
        reward: LucraReward;
    };
};
