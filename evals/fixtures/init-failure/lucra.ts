import { LucraClient } from "lucra-web-sdk";

const host = document.getElementById("lucra-host")!;

export const client = LucraClient.initialize({
  apiKey: import.meta.env.VITE_LUCRA_API_KEY,
  tenantId: import.meta.env.VITE_LUCRA_TENANT_ID,
  env: "production",
});

client.open(host, undefined, { hidden: true }).home();

// If Lucra isn't ready, send the user to log in so they can keep playing.
export async function startLucra() {
  try {
    await client.ready;
  } catch {
    client.open(host).login();
  }
}
