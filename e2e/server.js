const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 6006;
const PAGES_DIR = path.join(__dirname, "pages");
const BUILD_DIR = path.join(__dirname, "..", "build");
const E2E_DIST = path.join(__dirname, "dist");

const server = http.createServer((req, res) => {
  // Serve e2e dist files (bundle)
  if (req.url.startsWith("/e2e/dist/")) {
    const filePath = path.join(__dirname, "..", req.url);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      const ext = path.extname(filePath);
      const contentType = {
        ".js": "application/javascript; charset=utf-8",
        ".map": "application/json",
      }[ext] || "text/plain";

      res.writeHead(200, {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  // Serve build files
  if (req.url.startsWith("/build/")) {
    const filePath = path.join(__dirname, "..", req.url);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);

      // Skip if it's a directory
      if (stat.isDirectory()) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      const ext = path.extname(filePath);
      const contentType = {
        ".js": "application/javascript; charset=utf-8",
        ".css": "text/css",
        ".map": "application/json",
      }[ext] || "text/plain";

      res.writeHead(200, {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  // Serve HTML pages
  const filePath = path.join(
    PAGES_DIR,
    req.url === "/" ? "base.html" : req.url
  );

  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    
    // Skip if it's a directory
    if (stat.isDirectory()) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const ext = path.extname(filePath);
    const contentType = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
    }[ext] || "text/plain";

    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`E2E test server running at http://localhost:${PORT}`);
});
