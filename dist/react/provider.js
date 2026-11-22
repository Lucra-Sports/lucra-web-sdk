import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext } from "react";
const LucraContext = createContext(null);
// Gives the hooks below it the client, from createLucraClient. The provider
// never creates or destroys it.
export function LucraProvider({ client, children, }) {
    return _jsx(LucraContext.Provider, { value: client, children: children });
}
// The client from the nearest LucraProvider.
export function useLucra() {
    const client = useContext(LucraContext);
    if (!client)
        throw new Error("useLucra must be used inside <LucraProvider>.");
    return client;
}
