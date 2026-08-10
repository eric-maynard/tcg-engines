/**
 * Interaction: Malzahar, Fanatic (ogn-113-298) · Champion Unit · Mind · 4 · 3 Might
 *     "Kill a friendly unit or gear, [Exhaust]: [Action] — [Add] [rainbow][rainbow]. (Use on your turn or
 *      in showdowns. Abilities that add resources can't be reacted to.)"
 *   × Treasure Trove (ogn-186-298) · Gear · Chaos · 2
 *     "When this leaves the board, draw 1 and channel 1 rune exhausted. [chaos], [Exhaust]: Kill this."
 *   (+ Discipline ogn-058-298 · Reaction · 2 · "Give a unit +2 [Might] this turn. Draw 1." as P2's answer,
 *    and an inline 0-energy [mind][mind] Action spell "Two Pip Bolt" for (c).)
 *
 * Question: P1 controls ready Malzahar and a Treasure Trove; P2 holds a Reaction and open resources.
 *   (a) P1's turn, Open State: P1 activates Malzahar killing the Trove. When does the Trove die, when does
 *       P1 have the 2 power, can P2 react to the Add, can P2 react to the Trove trigger — in what order?
 *   (b) In a showdown where P1 has Focus (either player's turn): is the ability listed, and does Focus
 *       pass to P2 after using it?
 *   (c) May P1 begin playing a spell it can only afford via Malzahar and sacrifice the Trove mid-payment?
 *   (d) Malzahar exhausted, or P2's turn with no showdown — listed?
 *
 * Rules: 404.1 + 355.10.c (the kill is a COST paid on activation, not a target), 400.2 / 429.2 / 429.2.a
 * (an [Add] ability resolves the moment it is finalized; priority never passes for it and it resolves
 * before any other outstanding item is finalized), 406.4 (ordinary triggered abilities do give opponents
 * priority), 347.1 ([Action] may be used with Focus in a showdown), 346.1 (a chain opened by an Add
 * ability does NOT pass Focus when it closes), 357.1.a / 429.3 (during Pay Costs only Add abilities with
 * the REACTION tag may be activated), 414.4 / 402.3 (unpayable [Exhaust] → not activatable).
 *
 * Expected: (a) Trove dies and Malzahar exhausts as the cost → +2 power immediately, nothing of Malzahar's
 * on the chain → the Trove's leave-the-board trigger is then finalized as a normal chain item: P1 then P2
 * get priority, P2 may respond with a Reaction; on resolution P1 draws 1 and channels 1 rune exhausted.
 * (b) Listed with Focus; after the whole chain (incl. the Trove trigger) closes P1 STILL has Focus.
 * (c) No — the spell is not even listed until the ability has actually been used. (d) Not listed.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MALZAHAR = "ogn-113-298";
const TREASURE_TROVE = "ogn-186-298";
const DISCIPLINE = "ogn-058-298";

/** Inline Action spell affordable ONLY through Malzahar's [Add]: 0 energy + two power pips. */
const TWO_PIP_BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 0,
  name: "Two Pip Bolt",
  powerCost: ["mind", "mind"],
  rulesText: "[Action] Deal 2 to a unit.",
  timing: "action",
} as const;

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1: ready Malzahar + Treasure Trove in base, the Two Pip Bolt in hand, EMPTY pool.
 * P2: a 2-Might Dummy in base, Discipline in hand and exactly its 2 energy (+1 spare calm).
 */
function board() {
  return scenario()
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", MALZAHAR, "malz")
    .gear(P1, TREASURE_TROVE, "trove")
    .unit(P2, "base", { might: 2, name: "Dummy" }, "dummy")
    .hand(P2, DISCIPLINE, "disc")
    .hand(P1, TWO_PIP_BOLT, "bolt");
}

