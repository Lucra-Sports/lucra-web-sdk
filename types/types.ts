export type LucraEnvironment =
  | "local"
  | "dev1"
  | "dev2"
  | "staging"
  | "sandbox"
  | "production";

export enum LucraClientMessageType {
  achievementsResponse = "achievementsResponse",
  activeMatchupStarted = "activeMatchupStarted",
  claimReward = "claimReward",
  convertToCredit = "convertToCredit",
  deepLink = "deepLink",
  exitLucra = "exitLucra",
  loginSuccess = "loginSuccess",
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
  userInfo = "userInfo",
  initialized = "initialized",
  isLoggedInResponse = "isLoggedInResponse"
}

export enum MessageTypeToLucraClient {
  achievementsRequest = "achievementsRequest",
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

// Handle returned when a Lucra route is opened as a dialog (see client.dialog()).
export type LucraDialog = {
  close: () => void;
  onClose: (callback: () => void) => void;
};

export type LucraClientConstructor = {
  apiKey: string;
  tenantId: string;
  env: LucraEnvironment;
  locationId?: string;
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
  deepLink: LucraDeepLinkBody;
  navigationEvent: LucraNavigationEventBody;
  claimReward: LucraClaimRewardBody;
  loginSuccess: LucraLoginSuccessBody;
  exitLucra: void;
  initialized: LucraInitializedBody;
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
}) => void;

export type LucraPage =
  | "add-funds"
  | "create-matchup"
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

export type LucraIsLoggedInResponse = {
  isLoggedIn: boolean;
};

export type LucraMinigamesTriggerInput = {
  game_id: string;
  game_mode: "practice" | "1v1" | "free_for_all" | "tournament";
  amount?: number;
  matchup_id?: string;
};

export type LucraStartMinigamesSessionResponse = {
  iframe_url: string;
  matchup_id?: string | null;
  session_id: string;
};
