/**
 * Live-app setup helpers for the affordance suite: a sandbox duel with a
 * custom deck (e.g. a legend with an activated ability) attached to a
 * BrowserBackend, plus small state builders over tutor / addResources / moves.
 */

import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool } from "../../harness";
import { BrowserBackend, attachBrowserGame } from "../../harness/browser";
import type { CardDefLike, Seat } from "../../harness/types";

export interface DeckOverrides {
  readonly legendId?: string;
  readonly championId?: string;
  readonly domains?: readonly [string, string];
  readonly battlefieldIds?: readonly string[];
}

interface DeckConfig {
  mainDeckCardIds: string[];
  runeDeckCardIds: string[];
  battlefieldIds: string[];
  legendId?: string;
  championId?: string;
}

/** A legal 40-card two-domain deck from the card pool (vanilla-ish units first), with optional legend/champion. */
export async function buildDeck(over: DeckOverrides = {}): Promise<DeckConfig> {
  const pool = await loadDefaultCardPool();
  const all = pool.all().filter((c): c is CardDefLike & { id: string } => typeof c.id === "string");
  const [d1, d2] = over.domains ?? ["fury", "chaos"];
  const doms = (c: CardDefLike) => (Array.isArray(c.domain) ? (c.domain as string[]) : c.domain ? [c.domain as string] : []);
  const legal = (c: CardDefLike) => doms(c).length > 0 && doms(c).every((d) => d === d1 || d === d2);
  const units = all
    .filter((c) => c.cardType === "unit" && !c.isChampion && legal(c))
    .sort((a, b) => Number(Boolean(a.rulesText)) - Number(Boolean(b.rulesText)) || (Number(a.energyCost ?? 9) - Number(b.energyCost ?? 9)));
  const mainDeckCardIds: string[] = [];
  for (const u of units) {
    if (mainDeckCardIds.length >= 40) {
      break;
    }
    mainDeckCardIds.push(u.id, u.id);
  }
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const rune1 = all.find((c) => c.name === `${cap(d1)} Rune`)?.id as string;
  const rune2 = all.find((c) => c.name === `${cap(d2)} Rune`)?.id as string;
  const runeDeckCardIds = Array.from({ length: 12 }, (_, i) => (i < 6 ? rune1 : rune2));
  const battlefieldIds = [...(over.battlefieldIds ?? all.filter((c) => c.cardType === "battlefield").slice(0, 3).map((c) => c.id))];
  const legend = over.legendId ? all.find((c) => c.id === over.legendId) : all.find((c) => c.cardType === "legend" && legal(c));
  let championId = over.championId;
  if (!championId && legend?.championTag) {
    championId = all.find((c) => c.cardType === "unit" && c.isChampion && (c.tags ?? []).includes(legend.championTag as string))?.id;
  }
  championId ??= all.find((c) => c.cardType === "unit" && c.isChampion && legal(c))?.id;
  return { battlefieldIds, championId, legendId: legend?.id, mainDeckCardIds: mainDeckCardIds.slice(0, 40), runeDeckCardIds };
}

export interface LiveGame {
  readonly backend: BrowserBackend;
  readonly game: Game;
  close(): Promise<void>;
}

/**
 * POST /api/game/create (sandbox duel, P1 first) with `deck1` for player-1,
 * open it in a fresh browser as player-1, keep the opening hand, and attach.
 */
export async function launchCustom(baseUrl: string, deck1: DeckConfig, opts: { deck2?: DeckConfig; viewport?: { width: number; height: number } } = {}): Promise<LiveGame> {
  const deck2 = opts.deck2 ?? (await buildDeck());
  const res = await fetch(`${baseUrl}/api/game/create`, {
    body: JSON.stringify({ deck1, deck2, sandbox: true }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const body = (await res.json().catch(() => ({}))) as { gameId?: string; error?: string };
  if (!res.ok || !body.gameId) {
    throw new Error(`game/create failed: ${body.error ?? res.status}`);
  }
  const browser = await BrowserBackend.startBrowser({ viewport: opts.viewport ?? { height: 1080, width: 1920 } });
  try {
    const page = browser.page;
    await page.goto(`${baseUrl}/login`, { timeout: 20_000, waitUntil: "load" });
    const rb = { gameId: body.gameId, isSandbox: true, lobbyRole: "host", playerNames: { [P1]: "Tester", [P2]: "Goldfish" }, viewingPlayer: P1 };
    await page.evaluate(`sessionStorage.setItem("rb_game", ${JSON.stringify(JSON.stringify(rb))})`);
    await page.goto(`${baseUrl}/play?cb=${Date.now()}`, { timeout: 20_000, waitUntil: "load" });
    // Mulligan: keep. The sandbox server completes the goldfish seat.
    const deadline = Date.now() + 20_000;
    for (;;) {
      const st = await page.evaluate<string>(
        `(() => { const gs = window.__rbGameState; if (gs && gs.status === "playing" && !(typeof pregameState !== "undefined" && pregameState && pregameState.phase)) return "ready"; const ov = document.querySelector("#pregameOverlay.visible"); const keep = ov && (ov.querySelector(".mulligan-btn-keep") || ov.querySelector("button:not([disabled])")); if (keep) { keep.click(); return "keep"; } return "wait"; })()`,
      );
      if (st === "ready") {
        break;
      }
      if (Date.now() > deadline) {
        throw new Error("custom game: board did not become playable");
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    const backend = await BrowserBackend.launch({ baseUrl, navigate: false, page, seat: P1 });
    return {
      backend,
      close: async () => {
        await backend.close().catch(() => undefined);
        await browser.shutdown();
      },
      game: attachBrowserGame(backend),
    };
  } catch (error) {
    await browser.shutdown();
    throw error;
  }
}

/** Standard /play/test goldfish game as player-1. */
export async function launchTest(baseUrl: string, viewport = { height: 1080, width: 1920 }): Promise<LiveGame> {
  const backend = await BrowserBackend.launch({ baseUrl, mode: "test", seat: P1, viewport });
  return { backend, close: () => backend.close(), game: attachBrowserGame(backend) };
}

/** Moves of one kind for a seat from the cached frame (refresh first if you just acted outside the backend). */
export function movesOf(backend: BrowserBackend, moveId: string, seat: Seat = P1) {
  return (backend.currentFrame.movesBySeat[seat] ?? []).filter((m) => m.moveId === moveId);
}

/** Tutor + play a unit for `seat` and settle its on-play prompts (first option). Returns the unit id. */
export async function fieldUnit(live: LiveGame, defId: string, seat: Seat = P1): Promise<string> {
  const { cardId } = await live.backend.tutor(defId, seat);
  if (seat === live.backend.viewingPlayer) {
    await live.game.seat(seat).play(cardId, { to: "base" });
  } else {
    const r = await live.backend.raw(seat, "playUnit", { cardId, location: "base" });
    if (!r.ok) {
      throw new Error(`fieldUnit(${defId}, ${seat}): ${r.error.message}`);
    }
  }
  await live.game.settle({ policy: "first" });
  return cardId;
}

/** End our turn, let the goldfish play, and settle into our next main phase. */
export async function cycleTurn(live: LiveGame): Promise<void> {
  const n = live.game.turnNumber();
  await live.game.p1.endTurn();
  await live.backend.waitFor((o) => o.turn.activePlayer === P1 && o.turn.number > n, { timeoutMs: 20_000 });
  await live.game.settle();
}
