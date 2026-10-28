import { LucraClient } from "lucra-web-sdk";

// Sandbox values; the real ones come from the Lucra Console.
export const client = LucraClient.initialize({
  apiKey: import.meta.env.VITE_LUCRA_API_KEY,
  tenantId: import.meta.env.VITE_LUCRA_TENANT_ID,
  env: "sandbox",
});

// Mount once, hidden, at startup.
client.open(document.getElementById("lucra-host")!, undefined, { hidden: true }).home();
