import { client, startLucra } from "./lucra";

const app = document.getElementById("app")!;
app.textContent = "Connecting…";

startLucra().then(async () => {
  const { tournaments } = await client.api.tournaments();
  app.textContent = `${tournaments.length} tournaments available`;
});
