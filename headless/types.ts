import type {
  LucraEnvironment,
  LucraMatchupDetails,
  SDKLucraUser,
} from "../types/types.js";
import type { LucraError } from "./errors.js";

// Data shapes returned by the headless client. They are the shapes Lucra sends,
// re-exported so integrators import everything from one place.
export type {
  LucraEnvironment,
  LucraAchievement,
  LucraTournament,
  LucraTournamentDetail,
  LucraTournamentLeaderboard,
  LucraLeaderboardRow,
  LucraLeaderboardColumn,
  LucraLeaderboardPagination,
  LucraTournamentTimer,
  LucraTournamentGame,
  LucraTournamentHowToPlayStep,
  LucraTournamentConfirmationTerm,
  LucraTournamentNotice,
  LucraTournamentAttemptScores,
  LucraTournamentAttemptData,
  LucraTournamentCatalogReward,
  LucraTournamentEarnedReward,
  LucraTournamentPayoutReward,
  LucraTournamentPayoutStructure,
  LucraJoinTournamentResponse,
  LucraAutoJoinedTournamentsBody,
  LucraMatchup,
  LucraMatchupStatus,
  LucraPlayStyle,
  LucraAtStake,
  LucraCashStake,
  LucraRecreationalGame,
  LucraMatchupParticipantGroup,
  LucraMatchupDetails,
  LucraMatchupGroup,
  LucraMatchupParticipant,
  LucraMatchupParticipantScore,
  LucraCreateRecreationalGameInput,
  LucraRecreationalGameResult,
  LucraCancelRecreationalGameResult,
  LucraSearchMatchupsByMetadataInput,
  LucraUserMatchups,
  LucraUserMatchupsGroup,
  LucraUserMatchupsPage,
  LucraUserMatchup,
  LucraUserMatchupType,
  LucraUserMatchupStatus,
  LucraUserMatchupsInput,
  LucraUserMatchupsByTypeStatusInput,
  LucraUserTournamentReward,
  LucraReward,
} from "../types/types.js";

export type LucraUser = SDKLucraUser;

export type LucraClientConfig = {
  apiKey: string;
  tenantId: string;
  env: LucraEnvironment;
  locationId?: string;
  autoJoin?: boolean;
  // Where Lucra screens show. Without it they cover the page. It must be in the
  // page when the client is created and stay there. Removed, calls time out and
  // an open screen keeps waiting. Moved, Lucra reloads and an open screen is not
  // shown again. Call destroy() in the cleanup of whatever renders it, for
  // example a component's unmount, and create the client again after.
  container?: HTMLElement;
};

// "loading" until Lucra has answered whether a user is logged in.
export type LucraAuthStatus = "loading" | "loggedOut" | "loggedIn";

export type LucraAuthState = {
  readonly status: LucraAuthStatus;
  // Can be null for a moment after status becomes "loggedIn".
  readonly user: LucraUser | null;
};

// Options every lucra.present screen takes. Aborting `signal` closes the
// screen that call opened, and only while that call is pending.
export type LucraPresentOptions = { signal?: AbortSignal };

export type LucraLoginOptions = LucraPresentOptions & { phoneNumber?: string };

// Why a screen resolved "dismissed".
export type LucraDismissReason =
  // The user used Lucra's exit control.
  | "exit"
  // The app called lucra.present.dismiss().
  | "dismissed"
  // Another lucra.present call took its place.
  | "replaced"
  // The user logged out inside the screen.
  | "loggedOut"
  // The client was destroyed.
  | "destroyed"
  // The call's signal was aborted.
  | "aborted";

// How a Lucra screen shown by lucra.present ended.
export type LucraPresentResult =
  | { status: "completed" }
  | { status: "dismissed"; reason: LucraDismissReason };

export type LucraLoginResult =
  | { status: "completed"; user: LucraUser }
  | { status: "dismissed"; reason: LucraDismissReason };

// "alreadyOpen": the window was open already, so this call brought it to the
// front. The call that opened it reports the deposit.
export type LucraAddFundsResult =
  | { status: "completed"; message: string }
  | { status: "failed"; message: string }
  | { status: "dismissed" }
  | { status: "alreadyOpen" };

export type LucraMatchupWatchHandlers = {
  // Called with the current details first, then on every change.
  onUpdate: (details: LucraMatchupDetails) => void;
  // Called once if the watch fails. The watch has stopped when this runs.
  onError?: (error: LucraError) => void;
};

export type LucraMatchupWatch = {
  // Stops the watch. Never throws. Safe to call more than once.
  stop: () => void;
};

// Things that happen inside Lucra without your app asking for them.
export type LucraHeadlessEventMap = {
  matchupCreated: { matchupId: string };
  matchupAccepted: { matchupId: string };
  matchupStarted: { matchupId: string };
  matchupCanceled: { matchupId: string };
  activeMatchupStarted: { matchupId: string };
  tournamentJoined: { matchupId: string };
  autoJoinedTournaments: { matchupIds: string[] };
};
