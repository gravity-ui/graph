const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 6006;
const PAGES_DIR = path.join(__dirname, "pages");
const ROOT_DIR = path.join(__dirname, "..");

const CONTENT_TYPES = {
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css",
  ".map": "application/json",
  ".html": "text/html",
};

function serveFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    res.writeHead(403);
    res.end("Forbidden");
    return true;
  }

  const ext = path.extname(filePath);
  const contentType = CONTENT_TYPES[ext] || "text/plain";

  res.writeHead(200, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

const server = http.createServer((req, res) => {
  // Serve files from packages/ directory (library builds)
  if (req.url.startsWith("/packages/")) {
    const filePath = path.join(ROOT_DIR, req.url);
    if (serveFile(res, filePath)) return;
  }

  // Serve HTML pages
  const filePath = path.join(
    PAGES_DIR,
    req.url === "/" ? "base.html" : req.url
  );

  if (serveFile(res, filePath)) return;

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`E2E test server running at http://localhost:${PORT}`);
});
