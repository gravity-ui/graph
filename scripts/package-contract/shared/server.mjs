import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sharedDirectory = path.dirname(fileURLToPath(import.meta.url));
const consumerDirectory = path.resolve(sharedDirectory, "../../..");
const port = Number(process.env.PACKAGE_CONTRACT_PORT ?? "4173");

const appDirectory = path.resolve(consumerDirectory, process.env.PACKAGE_CONTRACT_APP_DIR ?? "");
const files = new Map([
  ["/", { path: path.join(appDirectory, "index.html"), type: "text/html; charset=utf-8" }],
  ["/app.js", { path: path.join(consumerDirectory, "dist/app.js"), type: "text/javascript; charset=utf-8" }],
  ["/app.css", { path: path.join(consumerDirectory, "dist/app.css"), type: "text/css; charset=utf-8" }],
]);

createServer((request, response) => {
  const pathname = new URL(request.url ?? "/", `http://${request.headers.host}`).pathname;
  const file = files.get(pathname);

  if (!file) {
    response.writeHead(404).end("Not found");
    return;
  }

  response.writeHead(200, { "Content-Type": file.type });
  createReadStream(file.path).pipe(response);
}).listen(port, "127.0.0.1");
