import { client } from "./lucra";

const app = document.getElementById("app")!;

// Deep link: /join?tournament=<id> joins straight away so the user lands in the game.
const tournamentId = new URLSearchParams(location.search).get("tournament");

async function joinFromLink(id: string) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { matchupId } = await client.api.joinTournament(id);
      app.textContent = `Joined ${matchupId}`;
      return;
    } catch (e) {
      console.warn(`join attempt ${attempt} failed`, e);
    }
  }
  app.textContent = "Lucra is down, try again later";
}

if (tournamentId) joinFromLink(tournamentId);
