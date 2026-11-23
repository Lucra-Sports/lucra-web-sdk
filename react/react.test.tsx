import "./dom.ts";
import { describe, it, expect, afterAll, afterEach, beforeEach, mock, spyOn } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { createClient, type LucraHeadlessClient } from "../headless/client.ts";
import { LucraErrorCode, type LucraError } from "../headless/errors.ts";
import { createNullFrame } from "../headless/frame.ts";
import * as headless from "../headless/index.ts";
import type { LucraScreen } from "../headless/present.ts";
import { createFakeFrame, type FakeFrame } from "../headless/testing.ts";
import type { LucraPresentResult } from "../headless/types.ts";
import * as react from "./index.ts";
import {
  LucraProvider,
  useLucra,
  useLucraAuth,
  useLucraPresentState,
  useLucraScreen,
  useMatchupWatch,
  type LucraScreenOptions,
} from "./index.ts";

const config = { apiKey: "key-1", tenantId: "test-tenant", env: "sandbox" as const };
const USER = { id: "u1", username: "pat", balance: 25 };

// Every client a test makes. Each is destroyed after the test.
const clients: LucraHeadlessClient[] = [];

function setup() {
  const frame = createFakeFrame();
  const client = createClient(config, { frame, parentOrigin: "https://host.example" });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <LucraProvider client={client}>{children}</LucraProvider>
  );
  return { frame, client, wrapper };
}

// What createLucraClient returns during server rendering.
function serverClient() {
  const client = createClient(config, {
    frame: createNullFrame(),
    parentOrigin: "",
    unsupported: true,
  });
  clients.push(client);
  return client;
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
// Lets the client's waits settle inside act, so React sees every change.
const settle = () => act(tick);
const details = (id: string, status = "OPEN") => ({
  matchup: { id, status },
  groups: [],
  participantScores: [],
});

async function connectLoggedIn(frame: FakeFrame) {
  frame.deliver("initialized", { success: true });
  frame.answer("isLoggedInRequest", "isLoggedInResponse", { isLoggedIn: true });
  frame.deliver("loginSuccess", USER);
  await tick();
}
async function connectLoggedOut(frame: FakeFrame) {
  frame.deliver("initialized", { success: true });
  frame.answer("isLoggedInRequest", "isLoggedInResponse", { isLoggedIn: false });
  await tick();
}

let warn: ReturnType<typeof spyOn>;
beforeEach(() => {
  warn = spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.destroy();
  warn.mockRestore();
});
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

describe("lucra-web-sdk/react exports", () => {
  it("exports everything from lucra-web-sdk/headless, the provider and the hooks, and nothing internal", () => {
    expect(Object.keys(react).sort()).toEqual(
      [
        ...Object.keys(headless),
        "LucraProvider",
        "useLucra",
        "useLucraAuth",
        "useLucraPresentState",
        "useLucraScreen",
        "useMatchupWatch",
      ].sort()
    );
  });

  it("shares the client and LucraError with lucra-web-sdk/headless", () => {
    expect(react.createLucraClient).toBe(headless.createLucraClient);
    expect(react.LucraError).toBe(headless.LucraError);
  });
});

describe("useLucra", () => {
  it("throws outside a LucraProvider", () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useLucra())).toThrow(
        "useLucra must be used inside <LucraProvider>."
      );
    } finally {
      error.mockRestore();
    }
  });
});

describe("useLucraAuth", () => {
  it("is loading, then logged in with the user, then logged out", async () => {
    const { frame, wrapper } = setup();
    const { result } = renderHook(() => useLucraAuth(), { wrapper });
    expect(result.current).toEqual({ status: "loading", user: null });
    await act(() => connectLoggedIn(frame));
    expect(result.current).toEqual({ status: "loggedIn", user: USER });
    act(() => frame.deliver("logoutComplete", null));
    expect(result.current).toEqual({ status: "loggedOut", user: null });
  });
});

describe("useLucraPresentState", () => {
  it("is null, then the screen on show, then null after dismiss", async () => {
    const { frame, client, wrapper } = setup();
    await connectLoggedIn(frame);
    const { result } = renderHook(() => useLucraPresentState(), { wrapper });
    expect(result.current).toEqual({ screen: null });
    const shown = client.present.profile();
    await settle();
    expect(result.current).toEqual({ screen: "profile" });
    act(() => client.present.dismiss());
    expect(result.current).toEqual({ screen: null });
    expect(await shown).toEqual({ status: "dismissed", reason: "dismissed" });
  });
});

type ScreenProps = LucraScreenOptions<LucraPresentResult> & {
  screen: Exclude<LucraScreen, "login">;
};

function renderScreen(
  wrapper: ReturnType<typeof setup>["wrapper"],
  initialProps: ScreenProps,
  reactStrictMode = false
) {
  return renderHook(
    ({ screen, ...options }: ScreenProps) => useLucraScreen(screen, options),
    { wrapper, initialProps, reactStrictMode }
  );
}

