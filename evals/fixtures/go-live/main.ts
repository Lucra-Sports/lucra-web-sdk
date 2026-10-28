import { LucraApiError, LucraApiErrorCode } from "lucra-web-sdk";
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
  try {
    const { matchupId } = await client.api.joinTournament(tournamentId);
    alert(`Joined! Matchup ${matchupId}`);
  } catch (e) {
    if (e instanceof LucraApiError && e.code === LucraApiErrorCode.insufficientFunds) {
      client.dialog().wallet(); // let them top up
    } else {
      alert("Could not join");
    }
  }
}

// Our own account menu.
export function signOut() {
  localStorage.removeItem("arcade-session");
  location.href = "/login";
}

document.getElementById("rules")?.addEventListener("click", () => client.dialog().home());

renderTournaments();
