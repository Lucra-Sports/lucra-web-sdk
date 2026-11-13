export type LucraEnvironment =
  | "local"
  | "dev1"
  | "dev2"
  | "staging"
  | "sandbox"
  | "production";

// postMessage envelopes between the SDK and the web-app iframe:
// - SDK -> web-app: { type: MessageTypeToLucraClient, body, requestId? }. Every api.*
//   request carries a string requestId; fire-and-forget messages carry none.
// - web-app -> SDK: { type: LucraClientMessageType, data, requestId? }. A response or
//   apiRequestError echoes the requestId of the request it answers; events carry none.
// requestId lives on the envelope, never inside a body type.
export enum LucraClientMessageType {
  achievementsResponse = "achievementsResponse",
  activeMatchupStarted = "activeMatchupStarted",
  apiRequestError = "apiRequestError",
  autoJoinedTournaments = "autoJoinedTournaments",
  autoJoinTournamentsError = "autoJoinTournamentsError",
  claimReward = "claimReward",
  convertToCredit = "convertToCredit",
  deepLink = "deepLink",
  demographicComplete = "demographicComplete",
  exitLucra = "exitLucra",
  kycComplete = "kycComplete",
  locationGranted = "locationGranted",
  loginSuccess = "loginSuccess",
  logoutComplete = "logoutComplete",
  matchupAccepted = "matchupAccepted",
  matchupCanceled = "matchupCanceled",
  matchupCreated = "matchupCreated",
  matchupInviteUrl = "matchupInviteUrl",
  matchupStarted = "matchupStarted",
  navigationEvent = "navigationEvent",
  startMinigamesSessionResponse = "startMinigamesSessionResponse",
  tournamentJoined = "tournamentJoined",
  tournamentsResponse = "tournamentsResponse",
  tournamentResponse = "tournamentResponse",
  tournamentLeaderboardResponse = "tournamentLeaderboardResponse",
  joinTournamentResponse = "joinTournamentResponse",
  joinTournamentError = "joinTournamentError",
  userInfo = "userInfo",
  initialized = "initialized",
  isLoggedInResponse = "isLoggedInResponse",
  matchupResponse = "matchupResponse",
  matchupDetailsResponse = "matchupDetailsResponse",
  subscribeMatchupDetailsResponse = "subscribeMatchupDetailsResponse",
  matchupDetailsUpdated = "matchupDetailsUpdated",
  createRecreationalGameResponse = "createRecreationalGameResponse",
  acceptRecreationalGameResponse = "acceptRecreationalGameResponse",
  cancelRecreationalGameResponse = "cancelRecreationalGameResponse",
  gameTypesResponse = "gameTypesResponse",
  minigamesResponse = "minigamesResponse",
  userMatchupsResponse = "userMatchupsResponse",
  submitTournamentScoreResponse = "submitTournamentScoreResponse",
  enterRecreationalGameOutcomeResponse = "enterRecreationalGameOutcomeResponse",
  termsAccepted = "termsAccepted",
}

