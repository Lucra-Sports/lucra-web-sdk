import {
  LucraClientMessageType,
  MessageTypeToLucraClient,
  type LucraAchievement,
  type LucraAchievementsResponse,
  type LucraAutoJoinedTournamentsBody,
  type LucraClaimAchievementBody,
  type LucraClaimTournamentRewardBody,
  type LucraClaimAchievementResult,
  type LucraClaimTournamentRewardResult,
  type LucraCancelRecreationalGameResult,
  type LucraCreateRecreationalGameInput,
  type LucraJoinTournamentResponse,
  type LucraMarkAchievementViewedBody,
  type LucraMarkAchievementViewedResult,
  type LucraMatchup,
  type LucraMatchupDetails,
  type LucraPresentMinigameBody,
  type LucraPresentMinigameResponse,
  type LucraRecreationalGameResult,
  type LucraSearchMatchupsByMetadataInput,
  type LucraSearchMatchupsByMetadataResponse,
  type LucraTournament,
  type LucraTournamentDetail,
  type LucraTournamentLeaderboardResponse,
  type LucraTournamentResponse,
  type LucraTournamentsResponse,
  type LucraUpdateUserBody,
  type LucraUpdateUserResult,
  type LucraUserMatchups,
  type LucraUserMatchupsInput,
  type LucraUserMatchupsByTypeStatusInput,
  type LucraUserMatchupsPage,
  type LucraUserTournamentReward,
  type LucraUserTournamentRewardsInput,
  type LucraUserTournamentRewardsResponse,
} from "../types/types.js";
import type { Auth } from "./auth.js";
import { LucraError, LucraErrorCode, invalid, isLucraError } from "./errors.js";
import type { RequestSpec } from "./requests.js";
import type { Session } from "./session.js";
import type { LucraUpdateUserInput } from "./types.js";

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
  matchupsList: read<LucraUserMatchups>(
    MessageTypeToLucraClient.userMatchupsRequest,
    LucraClientMessageType.userMatchupsResponse
  ),
  matchupsListByTypeStatus: read<LucraUserMatchupsPage>(
    MessageTypeToLucraClient.userMatchupsByTypeStatusRequest,
    LucraClientMessageType.userMatchupsByTypeStatusResponse
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
  // Sent as a read: it is safe to repeat, and a host may mark many at once, so it
  // must not wait for or block a write.
  achievementsMarkViewed: read<LucraMarkAchievementViewedResult>(
    MessageTypeToLucraClient.markAchievementViewedRequest,
    LucraClientMessageType.markAchievementViewedResponse
  ),
  // Sent as a read: saving the same details again is safe, so it must not wait
  // for or block a write, and it is not refused while a Lucra screen shows.
  authUpdateUser: read<LucraUpdateUserResult>(
    MessageTypeToLucraClient.updateUserRequest,
    LucraClientMessageType.updateUserResponse
  ),
  rewardsList: read<LucraUserTournamentRewardsResponse>(
    MessageTypeToLucraClient.userTournamentRewardsRequest,
    LucraClientMessageType.userTournamentRewardsResponse
  ),
  // For these two a plain API_ERROR may mean the claim still went through.
  achievementsClaim: write<LucraClaimAchievementResult>(
    MessageTypeToLucraClient.claimAchievementRequest,
    LucraClientMessageType.claimAchievementResponse,
    true
  ),
  rewardsClaim: write<LucraClaimTournamentRewardResult>(
    MessageTypeToLucraClient.claimTournamentRewardRequest,
    LucraClientMessageType.claimTournamentRewardResponse,
    true
  ),
  // A stake may be placed, so a plain API_ERROR leaves the outcome unknown.
  presentMinigame: write<LucraPresentMinigameResponse>(
    MessageTypeToLucraClient.presentMinigameRequest,
    LucraClientMessageType.presentMinigameResponse,
    true
  ),
};

const USER_FIELDS = ["username", "avatarURL", "phoneNumber", "email", "firstName", "lastName"] as const;
const ADDRESS_FIELDS = ["address", "addressCont", "city", "state", "zip"] as const;

// Copies only the given fields that are set. A host may pass its own user
// object, which can hold fields that are not Lucra's to see.
const pick = <T extends object, K extends keyof T>(from: T, keys: readonly K[]) => {
  const picked: Partial<Pick<T, K>> = {};
  for (const key of keys) if (from[key] != null) picked[key] = from[key];
  return picked;
};

// The first of these fields that is given and is not a string. With this check
// every value sent is a string, so an object a host passes by mistake under a
// known key never reaches Lucra, and the message can always be copied to the frame.
const notText = <T extends object>(from: T, keys: readonly (keyof T)[]) =>
  keys.find((key) => from[key] != null && typeof from[key] !== "string");

const isObject = (value: unknown): value is object =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export type Api = {
  auth: {
    updateUser(details: LucraUpdateUserInput): Promise<void>;
  };
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
    list(options: LucraUserMatchupsInput): Promise<LucraUserMatchups>;
    listByTypeStatus(
      options: LucraUserMatchupsByTypeStatusInput
    ): Promise<LucraUserMatchupsPage>;
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
  // Resolves when no write is pending. Never rejects.
  whenWriteSettled(): Promise<void>;
  // Not public. lucra.present.minigame() starts the game with it, through the
  // write slot. The screen is marked open already, so that is not refused.
  startMinigame(body: LucraPresentMinigameBody): Promise<LucraPresentMinigameResponse>;
};

