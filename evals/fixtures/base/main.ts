import { client } from "./lucra";

const app = document.getElementById("app")!;

// Our own tournament list, rendered from Lucra data (headless).
async function renderTournaments() {
  const { tournaments } = await client.api.tournaments();
  app.innerHTML = "";
  for (const t of tournaments) {
    const button = document.createElement("button");
    button.textContent = `Join ${t.matchup?.pool_tournament_details?.title ?? "tournament"}`;
    button.addEventListener("click", () => joinTournament(t.matchupId));
    app.appendChild(button);
  }
}

async function joinTournament(tournamentId: string) {
  await client.ready;
  const { matchupId } = await client.api.joinTournament(tournamentId);
  alert(`Joined! Matchup ${matchupId}`);
}

renderTournaments();