export enum MessageTypeToLucraClient {
  achievementsRequest = "achievementsRequest",
  autoJoinTournamentsRequest = "autoJoinTournamentsRequest",
  availableRewards = "availableRewards",
  clientUserInfo = "clientUserInfo",
  convertToCreditResponse = "convertToCreditResponse",
  deepLinkResponse = "deepLinkResponse",
  matchupInviteUrlResponse = "matchupInviteUrlResponse",
  enableConvertToCredit = "enableConvertToCredit",
  enableExitLucra = "enableExitLucra",
  navigate = "navigate",
  tournamentsRequest = "tournamentsRequest",
  tournamentRequest = "tournamentRequest",
  tournamentLeaderboardRequest = "tournamentLeaderboardRequest",
  joinTournamentRequest = "joinTournamentRequest",
  isLoggedInRequest = "isLoggedInRequest",
  matchupRequest = "matchupRequest",
  matchupDetailsRequest = "matchupDetailsRequest",
  subscribeMatchupDetailsRequest = "subscribeMatchupDetailsRequest",
  cancelMatchupDetailsSubscription = "cancelMatchupDetailsSubscription",
  createRecreationalGameRequest = "createRecreationalGameRequest",
  acceptRecreationalGameRequest = "acceptRecreationalGameRequest",
  cancelRecreationalGameRequest = "cancelRecreationalGameRequest",
  sdkDiagnostic = "sdkDiagnostic",
  gameTypesRequest = "gameTypesRequest",
  minigamesRequest = "minigamesRequest",
  userMatchupsRequest = "userMatchupsRequest",
  submitTournamentScoreRequest = "submitTournamentScoreRequest",
  enterRecreationalGameOutcomeRequest = "enterRecreationalGameOutcomeRequest",
  // Fire-and-forget: re-read the user (balance) and send userInfo. Sent when a deposit popup
  // closes, because the popup cannot reach the hidden iframe itself.
  refreshUser = "refreshUser",
}

export type LucraConvertToCreditResponse = {
  id: string;
  title: string;
  iconUrl?: string;
  conversionTerms: string;
  convertedAmount: number;
  convertedDisplayAmount: string;
  shortDescription: string;
  longDescription: string;
  metaData?: Record<string, string>;
};

export type LucraDeepLinkResponse = {
  url: string;
};
export type LucraNavigateRequest = {
  pathname: string;
};

export type LucraAvailableRewards = {
  rewards: LucraReward[];
};

export type LucraUserInfoBody = SDKLucraUser;
export type LucraActiveMatchupStartedBody = { matchupId: string };
export type LucraMatchupStartedBody = { matchupId: string };
export type LucraMatchupCreatedBody = { matchupId: string };
export type LucraMatchupCanceledBody = { matchupId: string };
export type LucraMatchupAcceptedBody = { matchupId: string };
export type LucraTournamentJoinedBody = { matchupId: string };
export type LucraAutoJoinedTournamentsBody = { matchupIds: string[] };
// A user joined the subscribed matchup (one event per new user id).
export type LucraMatchupJoinedBody = { matchupId: string; userId: string; groupId: string };
// The subscribed matchup reached a final status: CLOSED, CLOSED_TIE or any CANCELED_*.
export type LucraMatchupSettledBody = {
  matchupId: string;
  status: LucraMatchupStatus;
  // Empty for a cancel. One id for a 1v1 win; one or more for free for all.
  winningGroupIds: string[];
};
export type LucraConvertToCreditBody = { amount: number };
export type LucraDeepLinkBody = { url: string };
export type LucraMatchupInviteUrlBody = { matchupId: string };
export type LucraMatchupInviteUrlTransformer = (
  matchupId: string
) => Promise<string | undefined>;
export type LucraNavigationEventBody = { url: string; page?: LucraPage };
export type LucraClaimRewardBody = { reward: LucraReward };
export type LucraLoginSuccessBody = SDKLucraUser;
export type LucraInitializedBody = { success: boolean };

// Sent to the web app when something fails on the SDK's side of the bridge, so it reaches
// Lucra's error tracking instead of only the host page's console. Carries no host data.
export type LucraSdkDiagnosticBody = {
  kind: "requestTimeout";
  requestType: MessageTypeToLucraClient;
  timeoutMs: number;
  sdkVersion: string;
};

// Handle returned when a Lucra route is opened as a dialog (see client.dialog()).
export type LucraDialog = {
  close: () => void;
  onClose: (callback: () => void) => void;
};

// Message the Lucra web app posts to the opener when a deposit finishes in a
// popup (see client.popup()). The envelope is flat (no nested `data`).
export const LUCRA_POPUP_MESSAGE_TYPE = "LucraPopupMessage";

// Outcome of a deposit performed in a popup, surfaced via LucraPopup.onClose.
export type LucraPopupResult = {
  toastType: "success" | "error";
  message: string;
};

