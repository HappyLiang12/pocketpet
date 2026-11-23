import { createInterface } from "node:readline/promises";
import { urlsForPort } from "./net.js";

export type InterfaceMap = NonNullable<Parameters<typeof urlsForPort>[2]>;
export type QrHost = "ip" | "local";

export type PairingLinksOptions = {
  interfaces?: InterfaceMap;
  hostname?: string | null;
  qrHost?: QrHost;
};

export type PairingLinks = {
  ipUrls: string[];
  localUrl: string | null;
  qrUrl: string | null;
  /** Loopback URL for the USB (`adb reverse`) fallback; always carries the token. */
  usbUrl: string;
};

export type Asker = (question: string) => Promise<string>;

function pairingUrl(hostname: string, port: number, token: string): string {
  return `http://${hostname}:${port}/?token=${encodeURIComponent(token)}`;
}

/**
 * LAN pairing URLs. The QR defaults to the first IP address; `qrHost: "local"`
 * selects the Bonjour name instead when one is known.
 */
export function pairingLinks(port: number, token: string, opts: PairingLinksOptions = {}): PairingLinks {
  const ipUrls = urlsForPort(port, token, opts.interfaces);
  const hostname = opts.hostname?.trim();
  const localUrl = hostname ? pairingUrl(hostname, port, token) : null;
  const qrUrl = opts.qrHost === "local" && localUrl ? localUrl : (ipUrls[0] ?? null);
  const usbUrl = pairingUrl("127.0.0.1", port, token);
  return { ipUrls, localUrl, qrUrl, usbUrl };
}

async function readlineAsker(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

/** Ask a yes/no question; non-TTY callers get the default without a prompt. */
export async function askYesNo(
  question: string,
  defaultYes: boolean,
  tty: boolean,
  ask: Asker = readlineAsker,
): Promise<boolean> {
  if (!tty) return defaultYes;
  const label = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = (await ask(`${question} ${label} `)).trim().toLowerCase();
  if (answer === "y" || answer === "yes") return true;
  if (answer === "n" || answer === "no") return false;
  return defaultYes;
}