/** (b, P1's turn) P1's Scout walks onto P2's empty bf2 → Non-Combat Showdown, P1 holds Focus. */
async function showdownOnP1Turn(): Promise<G> {
  const game = await board().unit(P1, "base", { might: 2, name: "Scout" }, "scout").build();
  await game.p1.move("scout", "bf2");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** (b, P2's turn) P2's Poker attacks P1's Wall at bf1; P2 passes Focus → P1 holds Focus on P2's turn. */
async function showdownOnP2Turn(): Promise<G> {
  const game = await board()
    .active(P2)
    .unit(P1, "bf1", { might: 5, name: "Wall" }, "wall")
    .unit(P2, "base", { might: 2, name: "Poker" }, "poker")
    .build();
  await game.p2.move("poker", "bf1");
  expect(game.chain()).toEqual([]);
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.turnPlayer()).toBe(P2);
  return game;
}

describe("Malzahar, Fanatic × Treasure Trove — the Trove is a cost, the Add resolves now, the trigger is reactable", () => {
  // ---- (a) P1's turn, Open State -----------------------------------------------------------------------

  test("(a) setup: the ability is listed and the Trove is offered as the cost object (a `sacrifice`, not a `targets` field — 355.10.c); the 2-pip spell is NOT playable yet", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "malz")).toBe(true);
    const opt = game.p1.option("activate", "malz");
    expect(opt?.fields.map((f) => f.arg)).toEqual(["sacrifice"]);
    // rule 404.1 / 355.10.c — the printed cost is "Kill a friendly UNIT OR GEAR" with no "another", and every part of
    // a cost is paid at once, so Malzahar itself is an offered cost object alongside the Trove.
    expect([...(opt?.fields[0]?.options ?? [])].sort()).toEqual(["malz", "trove"]);
    expect(game.p1.can("cast", "bolt")).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("(a) on activation the Trove dies and Malzahar exhausts as the COST, and the [Add] has ALREADY resolved: +2 power in pool, no Malzahar item ever on the chain (404.1, 400.2, 429.2)", async () => {
    const game = await board().build();
    await game.p1.activate("malz", 0, { sacrifice: "trove" });
    expect(game.zoneOf("trove")).toBe("trash");
    expect(game.state("malz").isExhausted).toBe(true);
    expect(game.p1.power()).toBe(2);
    expect(game.p1.power("rainbow")).toBe(2);
    expect(game.chain().some((i) => i.cardId === "malz")).toBe(false);
  });

  test("(a) the Trove's leave-the-board trigger is what sits on the chain afterwards — finalized only AFTER the Add resolved (429.2.a): pool already 2, hand/runes not yet changed, P1 holds priority first", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    const runes = game.p1.runes().length;
    await game.p1.activate("malz", 0, { sacrifice: "trove" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "trove", controller: P1, triggered: true })]);
    expect(game.p1.power()).toBe(2);
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.p1.runes()).toHaveLength(runes);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(a) P2 never gets a window against the Add — the first thing P2 ever sees is the Trove trigger with the 2 power already in P1's pool", async () => {
    const game = await board().build();
    await game.p1.activate("malz", 0, { sacrifice: "trove" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2, source: { cardId: "trove" } });
    expect(game.p1.power()).toBe(2);
    expect(game.chain().map((i) => i.cardId)).toEqual(["trove"]);
  });

  test("(a) P2 CAN react to the Trove trigger (406.4): Discipline is listed for P2 and goes on top of the same chain", async () => {
    const game = await board().build();
    await game.p1.activate("malz", 0, { sacrifice: "trove" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "disc")).toBe(true);
    await game.p2.cast("disc", { targets: "dummy" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["trove", "disc"]);
    expect(game.p2.energy()).toBe(0);
    await game.settle(); // LIFO: Discipline, then the Trove trigger
    expect(game.state("dummy").might).toBe(4);
    expect(game.chain()).toEqual([]);
  });

  test("(a) net order once everything resolves: Trove in trash → 2 power → draw 1 + channel 1 rune EXHAUSTED; back to P1's Open State", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    const runeDeck = game.p1.runeDeck().length;
    await game.p1.activate("malz", 0, { sacrifice: "trove" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("trove")).toBe("trash");
    expect(game.p1.power()).toBe(2);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.runeDeck()).toHaveLength(runeDeck - 1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ---- (b) showdown with P1's Focus ---------------------------------------------------------------------

  test("(b, P1's turn) in a Non-Combat Showdown where P1 holds Focus the [Action] ability IS listed (347.1)", async () => {
    const game = await showdownOnP1Turn();
    expect(game.p1.can("activate", "malz")).toBe(true);
    expect(game.p1.legal().map((o) => o.key)).toContain("activateAbility:malz#0");
  });

  test("(b, P1's turn) using it: +2 power at once, Trove trigger on the chain; after that chain closes P1 STILL holds Focus (346.1) and can now cast the 2-pip Action spell in the same showdown", async () => {
    const game = await showdownOnP1Turn();
    await game.p1.activate("malz", 0, { sacrifice: "trove" });
    expect(game.p1.power()).toBe(2);
    expect(game.chain().map((i) => i.cardId)).toEqual(["trove"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)?.focusPlayer).toBe(P1);
    expect(game.p1.can("cast", "bolt")).toBe(true);
  });

  test("(b, P1's turn) even if P2 reacts to the Trove trigger inside that chain, Focus still stays with P1 when it closes (346.1 — same chain, opened by the Add)", async () => {
    const game = await showdownOnP1Turn();
    await game.p1.activate("malz", 0, { sacrifice: "trove" });
    await game.p1.passPriority();
    await game.p2.cast("disc", { targets: "dummy" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["trove", "disc"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Discipline resolves
    await game.p1.passPriority();
    await game.p2.passPriority(); // Trove trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)?.focusPlayer).toBe(P1);
  });

  test("(b, P2's turn) in a combat showdown on P2's turn, once P1 holds Focus the ability is listed; after use and the trigger chain P1 keeps Focus (347.1, 346.1)", async () => {
    const game = await showdownOnP2Turn();
    expect(game.p1.can("activate", "malz")).toBe(true);
    await game.p1.activate("malz", 0, { sacrifice: "trove" });
    expect(game.p1.power()).toBe(2);
    expect(game.state("malz").isExhausted).toBe(true);
    expect(game.chain().map((i) => i.cardId)).toEqual(["trove"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)?.focusPlayer).toBe(P1);
    expect(game.p1.can("cast", "bolt")).toBe(true); // Action spell, P1 has Focus and now the power
  });

  // ---- (c) no mid-payment sacrifice ----------------------------------------------------------------------

  test("(c) a spell affordable ONLY via Malzahar is not listed and cannot be begun; trying it leaves the Trove on the board and the pool empty (357.1.a / 429.3 — [Action] Add is not a Pay-Costs mana source)", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "bolt")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "bolt")).toBe(false);
    const r = await game.p1.try((p) => p.cast("bolt", { targets: "dummy", sacrifice: "trove" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("trove")).toBe("base");
    expect(game.state("malz").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("dummy").damage).toBe(0);
  });

  test("(c) the legal line: activate Malzahar FIRST (Open State), then the spell becomes listed and is paid from the fresh power", async () => {
    const game = await board().build();
    await game.p1.activate("malz", 0, { sacrifice: "trove" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Trove trigger resolves
    expect(game.p1.can("cast", "bolt")).toBe(true);
    await game.p1.cast("bolt", { targets: "dummy" });
    expect(game.p1.power()).toBe(0);
    await game.settle();
    expect(game.zoneOf("dummy")).toBe("trash"); // 2 damage into 2 Might
    expect(game.zoneOf("bolt")).toBe("trash");
  });

  // ---- (d) not listed ------------------------------------------------------------------------------------

  test("(d) Malzahar already exhausted → [Exhaust] unpayable → not listed (414.4, 402.3)", async () => {
    const game = await scenario()
      .unit(P1, "base", MALZAHAR, "malz", { exhausted: true })
      .gear(P1, TREASURE_TROVE, "trove")
      .build();
    expect(game.p1.can("activate", "malz")).toBe(false);
    const r = await game.p1.try((p) => p.activate("malz", 0, { sacrifice: "trove" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("trove")).toBe("base");
    expect(game.p1.power()).toBe(0);
  });

  test("(d) P2's turn, Open State, no showdown → no [Action] window for P1 → not listed; nothing happens if attempted", async () => {
    const game = await board().active(P2).build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("activate", "malz")).toBe(false);
    const r = await game.p1.try((p) => p.activate("malz", 0, { sacrifice: "trove" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("trove")).toBe("base");
    expect(game.state("malz").isReady).toBe(true);
    expect(game.p1.power()).toBe(0);
  });
});