// Handle returned when a Lucra route is opened in a real popup window (see
// client.popup()). onClose receives the deposit result when one was reported
// before the popup closed, or undefined when the user dismissed it.
export type LucraPopup = {
  close: () => void;
  onClose: (callback: (result?: LucraPopupResult) => void) => void;
};

export type LucraClientConstructor = {
  apiKey: string;
  tenantId: string;
  env: LucraEnvironment;
  locationId?: string;
  autoJoin?: boolean;
};

export type LucraEventMap = {
  userInfo: LucraUserInfoBody;
  matchupCreated: LucraMatchupCreatedBody;
  activeMatchupStarted: LucraActiveMatchupStartedBody;
  matchupStarted: LucraMatchupStartedBody;
  matchupAccepted: LucraMatchupAcceptedBody;
  matchupCanceled: LucraMatchupCanceledBody;
  convertToCredit: LucraConvertToCreditBody;
  tournamentJoined: LucraTournamentJoinedBody;
  autoJoinedTournaments: LucraAutoJoinedTournamentsBody;
  deepLink: LucraDeepLinkBody;
  navigationEvent: LucraNavigationEventBody;
  claimReward: LucraClaimRewardBody;
  loginSuccess: LucraLoginSuccessBody;
  // Carries no payload: there is no user left to describe, and the sign-out reason is
  // the host's own. `client.user` is already null by the time listeners run.
  logoutComplete: void;
  exitLucra: void;
  kycComplete: void;
  locationGranted: void;
  demographicComplete: void;
  initialized: LucraInitializedBody;
  matchupDetailsUpdated: LucraMatchupDetails;
  // Derived by the SDK from matchupDetailsUpdated, so they fire only for the matchup
  // passed to api.subscribeToMatchupDetails.
  matchupJoined: LucraMatchupJoinedBody;
  matchupSettled: LucraMatchupSettledBody;
  // The user accepted Lucra's terms (after a TERMS_NOT_ACCEPTED error and dialog().terms()).
  termsAccepted: void;
};

export type LucraClientSendMessage = {
  userUpdated: (data: SDKClientUser) => void;
  convertToCreditResponse: (data: LucraConvertToCreditResponse) => void;
  enableConvertToCredit: () => void;
  deepLinkResponse: (data: LucraDeepLinkResponse) => void;
  navigate: (data: LucraNavigateRequest) => void;
  availableRewards: (data: LucraAvailableRewards) => void;
};

export type LucraClientMessage = (body: {
  type: LucraClientMessageType;
  data: any;
  requestId?: string;
}) => void;

export type LucraPage =
  | "add-funds"
  | "create-matchup"
  | "demographicform"
  | "home"
  | "id-scan-complete"
  | "kyc"
  | "logout"
  | "matchup-details"
  | "profile"
  | "search"
  | "tournament-details"
  | "transactions"
  | "withdraw-funds";

export type StateFull =
  | "Alaska"
  | "Alabama"
  | "Arkansas"
  | "Arizona"
  | "California"
  | "Colorado"
  | "Connecticut"
  | "District of Columbia"
  | "Delaware"
  | "Florida"
  | "Georgia"
  | "Hawaii"
  | "Iowa"
  | "Idaho"
  | "Illinois"
  | "Indiana"
  | "Kansas"
  | "Kentucky"
  | "Louisiana"
  | "Massachusetts"
  | "Maryland"
  | "Maine"
  | "Michigan"
  | "Minnesota"
  | "Missouri"
  | "Mississippi"
  | "Montana"
  | "North Carolina"
  | "North Dakota"
  | "Nebraska"
  | "New Hampshire"
  | "New Jersey"
  | "New Mexico"
  | "Nevada"
  | "New York"
  | "Ohio"
  | "Oklahoma"
  | "Oregon"
  | "Pennsylvania"
  | "Rhode Island"
  | "South Carolina"
  | "South Dakota"
  | "Tennessee"
  | "Texas"
  | "Utah"
  | "Virginia"
  | "Vermont"
  | "Washington"
  | "Wisconsin"
  | "West Virginia"
  | "Wyoming";

