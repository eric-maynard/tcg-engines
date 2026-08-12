/**
 * Interaction: Match mode (Bo3) sideboarding — a FORMAT convention with no core rule — colliding with
 * the deck-construction rules it must not break, and with battlefield rotation.
 *
 *   Startipped Peak       (ogn-288-298) Battlefield — "When you hold here, you may channel 1 rune exhausted."
 *   Hallowed Tomb         (ogn-281-298) Battlefield — "When you hold here, you may return your Chosen
 *                                        Champion from your trash to your Champion Zone if it is empty."
 *   The Candlelit Sanctum (ogn-291-298) Battlefield — "When you conquer here, look at the top two cards…"
 *
 * Q: A match deck presents those three battlefields, and the player registers (a) an EMPTY sideboard
 *    and (b) a 10-card sideboard. Sideboarding has no core rule at all — is that stated as a format
 *    convention rather than a rule? Between games, if the player swaps 10 in and only 7 out, does
 *    game 2 start with a 43/37-card Main Deck, or is the deck re-validated? Can a swap take the RUNE
 *    deck off 12, or add a fourth battlefield or a duplicate battlefield name? And the rotation trap:
 *    after a decided game the used battlefield leaves the match — is a presentable game 3 guaranteed,
 *    and is a duplicate name surfaced BEFORE game 1 rather than as an unpresentable game 3?
 *
 * A: Nothing in the rule set defines a sideboard, and the deck validator has no notion of one — a
 *    config carrying a sideboard validates exactly as the same config without it, and no error code
 *    mentions sideboards. So sideboarding is a format/organized-play convention an app implements; it
 *    may not cite a rule number it does not have. What the rules DO pin down is that legality is a
 *    property of the deck PRESENTED for each game, so every between-game swap must re-run the full
 *    103 validation before game 2 or 3 begins: 103.2 is a floor of 40, so 43 is legal and 37 is a hard
 *    error; 103.3.a is EXACTLY 12 runes, wrong in both directions; 103.4.a / 486.4.a fix the count at
 *    three battlefields (never four), and 103.4.c forbids two of the same NAME — the trap that would
 *    otherwise surface as an unpresentable game 3. An empty sideboard is perfectly legal: nothing can
 *    be swapped and game 2 uses the game-1 deck unchanged. Rotation (486.5 / 486.6): the used
 *    battlefield is removed only after a game someone WON, and the next game must be presented from
 *    what was set aside; with three distinctly-named battlefields a legal presentation always exists.
 *
 * Rules: 103.2 (Main Deck ≥ 40) · 103.3.a (exactly 12 runes) · 103.4.a (battlefield count by mode) ·
 * 103.4.c (distinct battlefield names) · 486.4.a (a match deck provides three) · 486.5 / 486.5.a
 * (the used battlefield leaves after a decided game; reusable if nobody won) · 486.6 (reset, remove,
 * choose from those set aside).
 */
import { describe, expect, test } from "bun:test";
import type { Domain } from "@tcg/riftbound-types";
import {
  type BattlefieldCard,
  type Card,
  type LegendCard,
  type RuneCard,
  type UnitCard,
  createCardId,
} from "@tcg/riftbound-types/cards";
import { type DeckConfig, validateDeck } from "../../../validators/deck-validators";
import type { Game } from "../../../harness";
import { P1, loadDefaultCardPool, scenario } from "../../../harness";

const STARTIPPED_PEAK = "ogn-288-298";
const HALLOWED_TOMB = "ogn-281-298";
const CANDLELIT_SANCTUM = "ogn-291-298";

/** Raw engine move — `startNextGame` lives outside the seat menus and works after the game ended. */
const raw = (game: Game, move: string, params: Record<string, unknown> = {}) =>
  game.engine.executeMove(move as never, {
    params: { playerId: P1, ...params } as never,
    playerId: P1 as never,
  });

let seq = 0;
const nextId = (): string => `msb-${(seq += 1)}`;

