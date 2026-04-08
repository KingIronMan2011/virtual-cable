import { createHash } from "node:crypto";
import os from "node:os";

const ANALYTICS_ENDPOINT =
  "https://virtual-cable-analytics.kingironman2011.workers.dev/event";

let cachedHwid: string | null = null;

function getHwid(): string {
  if (cachedHwid) return cachedHwid;

  const mac =
    Object.values(os.networkInterfaces())
      .flat()
      .find(
        (iface) =>
          iface && !iface.internal && iface.mac !== "00:00:00:00:00:00",
      )?.mac ?? "";

  const raw = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model ?? "",
    mac,
  ].join("|");

  cachedHwid = createHash("sha256").update(raw).digest("hex");
  return cachedHwid;
}

export async function sendAnalyticsEvent(
  event: "registered" | "unregistered",
): Promise<void> {
  try {
    await fetch(ANALYTICS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hwid: getHwid(), event }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // fail silently — analytics must never crash or stall the app
  }
}