export type StateCode =
  | "AK"
  | "AL"
  | "AR"
  | "AZ"
  | "CA"
  | "CO"
  | "CT"
  | "DC"
  | "DE"
  | "FL"
  | "GA"
  | "HI"
  | "IA"
  | "ID"
  | "IL"
  | "IN"
  | "KS"
  | "KY"
  | "LA"
  | "MA"
  | "MD"
  | "ME"
  | "MI"
  | "MN"
  | "MO"
  | "MS"
  | "MT"
  | "NC"
  | "ND"
  | "NE"
  | "NH"
  | "NJ"
  | "NM"
  | "NV"
  | "NY"
  | "OH"
  | "OK"
  | "OR"
  | "PA"
  | "RI"
  | "SC"
  | "SD"
  | "TN"
  | "TX"
  | "UT"
  | "VA"
  | "VT"
  | "WA"
  | "WI"
  | "WV"
  | "WY";

enum account_status_types_enum {
  // For free to play sports, a status that indicates they have passed an age assurance check and are verified to play.
  AGE_ASSURED_VERIFIED = "AGE_ASSURED_VERIFIED",
  // User blocked by an admin
  BLOCKED = "BLOCKED",
  // User account has been closed
  CLOSED = "CLOSED",
  // User account has been marked to be closed once contests complete
  CLOSED_PENDING = "CLOSED_PENDING",
  // User should be hidden from any client services
  HIDDEN = "HIDDEN",
  // User suspended by an admin
  SUSPENDED = "SUSPENDED",
  // User has not attempted verification or needs to re-verify
  UNVERIFIED = "UNVERIFIED",
  // User needs to scan his/her ID for verification
  USER_SCAN_REQUIRED = "USER_SCAN_REQUIRED",
  // There was an error when attempting to verify user
  VERIFICATION_ERROR = "VERIFICATION_ERROR",
  // User has attempted verification and failed
  VERIFICATION_FAILED = "VERIFICATION_FAILED",
  // User is awaiting a KYC user scan result
  VERIFICATION_SCAN_PENDING = "VERIFICATION_SCAN_PENDING",
  // User has been verified
  VERIFIED = "VERIFIED",
}

export type SDKLucraAddress = {
  address?: string;
  addressCont?: string;
  city?: string;
  state?: StateCode;
  zip?: string;
};

export type SDKLucraUser = {
  id?: string;
  username?: string;
  avatarURL?: string;
  phoneNumber?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  address?: SDKLucraAddress;
  balance?: number;
  accountStatus?: account_status_types_enum;
  metadata?: Record<string, string> | null;
};

export type SDKClientUser = {
  username?: string;
  avatarURL?: string;
  phoneNumber?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  address?: SDKLucraAddress;
  metadata?: Record<string, string> | null;
};

export type LucraReward = {
  rewardId: string;
  title: string;
  descriptor: string;
  iconUrl: string;
  bannerIconUrl: string;
  disclaimer: string;
  metadata: unknown;
};

export type LucraAchievement = {
  id: string;
  isEarned: boolean;
  earnedAt?: string | null;
  claimedAt?: string | null;
  currentProgress: number;
  currentValue: number;
  targetValue: number;
  achievement?: {
    id: string;
    title: string;
    description?: string | null;
    iconUrl?: string | null;
    gameId?: string | null;
    criteriaConfig: unknown;
    criteriaType: string;
    catalogReward?: {
      id: string;
      title: string;
      iconUrl?: string | null;
      descriptor?: string | null;
    } | null;
  } | null;
};

export type LucraAchievementsResponse = {
  achievements: LucraAchievement[];
};

// ---------------------------------------------------------------------------
// Tournament wire shapes.
//
// These mirror the raw GraphQL types returned by lucra-web-app verbatim
// (snake_case where the schema is snake_case, camelCase only where the schema
// itself is). lucra-web-app performs no mapping; consumers reshape into their
// own view models.
// ---------------------------------------------------------------------------