export function createApi(options: {
  session: Session;
  auth: Auth;
  activity: Activity;
  // How long a call waits for its answer, a resent read included.
  requestMs: number;
}): Api {
  const { session, auth, activity, requestMs } = options;
  // The one write slot. Set while a write is pending, whatever its kind.
  let writeSettled: Promise<void> | null = null;
  // True while the pending write is a screen's own, such as a minigame start.
  let screenWrite = false;

  const ready = async (needsLogin: boolean) => {
    await session.whenConnected();
    if (needsLogin) await auth.whenLoggedIn();
  };

  // Like ready(), but rejects TIMEOUT at the deadline.
  const readyBy = async (needsLogin: boolean, deadline: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const outOfTime = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new LucraError(LucraErrorCode.TIMEOUT)),
        deadline - Date.now()
      );
    });
    try {
      await Promise.race([ready(needsLogin), outOfTime]);
    } finally {
      clearTimeout(timer);
    }
  };

  const send = async <TResponse>(
    spec: RequestSpec<TResponse>,
    body: unknown,
    needsLogin: boolean
  ): Promise<TResponse> => {
    await ready(needsLogin);
    const deadline = Date.now() + requestMs;
    try {
      return await session.request(spec, body);
    } catch (error) {
      if (
        spec.kind !== "read" ||
        !isLucraError(error) ||
        error.code !== LucraErrorCode.CONNECTION_RESET
      ) {
        throw error;
      }
    }
    // Lucra restarted, so the read was lost. Send it once more, with a new
    // request id, in what is left of the time it had. A second restart rejects.
    await readyBy(needsLogin, deadline);
    // A late timer, for example in a throttled background tab, can let the
    // wait end after the deadline. Then there is no time left to send it.
    const left = deadline - Date.now();
    if (left <= 0) throw new LucraError(LucraErrorCode.TIMEOUT);
    return session.request(spec, body, left);
  };

  // `forScreen`: the write a lucra.present screen makes for itself.
  const sendWrite = <TResponse>(
    spec: RequestSpec<TResponse>,
    body: unknown,
    forScreen = false
  ): Promise<TResponse> => {
    // These three checks run before the first await, so a double click is
    // refused instead of sending the write twice.
    if (session.status() === "destroyed") {
      return Promise.reject(new LucraError(LucraErrorCode.DESTROYED));
    }
    if (writeSettled) {
      // A screen's own write counts as the screen while the screen is open.
      return Promise.reject(
        new LucraError(
          screenWrite && activity.screenOpen ? LucraErrorCode.SCREEN_OPEN : LucraErrorCode.IN_PROGRESS
        )
      );
    }
    if (activity.screenOpen && !forScreen) {
      return Promise.reject(new LucraError(LucraErrorCode.SCREEN_OPEN));
    }
    const run = send(spec, body, true);
    // Registered before the caller can attach to `run`, so the slot is free by
    // the time the caller's own code continues.
    const free = () => {
      writeSettled = null;
      screenWrite = false;
    };
    writeSettled = run.then(free, free);
    screenWrite = forScreen;
    return run;
  };

  return {
    auth: {
      // The hints never hold a value, because these are personal details. A
      // field that is null is left out, like one that is not given.
      updateUser: (details) => {
        if (!isObject(details)) {
          return invalid("lucra.auth.updateUser() takes an object of user details.");
        }
        const { address, metadata } = details;
        if (address != null && !isObject(address)) {
          return invalid("address must be an object.");
        }
        const field =
          notText(details, USER_FIELDS) ?? (address != null ? notText(address, ADDRESS_FIELDS) : undefined);
        if (field !== undefined) return invalid(`${field} must be a string.`);
        if (
          metadata != null &&
          (!isObject(metadata) || Object.values(metadata).some((v) => typeof v !== "string"))
        ) {
          return invalid("metadata must be an object of strings, or null.");
        }
        const body: LucraUpdateUserBody = pick(details, USER_FIELDS);
        if (address != null) body.address = pick(address, ADDRESS_FIELDS);
        if (metadata != null) body.metadata = { ...metadata };
        return send(SPECS.authUpdateUser, body, true).then(() => undefined);
      },
    },
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
      list: (options) => send(SPECS.matchupsList, options, true),
      listByTypeStatus: (options) =>
        send(SPECS.matchupsListByTypeStatus, options, true),
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
        sendWrite(
          SPECS.achievementsClaim,
          { userAchievementId } satisfies LucraClaimAchievementBody
        ).then(() => undefined),
      markViewed: (userAchievementId) =>
        send(
          SPECS.achievementsMarkViewed,
          { userAchievementId } satisfies LucraMarkAchievementViewedBody,
          true
        ).then(() => undefined),
    },
    rewards: {
      list: (filters) =>
        send(
          SPECS.rewardsList,
          {
            matchupId: filters?.tournamentId,
            viewed: filters?.viewed,
            claimed: filters?.claimed,
          } satisfies LucraUserTournamentRewardsInput,
          true
        ).then((r) => r.rewards),
      claim: (rewardId) =>
        sendWrite(SPECS.rewardsClaim, { rewardId } satisfies LucraClaimTournamentRewardBody).then(() => undefined),
    },
    whenWriteSettled: () => writeSettled ?? Promise.resolve(),
    startMinigame: (body) => sendWrite(SPECS.presentMinigame, body, true),
  };
}
