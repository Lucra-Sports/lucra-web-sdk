import {
  LucraClientMessageType,
  MessageTypeToLucraClient,
  type LucraAchievement,
  type LucraAchievementsResponse,
  type LucraAutoJoinedTournamentsBody,
  type LucraClaimAchievementResult,
  type LucraClaimTournamentRewardResult,
  type LucraCancelRecreationalGameResult,
  type LucraCreateRecreationalGameInput,
  type LucraJoinTournamentResponse,
  type LucraMatchup,
  type LucraMatchupDetails,
  type LucraRecreationalGameResult,
  type LucraSearchMatchupsByMetadataInput,
  type LucraSearchMatchupsByMetadataResponse,
  type LucraTournament,
  type LucraTournamentDetail,
  type LucraTournamentLeaderboardResponse,
  type LucraTournamentResponse,
  type LucraTournamentsResponse,
  type LucraUserTournamentReward,
  type LucraUserTournamentRewardsResponse,
} from "../types/types.js";
import type { Auth } from "./auth.js";
import { LucraError, LucraErrorCode } from "./errors.js";
import type { RequestSpec } from "./requests.js";
import type { Session } from "./session.js";

// Shared between the data calls and lucra.present. A write and a visible Lucra
// screen both navigate the Lucra app, so they must never overlap.
export type Activity = {
  // True from the moment a screen is asked for until it has closed.
  screenOpen: boolean;
};

const read = <TResponse>(
  type: MessageTypeToLucraClient,
  responseType: LucraClientMessageType
): RequestSpec<TResponse> => ({ type, responseType, kind: "read" });

const write = <TResponse>(
  type: MessageTypeToLucraClient,
  responseType: LucraClientMessageType,
  unknownOnApiError: boolean
): RequestSpec<TResponse> => ({ type, responseType, kind: "write", unknownOnApiError });

const SPECS = {
  tournamentsList: read<LucraTournamentsResponse>(
    MessageTypeToLucraClient.tournamentsRequest,
    LucraClientMessageType.tournamentsResponse
  ),
  tournamentsGet: read<LucraTournamentResponse>(
    MessageTypeToLucraClient.tournamentRequest,
    LucraClientMessageType.tournamentResponse
  ),
  tournamentsLeaderboard: read<LucraTournamentLeaderboardResponse>(
    MessageTypeToLucraClient.tournamentLeaderboardRequest,
    LucraClientMessageType.tournamentLeaderboardResponse
  ),
  // A failed tournament join is safe to try again, so API_ERROR is not "unknown".
  tournamentsJoin: write<LucraJoinTournamentResponse>(
    MessageTypeToLucraClient.joinTournamentRequest,
    LucraClientMessageType.joinTournamentResponse,
    false
  ),
  tournamentsAutoJoin: write<LucraAutoJoinedTournamentsBody>(
    MessageTypeToLucraClient.autoJoinTournamentsRequest,
    LucraClientMessageType.autoJoinedTournaments,
    false
  ),
  matchupsGet: read<LucraMatchup>(
    MessageTypeToLucraClient.matchupRequest,
    LucraClientMessageType.matchupResponse
  ),
  matchupsGetDetails: read<LucraMatchupDetails>(
    MessageTypeToLucraClient.matchupDetailsRequest,
    LucraClientMessageType.matchupDetailsResponse
  ),
  matchupsSearchByMetadata: read<LucraSearchMatchupsByMetadataResponse>(
    MessageTypeToLucraClient.searchMatchupsByMetadataRequest,
    LucraClientMessageType.searchMatchupsByMetadataResponse
  ),
  // For these three a plain API_ERROR may mean the write still went through.
  matchupsCreate: write<LucraRecreationalGameResult>(
    MessageTypeToLucraClient.createRecreationalGameRequest,
    LucraClientMessageType.createRecreationalGameResponse,
    true
  ),
  matchupsAccept: write<LucraRecreationalGameResult>(
    MessageTypeToLucraClient.acceptRecreationalGameRequest,
    LucraClientMessageType.acceptRecreationalGameResponse,
    true
  ),
  matchupsCancel: write<LucraCancelRecreationalGameResult>(
    MessageTypeToLucraClient.cancelRecreationalGameRequest,
    LucraClientMessageType.cancelRecreationalGameResponse,
    true
  ),
  achievementsList: read<LucraAchievementsResponse>(
    MessageTypeToLucraClient.achievementsRequest,
    LucraClientMessageType.achievementsResponse
  ),
  // A plain API_ERROR means the claim did not happen.
  achievementsClaim: write<LucraClaimAchievementResult>(
    MessageTypeToLucraClient.claimAchievementRequest,
    LucraClientMessageType.claimAchievementResponse,
    false
  ),
  rewardsList: read<LucraUserTournamentRewardsResponse>(
    MessageTypeToLucraClient.userTournamentRewardsRequest,
    LucraClientMessageType.userTournamentRewardsResponse
  ),
  // A plain API_ERROR means the claim did not happen.
  rewardsClaim: write<LucraClaimTournamentRewardResult>(
    MessageTypeToLucraClient.claimTournamentRewardRequest,
    LucraClientMessageType.claimTournamentRewardResponse,
    false
  ),
};