// List item: mirrors RecommendedPoolTournamentCard (get_recommended_pool_tournaments).
export type LucraTournament = {
  matchupId: string;
  canJoinTournament?: boolean | null;
  matchup?: {
    starts_at?: string | null;
    expires_at?: string | null;
    pool_tournament_details?: {
      game_id?: string | null;
      title: string;
      buy_in_amount: number;
      icon_url?: string | null;
      type: string;
    } | null;
    pool_payout_reward_structures: {
      place: number;
      value?: number | null;
      type: string;
    }[];
    pool_tournament_leaderboard_aggregate: {
      aggregate?: { count: number } | null;
    };
  } | null;
};

export type LucraTournamentsResponse = {
  tournaments: LucraTournament[];
};

// Leaderboard: mirrors UITournamentLeaderboard / UITournamentLeaderboardRow.
export type LucraLeaderboardRow = {
  name: string;
  payout?: string | null;
  points?: string | null;
  rank?: number | null;
  userId: string;
};

export type LucraLeaderboardColumn = {
  label: string;
  name: string;
};

export type LucraLeaderboardPagination = {
  limit: number;
  offset: number;
  total_count: number;
};

export type LucraTournamentLeaderboard = {
  columns: LucraLeaderboardColumn[];
  pagination: LucraLeaderboardPagination;
  rows: LucraLeaderboardRow[];
};

export type LucraTournamentLeaderboardInput = {
  matchupId: string;
  limit?: number;
  offset?: number;
};

// Mirrors UITournamentByIdResponse: one raw (unmasked) ui_tournament_details
// page. The consumer's infinite query merges leaderboard rows across pages,
// exactly like the app's UITournamentLeaderboardInfiniteQueryOptions select.
export type LucraTournamentLeaderboardResponse = {
  ui_tournament_details: LucraTournamentDetail | null;
};

// Detail: mirrors UITournament (ui_tournament_details) and its nested types.
export type LucraTournamentTimer = {
  caption: string;
  state: string;
};

export type LucraTournamentGame = {
  game_id?: string | null;
  minigame_enabled: boolean;
};

export type LucraTournamentHowToPlayStep = {
  step: number;
  text: string;
};

export type LucraTournamentConfirmationTerm = {
  description: string;
  title: string;
};

export type LucraTournamentNotice = {
  affected_fields: string[];
  message: string;
  type: string;
};

export type LucraTournamentAttemptScores = {
  attempt: number;
  is_best?: boolean | null;
  score?: number | null;
};

export type LucraTournamentAttemptData = {
  attempts_remaining?: number | null;
  can_join_tournament: boolean;
  icon_type?: string | null;
  is_replayable: boolean;
  modal_title_text?: string | null;
  play_again_recommendation_text?: string | null;
  play_again_recommendation_title?: string | null;
  present_to_user: boolean;
  rank_variation?: number | null;
  remaining_attempts_text?: string | null;
  scores: LucraTournamentAttemptScores[];
  user_present: boolean;
};

export type LucraTournamentCatalogReward = {
  banner_icon_url?: string | null;
  config: unknown;
  descriptor?: string | null;
  disclaimer?: string | null;
  icon_url?: string | null;
  id: string;
  title: string;
  type: string;
};

export type LucraTournamentEarnedReward = {
  id: string;
  place: number;
  reward: LucraTournamentCatalogReward;
};

export type LucraTournamentPayoutReward = {
  amount_label?: string | null;
  catalog_reward?: LucraTournamentCatalogReward | null;
  end_place?: number | null;
  place?: number | null;
  place_label?: string | null;
  position_label?: string | null;
  reward_label?: string | null;
  value?: number | null;
};

export type LucraTournamentPayoutStructure = {
  description: string;
  is_percentage_payout: boolean;
  jackpot_amount?: string | null;
  jackpot_descriptor?: string | null;
  label_description?: string | null;
  label_title?: string | null;
  no_payout: boolean;
  rewards: LucraTournamentPayoutReward[];
  show_amount: boolean;
  title: string;
};

