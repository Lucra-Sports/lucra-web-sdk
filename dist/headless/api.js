import { LucraClientMessageType, MessageTypeToLucraClient, } from "../types/types.js";
import { LucraError, LucraErrorCode } from "./errors.js";
const read = (type, responseType) => ({ type, responseType, kind: "read" });
const write = (type, responseType, unknownOnApiError) => ({ type, responseType, kind: "write", unknownOnApiError });
const SPECS = {
    tournamentsList: read(MessageTypeToLucraClient.tournamentsRequest, LucraClientMessageType.tournamentsResponse),
    tournamentsGet: read(MessageTypeToLucraClient.tournamentRequest, LucraClientMessageType.tournamentResponse),
    tournamentsLeaderboard: read(MessageTypeToLucraClient.tournamentLeaderboardRequest, LucraClientMessageType.tournamentLeaderboardResponse),
    // A failed tournament join is safe to try again, so API_ERROR is not "unknown".
    tournamentsJoin: write(MessageTypeToLucraClient.joinTournamentRequest, LucraClientMessageType.joinTournamentResponse, false),
    tournamentsAutoJoin: write(MessageTypeToLucraClient.autoJoinTournamentsRequest, LucraClientMessageType.autoJoinedTournaments, false),
    matchupsGet: read(MessageTypeToLucraClient.matchupRequest, LucraClientMessageType.matchupResponse),
    matchupsGetDetails: read(MessageTypeToLucraClient.matchupDetailsRequest, LucraClientMessageType.matchupDetailsResponse),
    matchupsSearchByMetadata: read(MessageTypeToLucraClient.searchMatchupsByMetadataRequest, LucraClientMessageType.searchMatchupsByMetadataResponse),
    matchupsList: read(MessageTypeToLucraClient.userMatchupsRequest, LucraClientMessageType.userMatchupsResponse),
    matchupsListByTypeStatus: read(MessageTypeToLucraClient.userMatchupsByTypeStatusRequest, LucraClientMessageType.userMatchupsByTypeStatusResponse),
    // For these three a plain API_ERROR may mean the write still went through.
    matchupsCreate: write(MessageTypeToLucraClient.createRecreationalGameRequest, LucraClientMessageType.createRecreationalGameResponse, true),
    matchupsAccept: write(MessageTypeToLucraClient.acceptRecreationalGameRequest, LucraClientMessageType.acceptRecreationalGameResponse, true),
    matchupsCancel: write(MessageTypeToLucraClient.cancelRecreationalGameRequest, LucraClientMessageType.cancelRecreationalGameResponse, true),
    achievementsList: read(MessageTypeToLucraClient.achievementsRequest, LucraClientMessageType.achievementsResponse),
    // Sent as a read: it is safe to repeat, and a host may mark many at once, so it
    // must not wait for or block a write.
    achievementsMarkViewed: read(MessageTypeToLucraClient.markAchievementViewedRequest, LucraClientMessageType.markAchievementViewedResponse),
    rewardsList: read(MessageTypeToLucraClient.userTournamentRewardsRequest, LucraClientMessageType.userTournamentRewardsResponse),
    // For these two a plain API_ERROR may mean the claim still went through.
    achievementsClaim: write(MessageTypeToLucraClient.claimAchievementRequest, LucraClientMessageType.claimAchievementResponse, true),
    rewardsClaim: write(MessageTypeToLucraClient.claimTournamentRewardRequest, LucraClientMessageType.claimTournamentRewardResponse, true),
};
export function createApi(options) {
    const { session, auth, activity } = options;
    // The one write slot. Set while a write is pending, whatever its kind.
    let writeSettled = null;
    const send = async (spec, body, needsLogin) => {
        await session.whenConnected();
        if (needsLogin)
            await auth.whenLoggedIn();
        return session.request(spec, body);
    };
    const sendWrite = (spec, body) => {
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
            list: () => send(SPECS.tournamentsList, null, false).then((r) => r.tournaments),
            get: (tournamentId) => send(SPECS.tournamentsGet, { matchupId: tournamentId }, true).then((r) => r.tournament),
            leaderboard: (tournamentId, page) => send(SPECS.tournamentsLeaderboard, { matchupId: tournamentId, limit: page?.limit, offset: page?.offset }, true).then((r) => r.ui_tournament_details),
            join: (tournamentId) => sendWrite(SPECS.tournamentsJoin, { matchupId: tournamentId }),
            autoJoin: () => sendWrite(SPECS.tournamentsAutoJoin, null),
        },
        matchups: {
            get: (matchupId) => send(SPECS.matchupsGet, { matchupId }, false),
            getDetails: (matchupId) => send(SPECS.matchupsGetDetails, { matchupId }, false),
            searchByMetadata: (filters) => send(SPECS.matchupsSearchByMetadata, filters, true).then((r) => r.matchupIds),
            list: (options) => send(SPECS.matchupsList, options, true),
            listByTypeStatus: (options) => send(SPECS.matchupsListByTypeStatus, options, true),
            create: (input) => sendWrite(SPECS.matchupsCreate, input),
            accept: (matchupId, acceptOptions) => sendWrite(SPECS.matchupsAccept, acceptOptions?.groupId !== undefined
                ? { matchupId, playStyle: "GROUP_VS_GROUP", teamId: acceptOptions.groupId }
                : { matchupId, playStyle: "FREE_FOR_ALL" }),
            cancel: (matchupId) => sendWrite(SPECS.matchupsCancel, { matchupId }),
        },
        achievements: {
            list: () => send(SPECS.achievementsList, null, true).then((r) => r.achievements),
            claim: (userAchievementId) => sendWrite(SPECS.achievementsClaim, { userAchievementId }).then(() => undefined),
            markViewed: (userAchievementId) => send(SPECS.achievementsMarkViewed, { userAchievementId }, true).then(() => undefined),
        },
        rewards: {
            list: (filters) => send(SPECS.rewardsList, {
                matchupId: filters?.tournamentId,
                viewed: filters?.viewed,
                claimed: filters?.claimed,
            }, true).then((r) => r.rewards),
            claim: (rewardId) => sendWrite(SPECS.rewardsClaim, { rewardId }).then(() => undefined),
        },
        whenWriteSettled: () => writeSettled ?? Promise.resolve(),
    };
}
