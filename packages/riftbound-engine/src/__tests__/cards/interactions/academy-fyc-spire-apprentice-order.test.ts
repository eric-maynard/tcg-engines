/**
 * Interaction: The Academy (unl-216-219) · Battlefield
 *     "When you hold here, give your next spell this turn [Repeat] equal to its base cost."
 *   × Marai Spire (sfd-211-221) · Battlefield · "While you control this battlefield, friendly [Repeat] costs cost [1] less."
 *   × Eager Apprentice (ogn-084-298) · Unit · Mind · 3 · 3 Might — the unit holding the Spire
 *     "While I'm at a battlefield, the Energy costs for spells you play is reduced by [1], to a minimum of [1]."
 *   × Find Your Center (ogn-047-298) · Spell · Calm · 3 · Action
 *     "If an opponent's score is within 3 points of the Victory Score, this costs [2] less. Draw 1 and channel 1 rune exhausted."
 *
 * Question: P1 BEGINS the turn holding both The Academy (a Scholar on it) and Marai Spire (Eager Apprentice on
 * it). Victory Score 8; P2 sits at 6 (within 3). P1's first spell of the turn is Find Your Center (FYC).
 *   (a) Is a Repeat option offered on FYC and for how much; exact payment with Repeat elected; effect count?
 *   (b) Payment WITHOUT Repeat — 1 or 0? Which discount order must the engine pick?
 *   (c) P2 at 3 points instead (self-discount OFF): with / without Repeat?
 *   (d) P1 casts a cheap spell FIRST and FYC second: is Repeat still offered on FYC?
 *
 * Rules: 356.1.c ("base cost" = printed cost, not the modified one), 356.2.b.1 (Repeat is an optional additional
 * cost elected in step 2), 356.4.c (a discount on ONE component — Marai Spire on the Repeat cost — applies as that
 * component is added, before other discounts), 356.4.d / 356.4.d.1 (total-cost discounts afterwards, payer's
 * order), 356.4.e (a discount's minimum binds only that discount — Eager Apprentice / Sky Splitter example),
 * 820.1.c.1 (Repeat cost is an additional cost), 820.1.d.1 / 820.3 (paid instance = one more execution; played once).
 * Rulings: riftjudge Academy / Temporal Portal — the granted Repeat is priced at the spell's PRINTED cost.
 *
 * Expected:
 *   (a) Repeat [3] is offered (printed 3, regardless of FYC's own −2). Electing it: +[3], Spire −1 on that component
 *       → +[2]; running 5; then FYC −2 and Apprentice −1 (floor 1 binds only its own step) in either order → PAY 2.
 *       One chain item; instructions execute twice → draw 2 and channel 2 runes exhausted.
 *   (b) No Repeat: 3 → payer-optimal order Apprentice first (3→2), then FYC −2 → PAY 0 (FYC first would strand it at 1).
 *   (c) Condition off: Repeat → 3 + 2 = 5 → Apprentice → 4; no Repeat → 3 → 2.
 *   (d) No — "your next spell this turn": the cheap first spell consumed the grant; FYC second has no Repeat option.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_ACADEMY = "unl-216-219";
const MARAI_SPIRE = "sfd-211-221";
const EAGER_APPRENTICE = "ogn-084-298";
const FIND_YOUR_CENTER = "ogn-047-298";
/** Inline plain 1-cost spell (draw 1) — the "cheap spell cast first" of (d). */
const QUICK_STUDY = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Quick Study",
  timing: "action",
} as const;

const POOL = 10;

/**
 * End of P2's turn 2. P1 controls the live Academy (Scholar on it) and the live Marai Spire (Eager Apprentice on
 * it); Victory Score 8, P2 at `p2Points`. P1 holds FYC and a Quick Study. Rolling the turn makes P1 HOLD both.
 */
function board(p2Points: number) {
  return scenario()
    .turn(2)
    .active(P2)
    .victoryScore(8)
    .points(P2, p2Points)
    .battlefield("academy", { controller: P1, def: THE_ACADEMY, inert: false, owner: P1 })
    .battlefield("spire", { controller: P1, def: MARAI_SPIRE, inert: false, owner: P1 })
    .unit(P1, "academy", { might: 3, name: "Scholar" }, "scholar")
    .unit(P1, "spire", EAGER_APPRENTICE, "apprentice")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, FIND_YOUR_CENTER, "fyc")
    .hand(P1, QUICK_STUDY, "study");
}

