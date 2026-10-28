import { client } from "./lucra";

const app = document.getElementById("app")!;
const { tournaments } = await client.api.tournaments();
app.textContent = `${tournaments.length} tournaments`;
