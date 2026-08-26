import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sharedDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixturesDirectory = path.resolve(sharedDirectory, "..");
const consumerDirectory = path.resolve(fixturesDirectory, "..");
const appName = process.env.PACKAGE_CONTRACT_APP;
const port = Number(process.env.PACKAGE_CONTRACT_PORT ?? "4173");

if (appName !== "vanilla" && appName !== "react") {
  throw new Error('PACKAGE_CONTRACT_APP must be either "vanilla" or "react".');
}

const appDirectory = path.join(fixturesDirectory, "apps", appName);
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