/** Roll into P1's open Main Phase (both holds settle) and set P1's pool to exactly POOL energy, every rune tapped. */
async function intoP1Main(p2Points: number): Promise<Game> {
  const game = await board(p2Points).build();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
  await game.p1.tapRunes(game.p1.runes({ ready: true }).length);
  await game.p1.do("addResources", { energy: POOL - game.p1.energy() });
  expect(game.p1.energy()).toBe(POOL);
  expect(game.chain()).toEqual([]);
  return game;
}

const repeatMax = (game: Game, spell: string): number =>
  (game.p1.option("cast", spell)?.fields.find((f) => f.name === "repeatCount")?.max as number | undefined) ?? 0;

/** Is FYC castable (with the given args) from EXACTLY `energy`? */
async function fycCastableWith(p2Points: number, energy: number, args: Parameters<Game["p1"]["cast"]>[1] = {}): Promise<boolean> {
  const game = await intoP1Main(p2Points);
  await game.p1.do("addResources", { energy: energy - game.p1.energy() });
  expect(game.p1.energy()).toBe(energy);
  return (await game.p1.try((p) => p.cast("fyc", args))).ok;
}

describe("The Academy × Find Your Center × Marai Spire × Eager Apprentice — Repeat at base cost, component vs total discounts", () => {
  test("setup: after the turn rolls in P1 holds BOTH battlefields (+2 points), the Apprentice is AT the Spire, FYC prints 3, P2 is within 3 of Victory", async () => {
    const game = await intoP1Main(6);
    expect(game.p1.points()).toBe(2);
    expect(game.gameState.battlefields.academy?.controller).toBe(P1);
    expect(game.gameState.battlefields.spire?.controller).toBe(P1);
    expect(game.locationOf("apprentice")).toBe("spire");
    expect(game.state("fyc").energyCost).toBe(3);
    expect(game.p2.points()).toBe(6);
    expect(game.gameState.victoryScore).toBe(8);
    expect(game.gameState.nextSpellRepeat?.[P1] ?? 0).toBe(1);
  });

  // ── (a) condition ON, Repeat elected ─────────────────────────────────────────────────────────────

  test("(a) FYC — P1's next spell — offers exactly ONE Repeat instance (the Academy grant), even though FYC discounts itself (356.1.c: base cost = printed 3)", async () => {
    const game = await intoP1Main(6);
    expect(game.p1.can("cast", "fyc")).toBe(true);
    expect(repeatMax(game, "fyc")).toBe(1);
    expect((await game.p1.try((p) => p.cast("fyc", { repeat: 2 }))).ok).toBe(false);
  });

  test("(a) Repeat elected: 3 + [3 Repeat −1 Spire = 2] = 5, then FYC −2 and Apprentice −1 → exactly 2 energy paid in ONE playSpell; one chain item (820.3.a)", async () => {
    const game = await intoP1Main(6);
    const r = await game.p1.cast("fyc", { repeat: 1 });
    expect(r.executed.map((m) => m.moveId)).toEqual(["playSpell"]);
    expect(game.p1.energy()).toBe(POOL - 2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fyc", controller: P1, triggered: false })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("(a) that 2 is exact: castable with Repeat from precisely 2 energy, not from 1", async () => {
    expect(await fycCastableWith(6, 2, { repeat: 1 })).toBe(true);
    expect(await fycCastableWith(6, 1, { repeat: 1 })).toBe(false);
  });

  test("(a) resolution with Repeat: the instructions execute twice — P1 draws 2 and channels 2 runes, both EXHAUSTED (820.1.d.1)", async () => {
    const game = await intoP1Main(6);
    const hand0 = game.p1.hand().length;
    const runes0 = game.p1.runes().length;
    const runeDeck0 = game.p1.runeDeck().length;
    await game.p1.cast("fyc", { repeat: 1 });
    await game.settle();
    expect(game.zoneOf("fyc")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 2);
    expect(game.p1.runes()).toHaveLength(runes0 + 2);
    expect(game.p1.runeDeck()).toHaveLength(runeDeck0 - 2);
    expect(game.p1.runes({ ready: true })).toEqual([]); // every rune was tapped before; the 2 new ones entered exhausted
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) condition ON, Repeat declined ────────────────────────────────────────────────────────────

  test("(b) no Repeat: the engine takes the payer-optimal order — Apprentice first 3→2, then FYC −2 → pays 0 (356.4.d.1 / 356.4.e Sky Splitter example); castable from an EMPTY pool", async () => {
    const game = await intoP1Main(6);
    await game.p1.cast("fyc");
    expect(game.p1.energy()).toBe(POOL);
    expect(game.chain()).toHaveLength(1);
    expect(await fycCastableWith(6, 0)).toBe(true);
  });

  test("(b) resolution without Repeat: one execution — draw 1, channel 1 rune exhausted; the grant is consumed either way", async () => {
    const game = await intoP1Main(6);
    const hand0 = game.p1.hand().length;
    const runes0 = game.p1.runes().length;
    await game.p1.cast("fyc");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
    expect(game.p1.runes()).toHaveLength(runes0 + 1);
    expect(game.p1.runes({ ready: true })).toEqual([]);
    expect(game.gameState.nextSpellRepeat?.[P1] ?? 0).toBe(0);
    expect(repeatMax(game, "study")).toBe(0);
  });

  // ── (c) condition OFF (P2 at 3: 8 − 3 = 5 > 3) ───────────────────────────────────────────────────

  test("(c) P2 at 3 points — FYC's self-discount is off: with Repeat 3 + 2 = 5 → Apprentice → exactly 4; without Repeat 3 → 2", async () => {
    const withRepeat = await intoP1Main(3);
    expect(repeatMax(withRepeat, "fyc")).toBe(1);
    await withRepeat.p1.cast("fyc", { repeat: 1 });
    expect(withRepeat.p1.energy()).toBe(POOL - 4);

    const plain = await intoP1Main(3);
    await plain.p1.cast("fyc");
    expect(plain.p1.energy()).toBe(POOL - 2);
  });

  test("(c) those figures are exact: Repeat line castable from 4 not 3; plain line from 2 not 1 (Apprentice's floor of 1 never drags a 2 below… 2)", async () => {
    expect(await fycCastableWith(3, 4, { repeat: 1 })).toBe(true);
    expect(await fycCastableWith(3, 3, { repeat: 1 })).toBe(false);
    expect(await fycCastableWith(3, 2)).toBe(true);
    expect(await fycCastableWith(3, 1)).toBe(false);
  });

  test("(c) resolution is unchanged by the price: Repeat elected at 4 still draws 2 / channels 2 exhausted", async () => {
    const game = await intoP1Main(3);
    const hand0 = game.p1.hand().length;
    const runes0 = game.p1.runes().length;
    await game.p1.cast("fyc", { repeat: 1 });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 2);
    expect(game.p1.runes()).toHaveLength(runes0 + 2);
    expect(game.p1.runes({ ready: true })).toEqual([]);
  });

  // ── (d) a cheap spell first eats the grant ───────────────────────────────────────────────────────

  test("(d) the cheap Quick Study is P1's 'next spell': IT carries the grant (Repeat [1], Spire → [0]); cast plain for 1, and afterwards FYC offers NO Repeat and rejects {repeat: 1}", async () => {
    const game = await intoP1Main(6);
    expect(repeatMax(game, "study")).toBe(1);
    await game.p1.cast("study");
    expect(game.p1.energy()).toBe(POOL - 1);
    await game.settle();
    expect(game.zoneOf("study")).toBe("trash");
    expect(game.gameState.nextSpellRepeat?.[P1] ?? 0).toBe(0);
    expect(game.p1.can("cast", "fyc")).toBe(true);
    expect(repeatMax(game, "fyc")).toBe(0);
    expect((await game.p1.try((p) => p.cast("fyc", { repeat: 1 }))).ok).toBe(false);
    expect(game.zoneOf("fyc")).toBe("hand");
  });

  test("(d) FYC as the SECOND spell is then just (b): pays 0, one execution (draw 1, channel 1) — the Spire has nothing to discount", async () => {
    const game = await intoP1Main(6);
    await game.p1.cast("study");
    await game.settle();
    const hand0 = game.p1.hand().length;
    const runes0 = game.p1.runes().length;
    const energy0 = game.p1.energy();
    await game.p1.cast("fyc");
    expect(game.p1.energy()).toBe(energy0);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
    expect(game.p1.runes()).toHaveLength(runes0 + 1);
    expect(game.violations()).toEqual([]);
  });
});