export type Api = {
  tournaments: {
    list(): Promise<LucraTournament[]>;
    get(tournamentId: string): Promise<LucraTournamentDetail | null>;
    leaderboard(
      tournamentId: string,
      page?: { limit?: number; offset?: number }
    ): Promise<LucraTournamentDetail | null>;
    join(tournamentId: string): Promise<LucraJoinTournamentResponse>;
    autoJoin(): Promise<LucraAutoJoinedTournamentsBody>;
  };
  matchups: {
    get(matchupId: string): Promise<LucraMatchup>;
    getDetails(matchupId: string): Promise<LucraMatchupDetails>;
    searchByMetadata(filters: LucraSearchMatchupsByMetadataInput): Promise<string[]>;
    create(input: LucraCreateRecreationalGameInput): Promise<LucraRecreationalGameResult>;
    accept(
      matchupId: string,
      options?: { groupId?: string }
    ): Promise<LucraRecreationalGameResult>;
    cancel(matchupId: string): Promise<LucraCancelRecreationalGameResult>;
  };
  achievements: {
    list(): Promise<LucraAchievement[]>;
    claim(userAchievementId: string): Promise<void>;
  };
  rewards: {
    list(filters?: {
      tournamentId?: string;
      viewed?: boolean;
      claimed?: boolean;
    }): Promise<LucraUserTournamentReward[]>;
    claim(rewardId: string): Promise<void>;
  };
  // Resolves when no write is pending. Never rejects.
  whenWriteSettled(): Promise<void>;
};

export function createApi(options: {
  session: Session;
  auth: Auth;
  activity: Activity;
}): Api {
  const { session, auth, activity } = options;
  // The one write slot. Set while a write is pending, whatever its kind.
  let writeSettled: Promise<void> | null = null;

  const send = async <TResponse>(
    spec: RequestSpec<TResponse>,
    body: unknown,
    needsLogin: boolean
  ): Promise<TResponse> => {
    await session.whenConnected();
    if (needsLogin) await auth.whenLoggedIn();
    return session.request(spec, body);
  };

  const sendWrite = <TResponse>(
    spec: RequestSpec<TResponse>,
    body: unknown
  ): Promise<TResponse> => {
    // These three checks run before the first await, so a double click is
    // refused instead of sending the write twice.
    if (session.status() === "destroyed") {
      return Promise.reject(new LucraError(LucraErrorCode.DESTROYED));
    }
    if (writeSettled) {
      return Promise.reject(new LucraError(LucraErrorCode.IN_PROGRESS));
    }
    if (activity.screenOpen) {
      return Promise.reject(new LucraError(LucraErrorCode.SCREEN_OPEN));
    }
    const run = send(spec, body, true);
    // Registered before the caller can attach to `run`, so the slot is free by
    // the time the caller's own code continues.
    const free = () => {
      writeSettled = null;
    };
    writeSettled = run.then(free, free);
    return run;
  };

  return {
    tournaments: {
      list: () =>
        send(SPECS.tournamentsList, null, false).then((r) => r.tournaments),
      get: (tournamentId) =>
        send(SPECS.tournamentsGet, { matchupId: tournamentId }, true).then(
          (r) => r.tournament
        ),
      leaderboard: (tournamentId, page) =>
        send(
          SPECS.tournamentsLeaderboard,
          { matchupId: tournamentId, limit: page?.limit, offset: page?.offset },
          true
        ).then((r) => r.ui_tournament_details),
      join: (tournamentId) =>
        sendWrite(SPECS.tournamentsJoin, { matchupId: tournamentId }),
      autoJoin: () => sendWrite(SPECS.tournamentsAutoJoin, null),
    },
    matchups: {
      get: (matchupId) => send(SPECS.matchupsGet, { matchupId }, false),
      getDetails: (matchupId) =>
        send(SPECS.matchupsGetDetails, { matchupId }, false),
      searchByMetadata: (filters) =>
        send(SPECS.matchupsSearchByMetadata, filters, true).then((r) => r.matchupIds),
      create: (input) => sendWrite(SPECS.matchupsCreate, input),
      accept: (matchupId, acceptOptions) =>
        sendWrite(
          SPECS.matchupsAccept,
          acceptOptions?.groupId !== undefined
            ? { matchupId, playStyle: "GROUP_VS_GROUP", teamId: acceptOptions.groupId }
            : { matchupId, playStyle: "FREE_FOR_ALL" }
        ),
      cancel: (matchupId) => sendWrite(SPECS.matchupsCancel, { matchupId }),
    },
    achievements: {
      list: () =>
        send(SPECS.achievementsList, null, true).then((r) => r.achievements),
      claim: (userAchievementId) =>
        sendWrite(SPECS.achievementsClaim, { userAchievementId }).then(() => undefined),
    },
    rewards: {
      list: (filters) =>
        send(
          SPECS.rewardsList,
          {
            matchupId: filters?.tournamentId,
            viewed: filters?.viewed,
            claimed: filters?.claimed,
          },
          true
        ).then((r) => r.rewards),
      claim: (rewardId) =>
        sendWrite(SPECS.rewardsClaim, { rewardId }).then(() => undefined),
    },
    whenWriteSettled: () => writeSettled ?? Promise.resolve(),
  };
}
