import { LucraClient } from "lucra-web-sdk";

export const client = LucraClient.initialize({
  apiKey: import.meta.env.VITE_LUCRA_API_KEY,
  tenantId: import.meta.env.VITE_LUCRA_TENANT_ID,
  env: "sandbox",
});

client.open(document.getElementById("lucra-host")!, undefined, { hidden: true }).home();