export type LucraTournamentDetail = {
  attempt_data?: LucraTournamentAttemptData | null;
  buy_in_amount?: number | null;
  buy_in_amount_numeric?: number | string | null;
  description?: string | null;
  earned_rewards: LucraTournamentEarnedReward[];
  expires_at?: string | null;
  free_buy_in: boolean;
  game?: LucraTournamentGame | null;
  how_to_play?: LucraTournamentHowToPlayStep[] | null;
  image_url?: string | null;
  is_completed: boolean;
  is_expired: boolean;
  is_not_started: boolean;
  is_private: boolean;
  leaderboard?: LucraTournamentLeaderboard | null;
  max_participants?: number | null;
  notices: LucraTournamentNotice[];
  payout_structure?: LucraTournamentPayoutStructure | null;
  reward_type?: string | null;
  starts_at?: string | null;
  status: string;
  terms: LucraTournamentConfirmationTerm[];
  timer?: LucraTournamentTimer | null;
  title: string;
  total_participants?: number | null;
  user_leaderboard_row?: LucraLeaderboardRow | null;
  visibility_level?: string | null;
};

export type LucraTournamentResponse = {
  tournament: LucraTournamentDetail | null;
};

export type LucraJoinTournamentResponse = {
  matchupId: string;
};

// ---------------------------------------------------------------------------
// Games You Play (recreational game) matchups.
//
// Unlike the tournament shapes above, lucra-web-app maps these into camelCase
// models. Only RECREATIONAL_GAME matchups are returned.
// ---------------------------------------------------------------------------

export type LucraPlayStyle = "GROUP_VS_GROUP" | "FREE_FOR_ALL";

export type LucraMatchupStatus =
  | "OPEN"
  | "CONFIRMED"
  | "LOCKED"
  | "PENDING_OUTCOMES"
  | "ON_HOLD"
  | "DISPUTE"
  | "CLOSED"
  | "CLOSED_TIE"
  | "CANCELED_BY_OWNER"
  | "CANCELED_DISPUTE"
  | "CANCELED_GAME_CANCELED"
  | "CANCELED_NOT_ACCEPTED"
  | "CANCELED_PLAYER_INACTIVE"
  | "CANCELED_THROUGH_API"
  | "CANCELED_TIMEOUT";

export type LucraCashStake = { type: "CASH"; amount: number };

// What a matchup is played for. `reward` reuses LucraReward (the availableRewards item).
// Read side only: headless create accepts LucraCashStake.
export type LucraAtStake =
  | LucraCashStake
  | { type: "TENANT_REWARD"; reward: LucraReward };

export type LucraRecreationalGame = {
  gameId: string;
  name: string;
  iconUrl?: string;
};

export type LucraMatchupParticipantGroup = { id: string; userIds: string[] };

export type LucraMatchup = {
  id: string;
  status: LucraMatchupStatus;
  playStyle: LucraPlayStyle;
  isPublic: boolean;
  createdAt?: string;
  creatorId: string;
  winningGroupId?: string;
  game: LucraRecreationalGame;
  atStake: LucraAtStake;
  participantGroups: LucraMatchupParticipantGroup[];
  // When an unsettled matchup stops taking joins and settles (by the scores posted so
  // far for a game with automated results; refunded otherwise). Absent on older web apps.
  expiresAt?: string;
  // Most users that can join, counting the creator. Absent on older web apps.
  maxParticipants?: number;
};

export type LucraMatchupParticipant = {
  userId: string;
  username: string;
  avatarUrl?: string;
  individualPayout?: number;
};

export type LucraMatchupGroup = {
  id: string;
  outcome?: "WIN" | "LOSS" | "TIE";
  score?: number;
  participants: LucraMatchupParticipant[];
};

