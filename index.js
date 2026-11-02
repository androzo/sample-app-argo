const http = require("http");
const os = require("os");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const pool = new Pool({
  host: process.env.POSTGRES_HOST || "postgres",
  port: Number(process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
});

let ready = false;

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function parseNoteId(pathname) {
  const match = pathname.match(/^\/api\/notes\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

async function initDb() {
  for (;;) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS notes (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          body TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      ready = true;
      console.log("Database ready");
      return;
    } catch (err) {
      ready = false;
      console.error("Waiting for database:", err.message);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname } = url;

  try {
    if (req.method === "GET" && (pathname === "/" || pathname === "/api/hello")) {
      json(res, 200, {
        message: "Hello World",
        hostname: os.hostname(),
        pid: process.pid,
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/healthz") {
      if (!ready) {
        json(res, 503, { status: "not ready" });
        return;
      }
      await pool.query("SELECT 1");
      json(res, 200, { status: "ok" });
      return;
    }

    if (req.method === "GET" && pathname === "/api/notes") {
      const result = await pool.query(
        "SELECT id, title, body, created_at FROM notes ORDER BY id DESC",
      );
      json(res, 200, { notes: result.rows, hostname: os.hostname() });
      return;
    }

    if (req.method === "POST" && pathname === "/api/notes") {
      const payload = await readBody(req);
      const title = String(payload.title || "").trim();
      const body = String(payload.body || "").trim();
      if (!title) {
        json(res, 400, { error: "title is required" });
        return;
      }
      const result = await pool.query(
        "INSERT INTO notes (title, body) VALUES ($1, $2) RETURNING id, title, body, created_at",
        [title, body],
      );
      json(res, 201, result.rows[0]);
      return;
    }

    const noteId = parseNoteId(pathname);
    if (noteId !== null) {
      if (req.method === "GET") {
        const result = await pool.query(
          "SELECT id, title, body, created_at FROM notes WHERE id = $1",
          [noteId],
        );
        if (!result.rows[0]) {
          json(res, 404, { error: "Not Found" });
          return;
        }
        json(res, 200, result.rows[0]);
        return;
      }

      if (req.method === "PUT") {
        const payload = await readBody(req);
        const title = String(payload.title || "").trim();
        const body = String(payload.body || "").trim();
        if (!title) {
          json(res, 400, { error: "title is required" });
          return;
        }
        const result = await pool.query(
          "UPDATE notes SET title = $1, body = $2 WHERE id = $3 RETURNING id, title, body, created_at",
          [title, body, noteId],
        );
        if (!result.rows[0]) {
          json(res, 404, { error: "Not Found" });
          return;
        }
        json(res, 200, result.rows[0]);
        return;
      }

      if (req.method === "DELETE") {
        const result = await pool.query(
          "DELETE FROM notes WHERE id = $1 RETURNING id",
          [noteId],
        );
        if (!result.rows[0]) {
          json(res, 404, { error: "Not Found" });
          return;
        }
        json(res, 204, {});
        return;
      }
    }

    json(res, 404, { error: "Not Found" });
  } catch (err) {
    console.error(err);
    json(res, 500, { error: "Internal Server Error" });
  }
});

initDb();
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (${os.hostname()})`);
});