const legend: LegendCard = {
  cardType: "legend",
  championTag: "Tag",
  domain: ["fury"] as Domain[],
  id: createCardId("msb-legend"),
  name: "Match Legend",
};
const champion: UnitCard = {
  cardType: "unit",
  domain: "fury" as Domain,
  id: createCardId("msb-champion"),
  isChampion: true,
  might: 5,
  name: "Hero, Alpha",
  tags: ["Tag"],
};
const unit = (name: string): UnitCard => ({
  cardType: "unit",
  domain: "fury" as Domain,
  id: createCardId(nextId()),
  might: 2,
  name,
});
const rune = (): RuneCard => ({
  cardType: "rune",
  domain: "fury" as Domain,
  id: createCardId(nextId()),
  isBasic: true,
  name: "Fury Rune",
});
/** `size` main-deck cards headed by the Chosen Champion, never more than 3 of a name (103.2.b). */
const mainDeckOf = (size: number): Card[] => {
  const out: Card[] = [champion];
  for (let i = 0; out.length < size; i++) {
    out.push(unit(`Body ${Math.floor(i / 3) + 1}`));
  }
  return out;
};

/** The deck's three printed battlefields, loaded once. */
const printed = (async (): Promise<BattlefieldCard[]> => {
  const pool = await loadDefaultCardPool();
  return [STARTIPPED_PEAK, HALLOWED_TOMB, CANDLELIT_SANCTUM].map(
    (id) => pool.get(id) as unknown as BattlefieldCard,
  );
})();

const config = async (overrides: Partial<DeckConfig> = {}): Promise<DeckConfig> => ({
  battlefields: await printed,
  chosenChampion: champion,
  legend,
  mainDeck: mainDeckOf(40),
  mode: "match",
  runeDeck: Array.from({ length: 12 }, () => rune()),
  ...overrides,
});
const codes = (c: DeckConfig): string[] => validateDeck(c).errors.map((e) => e.code);
const codesOf = async (c: Promise<DeckConfig>): Promise<string[]> => codes(await c);