export type LucraMatchupParticipantScore = {
  userId?: string;
  username?: string;
  avatarUrl?: string;
  place?: number;
  score?: number;
  finishedAt?: string;
  groupId?: string;
};

export type LucraMatchupDetails = {
  matchup: LucraMatchup;
  groups: LucraMatchupGroup[];
  participantScores: LucraMatchupParticipantScore[];
};

export type LucraCreateRecreationalGameInput = {
  gameTypeId: string;
  atStake: LucraCashStake;
  playStyle: LucraPlayStyle;
  // ISO 8601 end time. Default: the game type's expiration (72 hours if it has none).
  expiresAt?: string;
  // Most users that can join, counting the creator. Default: the tenant's limit (20).
  maxParticipants?: number;
};

// ---------------------------------------------------------------------------
// Catalog reads: the GYP game types and the minigames this tenant offers.
// ---------------------------------------------------------------------------

export type LucraHowToWin = "HIGHEST_SCORE" | "LOWEST_SCORE" | "FASTEST_TIME" | string;
// AUTOMATED: the matchup settles itself once every group has a final score (posted by
// the partner's server through Lucra's tenant API, or by a Lucra minigame).
// MANUAL: players report the outcome (api.enterRecreationalGameOutcome).
export type LucraTrackResults = "AUTOMATED" | "MANUAL" | string;

export type LucraGameType = {
  gameTypeId: string;
  name: string;
  description?: string;
  iconUrl?: string;
  imageUrl?: string;
  // Absent when the game type does not set it.
  howToWin?: LucraHowToWin;
  trackResults?: LucraTrackResults;
  scoringUnit?: string;
  // The game is a Lucra minigame: play it with minigamesTrigger, not your own game.
  minigameEnabled: boolean;
};

export type LucraGameTypesResponse = { gameTypes: LucraGameType[] };

export type LucraMinigameMode = {
  // The value minigamesTrigger takes as game_mode.
  mode: LucraMinigamesTriggerInput["game_mode"];
  // Entry amounts this mode accepts (dollars). Empty when the mode is free.
  stakes: number[];
  minPlayers?: number;
  maxPlayers?: number;
};

export type LucraMinigame = {
  gameId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  modes: LucraMinigameMode[];
};

export type LucraMinigamesResponse = { minigames: LucraMinigame[] };

// ---------------------------------------------------------------------------
// The signed-in user's recreational matchups (an inbox, or a create that timed out).
// ---------------------------------------------------------------------------

export type LucraUserMatchupsFilter = "ACTIVE" | "COMPLETED" | "ALL";

export type LucraUserMatchupsInput = {
  filter?: LucraUserMatchupsFilter; // default ACTIVE
  limit?: number; // default 20, max 100
  offset?: number;
};

export type LucraUserMatchupsResponse = {
  matchups: LucraMatchup[];
  hasMore: boolean;
};

// ---------------------------------------------------------------------------
// Results.
// ---------------------------------------------------------------------------

export type LucraSubmitTournamentScoreInput = {
  matchupId: string;
  score: number;
  // true ends the attempt (the score counts as final). Default true.
  attemptFinished?: boolean;
  // Up to 1 KB of partner data stored with the score.
  metadata?: string;
};

export type LucraSubmitTournamentScoreResult = { matchupId: string };

// For MANUAL game types only. AUTOMATED ones settle from posted scores.
export type LucraEnterRecreationalGameOutcomeInput = {
  matchupId: string;
  winningGroupId?: string;
  isTie?: boolean;
};

export type LucraEnterRecreationalGameOutcomeResult = { matchupId: string };

// Options for client.popup().deposit().
export type LucraDepositOptions = {
  // Amount (dollars) to prefill, e.g. the shortfall for an entry. The user can change it.
  amount?: number;
};

// matchup is null only when the read after a successful create or accept failed. The write succeeded.
export type LucraRecreationalGameResult = {
  matchupId: string;
  matchup: LucraMatchup | null;
};

export type LucraCancelRecreationalGameResult = {
  matchupId: string;
};

