// Our API server (Node, no framework). Runs separately from the Vite app.
import { createServer } from "node:http";

const deposits: { userId: string; amount: number }[] = [];

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200).end("ok");
    return;
  }
  res.writeHead(404).end();
});

server.listen(Number(process.env.PORT ?? 8787));

export { deposits };
