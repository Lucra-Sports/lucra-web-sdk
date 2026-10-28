// Names the doc examples use without defining them: the integrator's own values and app objects.
// Only add a name here when the docs deliberately leave it to the integrator. SDK exports
// (LucraClient, LucraApiError, types...) are in scope already: see writeGlobals() in check-docs.ts.

declare const client: import("lucra-web-sdk").LucraClient;
declare const lucraClient: import("lucra-web-sdk").LucraClient;

// Where the integrator mounts the iframe.
declare const host: HTMLElement;
declare const element: HTMLElement;
declare const container: HTMLElement;
declare const otherElement: HTMLElement;

// The integrator's configuration and ids.
declare const apiKey: string;
declare const tenantId: string;
declare const phoneNumber: string | undefined;
declare const matchupId: string;
declare const tournamentId: string;
declare const teamId: string;

// The integrator's own UI for asking before a deposit popup (popups need a click).
declare const addFundsButton: HTMLButtonElement;
declare function showAddFundsPrompt(onAddFunds: () => void, onCancel: () => void): void;

// One item from the list the surrounding example fetched.
declare const a: import("lucra-web-sdk").LucraAchievement;
