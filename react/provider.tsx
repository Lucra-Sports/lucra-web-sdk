import { createContext, useContext, type ReactNode } from "react";
import type { LucraHeadlessClient } from "../headless/index.js";

const LucraContext = createContext<LucraHeadlessClient | null>(null);

// Gives the hooks below it the client, from createLucraClient. The provider
// never creates or destroys it.
export function LucraProvider({
  client,
  children,
}: {
  client: LucraHeadlessClient;
  children?: ReactNode;
}) {
  return <LucraContext value={client}>{children}</LucraContext>;
}

// The client from the nearest LucraProvider.
export function useLucra(): LucraHeadlessClient {
  const client = useContext(LucraContext);
  if (!client) throw new Error("useLucra must be used inside <LucraProvider>.");
  return client;
}