// Wire-only body of acceptRecreationalGameRequest, not exported from index.ts. teamId is
// the group to join for GROUP_VS_GROUP.
export type LucraAcceptRecreationalGameBody = {
  matchupId: string;
  playStyle: LucraPlayStyle;
  teamId?: string;
};

// Error codes the web-app can surface for a failed API call. The web-app posts
// an error message carrying one of these codes and the SDK rejects the matching
// API promise with a LucraApiError so clients can react to the specific failure.
// The codes are not specific to one call; docs/2.0_headless.md lists which calls
// surface them.
export enum LucraApiErrorCode {
  unverified = "UNVERIFIED",
  insufficientFunds = "INSUFFICIENT_FUNDS",
  demographicInformationMissing = "DEMOGRAPHIC_INFORMATION_MISSING",
  locationError = "LOCATION_ERROR",
  // The web-app has no cached geo token, usually because the iframe was never
  // granted browser geolocation permission. The client should present the
  // location-grant page via `dialog().locationGrant()` so a user gesture inside
  // the iframe can unlock location access, then retry the call.
  locationNeeded = "LOCATION_NEEDED",
  // The user or the matchup's state does not permit the action, for example a
  // blocked account, a matchup that is no longer open, or a cancel by someone
  // other than the creator. Terminal: show `message`, do not retry.
  notAllowed = "NOT_ALLOWED",
  // Create input failed validation before any network call. Terminal: `message`
  // names the invalid field; fix the input instead of retrying.
  invalidAtStake = "INVALID_AT_STAKE",
  invalidRewardType = "INVALID_REWARD_TYPE",
  invalidPlayStyle = "INVALID_PLAY_STYLE",
  // Catch-all for a failure with no more specific code: an API or network
  // error, or a rejection the web-app cannot classify. `message` carries the
  // detail returned by the API when there is one.
  // The user has not accepted Lucra's current terms. Present dialog().terms() from a user
  // gesture, wait for the termsAccepted event, then retry the call.
  termsNotAccepted = "TERMS_NOT_ACCEPTED",
  apiError = "API_ERROR",
}

export type LucraApiErrorBody = {
  code: LucraApiErrorCode;
  message?: string;
};

// Data of an apiRequestError message: the failure plus the request type it answers, so
// the SDK can reject the matching api.* call.
export type LucraApiRequestErrorBody = LucraApiErrorBody & {
  requestType: MessageTypeToLucraClient;
};

// Body of an isLoggedInRequest. `awaitsPending` declares that this SDK understands an
// interim `pending` answer, so the web-app may defer instead of answering a transient
// `isLoggedIn: false`. It is a per-request capability negotiation: the web-app deploys
// independently of the SDK version a client pins, and an already-shipped SDK sends no
// body at all, so it must never be handed an answer it would read as a final logged-out.
export type LucraIsLoggedInRequestBody = {
  awaitsPending?: boolean;
};

// `pending: true` means auth has not settled yet (a session still being restored, say),
// and the web-app will answer again on the same requestId once it has. The web-app only
// sets it on a request that carried `awaitsPending`, so an older SDK never sees it.
export type LucraIsLoggedInResponse = {
  isLoggedIn: boolean;
  pending?: boolean;
};

export type LucraMinigamesTriggerInput = {
  game_id: string;
  game_mode: "practice" | "1v1" | "free_for_all" | "tournament";
  amount?: number;
  matchup_id?: string;
};

export type LucraMinigamesTriggerOptions = {
  // Rejects with LucraMinigamesTriggerTimeout when no session starts within this time.
  // Default 120000 (2 minutes). 0 waits forever (the 1.x behavior).
  timeoutMs?: number;
  // Aborting rejects with LucraMinigamesTriggerCanceled and removes the Start overlay.
  signal?: AbortSignal;
};

export type LucraStartMinigamesSessionResponse = {
  iframe_url: string;
  matchup_id?: string | null;
  session_id: string;
};
