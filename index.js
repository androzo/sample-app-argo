const http = require("http");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET" && (req.url === "/" || req.url === "/api/hello")) {
    res.writeHead(200);
    res.end(JSON.stringify({ message: "Hello World" }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not Found" }));
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