describe("Match sideboarding (a format convention) × deck legality × battlefield rotation", () => {
  test("setup: the deck presents Startipped Peak, Hallowed Tomb and The Candlelit Sanctum — three real, distinctly named battlefields, and the base list is legal for match play", async () => {
    const bfs = await printed;
    expect(bfs.map((b) => b.name)).toEqual([
      "Startipped Peak",
      "Hallowed Tomb",
      "The Candlelit Sanctum",
    ]);
    expect(new Set(bfs.map((b) => b.name)).size).toBe(3); // 103.4.c satisfied
    expect(validateDeck(await config()).errors).toEqual([]);
  });

  // ── sideboarding is a convention, not a rule ─────────────────────────────────────────────────

  test("the rules model no sideboard at all: a config carrying one validates identically to the same config without it, and no validation code mentions sideboards — an app must present it as a format convention, not cite a rule", async () => {
    const plain = await config();
    const withSideboard = {
      ...plain,
      // A 10-card sideboard, deliberately containing cards that would be ILLEGAL in the main deck
      // (a 4th copy of a name). Nothing about it is the rules' business.
      sideboard: Array.from({ length: 10 }, () => unit("Overplayed")),
    } as DeckConfig;
    expect(codes(withSideboard)).toEqual(codes(plain));
    expect(codes(withSideboard)).toEqual([]);
    const everyCode = [
      ...(await codesOf(config({ mainDeck: mainDeckOf(37) }))),
      ...(await codesOf(config({ runeDeck: [] }))),
      ...(await codesOf(config({ battlefields: [] }))),
    ];
    expect(everyCode.some((c) => /SIDEBOARD/i.test(c))).toBe(false);
  });

  test("an EMPTY sideboard is legal — nothing can be swapped, so game 2 presents the game-1 deck unchanged and re-validates clean (a no-op step, never a block)", async () => {
    const game1 = await config();
    const sideboard: Card[] = [];
    const game2 = await config({ mainDeck: [...game1.mainDeck] }); // no swap is possible
    expect(sideboard).toEqual([]);
    expect(validateDeck(game2).valid).toBe(true);
    expect(game2.mainDeck).toHaveLength(game1.mainDeck.length);
  });

  // ── every between-game swap is re-validated ──────────────────────────────────────────────────

  test("103.2 is a FLOOR, not an exact count: swapping 10 in and only 7 out leaves 43 and is legal, while 7 in / 10 out leaves 37 and is a hard MAIN_DECK_TOO_SMALL", async () => {
    const swapIn = async (n: number, out: number): Promise<DeckConfig> =>
      config({ mainDeck: mainDeckOf(40 - out + n) });
    expect((await swapIn(10, 7)).mainDeck).toHaveLength(43);
    expect(codes(await swapIn(10, 7))).toEqual([]);
    expect((await swapIn(7, 10)).mainDeck).toHaveLength(37);
    expect(codes(await swapIn(7, 10))).toEqual(["MAIN_DECK_TOO_SMALL"]);
    // …and the boundary itself: exactly 40 is legal.
    expect(await codesOf(config({ mainDeck: mainDeckOf(40) }))).toEqual([]);
  });

  test("103.3.a — a swap may never move the RUNE deck off 12, in either direction", async () => {
    expect(await codesOf(config({ runeDeck: Array.from({ length: 11 }, () => rune()) }))).toEqual([
      "RUNE_DECK_WRONG_SIZE",
    ]);
    expect(await codesOf(config({ runeDeck: Array.from({ length: 13 }, () => rune()) }))).toEqual([
      "RUNE_DECK_WRONG_SIZE",
    ]);
    expect(await codesOf(config({ runeDeck: Array.from({ length: 12 }, () => rune()) }))).toEqual([]);
  });

  test("103.4.a / 486.4.a — a match deck provides exactly three battlefields: a swap that adds a fourth (or drops to two) is an error", async () => {
    const extra: BattlefieldCard = {
      cardType: "battlefield",
      id: createCardId(nextId()),
      name: "Fourth Field",
    };
    const bfs = await printed;
    expect(await codesOf(config({ battlefields: [...bfs, extra] }))).toEqual([
      "WRONG_BATTLEFIELD_COUNT",
    ]);
    expect(await codesOf(config({ battlefields: bfs.slice(0, 2) }))).toEqual([
      "WRONG_BATTLEFIELD_COUNT",
    ]);
  });

  test("103.4.c — the duplicate-NAME trap is reported at deck registration, before game 1: swapping in a second Startipped Peak is DUPLICATE_BATTLEFIELD_NAME, so it can never surface as an unpresentable game 3", async () => {
    const bfs = await printed;
    const dupe: BattlefieldCard = {
      ...(bfs[0] as BattlefieldCard),
      id: createCardId(nextId()), // a different printing, the same printed NAME
    };
    const swapped = await config({
      battlefields: [bfs[0] as BattlefieldCard, bfs[1] as BattlefieldCard, dupe],
    });
    expect(codes(swapped)).toEqual(["DUPLICATE_BATTLEFIELD_NAME"]);
    expect(validateDeck(swapped).errors[0]?.message).toContain("Startipped Peak");
    // The registered three are distinct, so every game of the match has a legal presentation.
    expect(await codesOf(config())).toEqual([]);
  });

  // ── rotation across the match ────────────────────────────────────────────────────────────────

  test("486.5 / 486.6 — the battlefield used in a DECIDED game leaves the match: startNextGame is refused while the game is live, and once P1 has won it removes bf1 and refuses to present it again, while a set-aside field is accepted", async () => {
    const game = await scenario()
      .victoryScore(1)
      .battlefield("bf1", { controller: null, owner: P1 })
      .unit(P1, "base", { might: 2, name: "Filler U" }, "U")
      .card("spare", { def: { cardType: "battlefield", name: "Hallowed Tomb" }, owner: P1, zone: "hand" })
      .card("spare2", { def: { cardType: "battlefield", name: "The Candlelit Sanctum" }, owner: P1, zone: "hand" })
      .build();
    // 486.5.a — nothing is removed while the game is undecided.
    expect(raw(game, "startNextGame").success).toBe(false);

    await game.p1.move("U", "bf1"); // uncontested arrival ⇒ conquer ⇒ the 1-point victory score
    await game.settle();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);

    expect(raw(game, "startNextGame").success).toBe(true);
    const st = game.gameState as unknown as {
      status: string;
      match?: { gameNumber: number; results: unknown[]; usedBattlefields: string[] };
    };
    expect(st.status).toBe("setup");
    expect(st.match).toMatchObject({ gameNumber: 2, results: [{ winner: P1 }], usedBattlefields: ["bf1"] });
    expect(Object.keys(game.gameState.battlefields)).toEqual([]);

    // The used one is gone for the rest of the match; both set-aside ones remain presentable, so
    // games 2 AND 3 each have a legal choice.
    expect(raw(game, "selectBattlefield", { battlefieldId: "bf1", discardIds: [] }).success).toBe(false);
    expect(Object.keys(game.gameState.battlefields)).toEqual([]);
    expect(raw(game, "selectBattlefield", { battlefieldId: "spare2", discardIds: [] }).success).toBe(true);
    expect(Object.keys(game.gameState.battlefields)).toEqual(["spare2"]);
  });
});
