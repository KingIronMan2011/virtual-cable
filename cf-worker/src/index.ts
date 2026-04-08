export interface Env {
  DB: D1Database;
}

const VALID_HWID = /^[0-9a-f]{64}$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/event") {
      return new Response("Not found", { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const { hwid, event } = body as { hwid?: string; event?: string };

    if (!hwid || !VALID_HWID.test(hwid)) {
      return new Response("Invalid hwid", { status: 400 });
    }
    if (event !== "registered" && event !== "unregistered") {
      return new Response("Invalid event", { status: 400 });
    }

    const now = new Date().toISOString();

    if (event === "registered") {
      await env.DB.prepare(
        `INSERT INTO devices (hwid, first_seen, last_seen, active)
         VALUES (?, ?, ?, 1)
         ON CONFLICT(hwid) DO UPDATE SET last_seen = excluded.last_seen, active = 1`,
      )
        .bind(hwid, now, now)
        .run();
    } else {
      await env.DB.prepare(
        `UPDATE devices SET active = 0, last_seen = ? WHERE hwid = ?`,
      )
        .bind(now, hwid)
        .run();
    }

    return new Response("OK", { status: 200 });
  },
};
