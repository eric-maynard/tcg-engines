/**
 * Typed fetch client for the slice 6 goldfish + sealed endpoints.
 */

const opts: RequestInit = { credentials: "include" };

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) {msg = body.error;}
    } catch { /* Not json */ }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export interface GoldfishStartResponse {
  sessionId: string;
  deckId: string | null;
  mode: "goldfish";
}

export async function startGoldfish(
  deckId?: string,
): Promise<GoldfishStartResponse> {
  return asJson(
    await fetch("/api/goldfish/start", {
      ...opts,
      body: JSON.stringify({ deckId: deckId ?? null }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
}

export interface SealedCard {
  cardId: string;
  cardType: string;
  name: string;
  rarity?: string;
  imageUrl?: string;
}

export interface SealedPoolResponse {
  packs: number;
  seed: string;
  poolCards: SealedCard[];
}

export async function openSealedPool(
  packs = 6,
  seed?: string,
): Promise<SealedPoolResponse> {
  return asJson(
    await fetch("/api/sealed/open-pool", {
      ...opts,
      body: JSON.stringify({ packs, seed }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
}
