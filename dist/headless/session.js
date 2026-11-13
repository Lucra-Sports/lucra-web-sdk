import { LucraClientMessageType, MessageTypeToLucraClient, } from "../types/types.js";
import { SDK_VERSION } from "../version.js";
import { LucraError, LucraErrorCode } from "./errors.js";
import { createEmitter } from "./events.js";
import { createRequests } from "./requests.js";
export const DEFAULT_TIMEOUTS = {
    requestMs: 15_000,
    connectMs: 30_000,
    authCheckMaxMs: 60_000,
    authReadyMs: 15_000,
    logoutMs: 15_000,
};
export function createSession(options) {
    const { frame, timeouts } = options;
    let status = options.unsupported ? "failed" : "connecting";
    let failure = options.unsupported
        ? new LucraError(LucraErrorCode.UNSUPPORTED_ENVIRONMENT)
        : null;
    let connectedOnce = false;
    const waiters = new Set();
    const connectedListeners = new Set();
    const inbound = createEmitter();
    const post = (type, body) => {
        try {
            frame.post({ type, body });
        }
        catch {
            // Log the type only. A message body can hold user data.
            console.error(`Lucra could not send a ${type} message`);
        }
    };
    const requests = createRequests({
        post: (message) => frame.post(message),
        timeoutMs: timeouts.requestMs,
        // A timeout otherwise only shows up in the host page, where Lucra never sees it.
        onTimeout: (type, timeoutMs) => post(MessageTypeToLucraClient.sdkDiagnostic, {
            kind: "requestTimeout",
            requestType: type,
            timeoutMs,
            sdkVersion: SDK_VERSION,
        }),
    });
    const settleWaiters = (error) => {
        for (const waiter of [...waiters]) {
            clearTimeout(waiter.timer);
            if (error)
                waiter.reject(error);
            else
                waiter.resolve();
        }
        waiters.clear();
    };
    const onInitialized = (data) => {
        // Lucra posts this once per page load. A second one means its page loaded
        // again, started or not, so nothing sent to the old page will ever be answered.
        if (connectedOnce)
            requests.rejectAll("CONNECTION_RESET");
        const success = data?.success === true;
        if (!success) {
            status = "failed";
            failure = new LucraError(LucraErrorCode.CONNECTION_FAILED);
            settleWaiters(failure);
            return;
        }
        connectedOnce = true;
        status = "connected";
        failure = null;
        settleWaiters();
        for (const listener of [...connectedListeners]) {
            try {
                listener();
            }
            catch (e) {
                console.error("Lucra connection listener threw an error", e);
            }
        }
    };
    const route = (message) => {
        if (status === "destroyed")
            return;
        if (message.type === LucraClientMessageType.initialized) {
            onInitialized(message.data);
        }
        // An answer to one of our own requests is not also passed on as an event.
        if (requests.handle(message))
            return;
        inbound.emit(message.type, message.data);
    };
    if (!options.unsupported) {
        frame.onMessage(route);
        frame.mount(options.url);
    }
    return {
        status: () => status,
        whenConnected() {
            if (status === "destroyed") {
                return Promise.reject(new LucraError(LucraErrorCode.DESTROYED));
            }
            if (status === "connected")
                return Promise.resolve();
            if (status === "failed") {
                return Promise.reject(failure ?? new LucraError(LucraErrorCode.CONNECTION_FAILED));
            }
            return new Promise((resolve, reject) => {
                const waiter = {
                    resolve,
                    reject,
                    // Only this call gives up. The connection keeps trying.
                    timer: setTimeout(() => {
                        waiters.delete(waiter);
                        reject(new LucraError(LucraErrorCode.CONNECTION_TIMEOUT));
                    }, timeouts.connectMs),
                };
                waiters.add(waiter);
            });
        },
        onConnected(listener) {
            connectedListeners.add(listener);
            return () => {
                connectedListeners.delete(listener);
            };
        },
        request(spec, body) {
            if (status === "destroyed") {
                return Promise.reject(new LucraError(LucraErrorCode.DESTROYED));
            }
            return requests.send(spec, body);
        },
        post(type, body) {
            if (status === "destroyed")
                return;
            post(type, body);
        },
        on(type, listener) {
            return inbound.on(type, listener);
        },
        restart(url) {
            if (status === "destroyed" || options.unsupported)
                return;
            requests.rejectAll("CONNECTION_RESET");
            status = "connecting";
            failure = null;
            frame.reload(url);
        },
        destroy() {
            if (status === "destroyed")
                return;
            status = "destroyed";
            requests.rejectAll("DESTROYED");
            settleWaiters(new LucraError(LucraErrorCode.DESTROYED));
            connectedListeners.clear();
            inbound.clear();
            frame.destroy();
        },
    };
}