describe("useLucraScreen", () => {
  it("shows the screen on mount, and closes it on unmount without onClose", async () => {
    const { frame, client, wrapper } = setup();
    await connectLoggedIn(frame);
    const onClose = mock(() => {});
    const { unmount } = renderScreen(wrapper, { screen: "profile", onClose });
    await settle();
    expect(client.present.getState().screen).toBe("profile");
    expect(frame.overlayOpen).toBe(true);
    unmount();
    await settle();
    expect(client.present.getState().screen).toBeNull();
    expect(frame.overlayOpen).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls the latest onClose when the user leaves, without showing the screen again", async () => {
    const { frame, wrapper } = setup();
    await connectLoggedIn(frame);
    const first = mock(() => {});
    const latest = mock(() => {});
    const { rerender } = renderScreen(wrapper, { screen: "profile", onClose: first });
    await settle();
    expect(frame.overlaysOpened).toBe(1);
    rerender({ screen: "profile", onClose: latest });
    await settle();
    expect(frame.overlaysOpened).toBe(1);
    await act(async () => {
      frame.deliver("exitLucra", true);
      await tick();
    });
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
    expect(latest).toHaveBeenCalledWith({ status: "dismissed", reason: "exit" });
    expect(frame.overlayOpen).toBe(false);
  });

  it("shows one screen in StrictMode and skips onClose for the aborted first run", async () => {
    const { frame, client, wrapper } = setup();
    await connectLoggedIn(frame);
    const profile = spyOn(client.present, "profile");
    const onClose = mock(() => {});
    // StrictMode at the root, as an app has it.
    renderScreen(wrapper, { screen: "profile", onClose }, true);
    await settle();
    // StrictMode ran the effect twice. The first call was aborted before it showed.
    expect(profile).toHaveBeenCalledTimes(2);
    expect(await profile.mock.results[0].value).toEqual({ status: "dismissed", reason: "aborted" });
    expect(frame.overlaysOpened).toBe(1);
    expect(client.present.getState().screen).toBe("profile");
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      frame.deliver("exitLucra", true);
      await tick();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith({ status: "dismissed", reason: "exit" });
  });

  it("closes the old screen and shows the new one when the screen changes", async () => {
    const { frame, client, wrapper } = setup();
    await connectLoggedIn(frame);
    const onClose = mock(() => {});
    const { rerender } = renderScreen(wrapper, { screen: "profile", onClose });
    await settle();
    expect(client.present.getState().screen).toBe("profile");
    rerender({ screen: "wallet", onClose });
    await settle();
    expect(client.present.getState().screen).toBe("wallet");
    expect(frame.overlaysOpened).toBe(2);
    expect(frame.overlayOpen).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("passes the presentation, and shows the screen again when it changes", async () => {
    const { frame, wrapper } = setup();
    await connectLoggedIn(frame);
    const { rerender } = renderScreen(wrapper, { screen: "profile", presentation: "sheet" });
    await settle();
    expect(frame.presentations).toEqual(["sheet"]);
    rerender({ screen: "profile", presentation: "modal" });
    await settle();
    expect(frame.presentations).toEqual(["sheet", "modal"]);
    expect(frame.overlayOpen).toBe(true);
  });

  it("calls onError with NOT_LOGGED_IN when nobody is logged in", async () => {
    const { frame, wrapper } = setup();
    await connectLoggedOut(frame);
    const onClose = mock(() => {});
    const onError = mock((_error: unknown) => {});
    renderScreen(wrapper, { screen: "wallet", onClose, onError });
    await settle();
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as LucraError).code).toBe(LucraErrorCode.NOT_LOGGED_IN);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("passes the phone number to login, and onClose gets the user", async () => {
    const { frame, wrapper } = setup();
    await connectLoggedOut(frame);
    const onClose = mock((_result: unknown) => {});
    renderHook(() => useLucraScreen("login", { phoneNumber: "5551234567", onClose }), {
      wrapper,
    });
    await settle();
    const url = new URL(frame.urls[frame.urls.length - 1]);
    expect(url.searchParams.get("login")).toBe("true");
    expect(url.searchParams.get("loginHint")).toBe("5551234567");
    await act(async () => {
      await connectLoggedOut(frame);
      frame.deliver("loginSuccess", USER);
      await tick();
    });
    expect(onClose).toHaveBeenCalledWith({ status: "completed", user: USER });
  });
});

describe("useMatchupWatch", () => {
  const answerSubscribe = (frame: FakeFrame, id: string) =>
    frame.answer("subscribeMatchupDetailsRequest", "subscribeMatchupDetailsResponse", details(id));

  it("is null until the details arrive, then follows each change", async () => {
    const { frame, wrapper } = setup();
    frame.deliver("initialized", { success: true });
    const { result } = renderHook(() => useMatchupWatch("m1"), { wrapper });
    expect(result.current).toEqual({ details: null, error: null });
    await settle();
    expect(frame.lastPosted("subscribeMatchupDetailsRequest")?.body).toEqual({ matchupId: "m1" });
    answerSubscribe(frame, "m1");
    await settle();
    expect(result.current).toEqual({ details: details("m1"), error: null });
    act(() => frame.deliver("matchupDetailsUpdated", details("m1", "CONFIRMED")));
    expect(result.current).toEqual({ details: details("m1", "CONFIRMED"), error: null });
  });

  it("sets error, keeps the last details, and calls onError when the watch fails", async () => {
    const { frame, client, wrapper } = setup();
    frame.deliver("initialized", { success: true });
    const onError = mock((_error: LucraError) => {});
    const { result } = renderHook(() => useMatchupWatch("m1", { onError }), { wrapper });
    await settle();
    answerSubscribe(frame, "m1");
    await settle();
    // A watch on another matchup replaces this one.
    act(() => {
      client.matchups.watch("m2", { onUpdate() {} });
    });
    expect(result.current.details).toEqual(details("m1"));
    expect(result.current.error?.code).toBe(LucraErrorCode.CANCELLED);
    expect(onError.mock.calls).toEqual([[result.current.error!]]);
  });

  it("stops the watch on unmount without calling onError", async () => {
    const { frame, client, wrapper } = setup();
    frame.deliver("initialized", { success: true });
    const onError = mock(() => {});
    const { unmount } = renderHook(() => useMatchupWatch("m1", { onError }), { wrapper });
    await settle();
    answerSubscribe(frame, "m1");
    await settle();
    expect(frame.lastPosted("cancelMatchupDetailsSubscription")).toBeUndefined();
    unmount();
    expect(frame.lastPosted("cancelMatchupDetailsSubscription")).toBeDefined();
    // This would cancel the watch had it still been live.
    client.matchups.watch("m2", { onUpdate() {} });
    expect(onError).not.toHaveBeenCalled();
  });

  it("starts over with null details when the matchup id changes", async () => {
    const { frame, wrapper } = setup();
    frame.deliver("initialized", { success: true });
    const { result, rerender } = renderHook(({ id }) => useMatchupWatch(id), {
      wrapper,
      initialProps: { id: "m1" },
    });
    await settle();
    answerSubscribe(frame, "m1");
    await settle();
    expect(result.current.details).toEqual(details("m1"));
    rerender({ id: "m2" });
    expect(result.current).toEqual({ details: null, error: null });
    await settle();
    expect(frame.lastPosted("subscribeMatchupDetailsRequest")?.body).toEqual({ matchupId: "m2" });
    answerSubscribe(frame, "m2");
    await settle();
    expect(result.current).toEqual({ details: details("m2"), error: null });
  });

  it("calls the latest onUpdate without starting the watch again", async () => {
    const { frame, wrapper } = setup();
    frame.deliver("initialized", { success: true });
    const first = mock((_details: unknown) => {});
    const latest = mock((_details: unknown) => {});
    const { rerender } = renderHook(({ onUpdate }) => useMatchupWatch("m1", { onUpdate }), {
      wrapper,
      initialProps: { onUpdate: first },
    });
    await settle();
    answerSubscribe(frame, "m1");
    await settle();
    rerender({ onUpdate: latest });
    await settle();
    act(() => frame.deliver("matchupDetailsUpdated", details("m1", "CONFIRMED")));
    expect(
      frame.posted.filter(({ type }) => type === "subscribeMatchupDetailsRequest")
    ).toHaveLength(1);
    expect(first.mock.calls).toEqual([[details("m1")]]);
    expect(latest.mock.calls).toEqual([[details("m1", "CONFIRMED")]]);
  });
});

describe("server rendering", () => {
  function Status() {
    const auth = useLucraAuth();
    const { screen } = useLucraPresentState();
    const { details } = useMatchupWatch("m1");
    return (
      <p>
        {auth.status} {String(screen)} {String(details)}
      </p>
    );
  }
  const page = (client: LucraHeadlessClient) => (
    <LucraProvider client={client}>
      <Status />
    </LucraProvider>
  );

  it("renders the loading state with the client made where there is no page", () => {
    const html = renderToString(page(serverClient()));
    expect(html).toBe("<p>loading<!-- --> <!-- -->null<!-- --> <!-- -->null</p>");
  });

  it("hydrates the server's HTML without a mismatch, then shows the browser's state", async () => {
    const html = renderToString(page(serverClient()));
    // In the browser, the client is connected and logged in before hydration.
    const { frame, client } = setup();
    await connectLoggedIn(frame);
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    const onRecoverableError = mock(() => {});
    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(container, page(client), { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.textContent).toBe("loggedIn null null");
    act(() => root?.unmount());
    container.remove();
  });
});
