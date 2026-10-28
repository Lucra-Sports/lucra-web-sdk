import { client } from "./lucra";

const app = document.getElementById("app")!;

// Our app's own sign-out, wired to the account menu.
export async function signOut() {
  await fetch("/api/session", { method: "DELETE" });
  localStorage.removeItem("arcade-session");
  location.href = "/login";
}

document.getElementById("sign-out")?.addEventListener("click", () => signOut());

document.getElementById("wallet")?.addEventListener("click", () => client.dialog().wallet());

app.textContent = "Welcome back";
