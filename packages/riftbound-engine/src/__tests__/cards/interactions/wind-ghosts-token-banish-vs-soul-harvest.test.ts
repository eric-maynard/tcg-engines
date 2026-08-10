/**
 * Interaction: Wind and Ghosts (ven-106-166) · Spell · Chaos · 3+[chaos] · Action
 *     "Choose a unit at a battlefield. If it has 3 [Might] or less, banish it. Otherwise, return it
 *      to its owner's hand."
 *   × Soul Harvest (unl-159-219) · Spell · Order · 2+[order]
 *     "Kill a unit at a battlefield with 3 [Might] or less."
 *   × Spoils of War (ogn-144-298) · Spell · Body · 4+[body] · Reaction
 *     "If an enemy unit has died this turn, this costs [2] less. Draw 2."
 *   on a Sand Soldier unit TOKEN (made by Royal Guard sfd-157-221) vs. a real 3-Might card.
 *   Oracles on the side: Vicious Snapjaws unl-129-219 (P2, "When another friendly unit dies, gain
 *   1 XP") and Immortal Phoenix ogn-037-298 in P1's trash ("When you kill a unit with a spell, you
 *   may pay [1][fury] to play me from your trash").
 *
 * Rules: 428.1 / 428.1.a.1 (Kill = board → trash by a Kill instruction), 428.2 / 428.2.a (killed =
 * origin on the board; placed in the trash), 428.5.b (the spell with the Kill instruction is
 * responsible), 427.1 / 427.2 (Banish = placed directly into Banishment from its origin), 427.2.a
 * (Banish is not a Kill), 427.2.b (not a Discard), 186.1 (a token put into any non-board zone
 * ceases to exist immediately after arriving there).
 *
 * Question: P1's turn; P1 holds Spoils of War. At P2's bf1: P2's 2-Might Sand Soldier token, P2's
 * 3-Might card C (and a 4-Might D).
 *   (a) Soul Harvest on the token — where does it go, does it still exist, was it killed (by whom),
 *       does Spoils now cost 2 less?
 *   (b) Wind and Ghosts on the token (≤3 → banish) — a death? anything in P2's banishment? discount?
 *   (c) Wind and Ghosts on card C (3) — where is C, did an enemy unit die?
 *   (d) Wind and Ghosts on D (4) — returned to hand; death?
 * Expected: (a) killed: board → P2's trash, ceases to exist there (trash empty) but the death DID
 * happen (die triggers fire, "an enemy unit has died" is true, killer = Soul Harvest / P1) → Spoils
 * costs 2+[body]. (b) banished, not killed: ceases to exist in banishment (zone empty), no death, no
 * die triggers, Spoils full price. (c) C sits in P2's banishment indefinitely; not a death; full
 * price. (d) D → owner's hand; not a death; full price. Only (a) discounts Spoils of War.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WIND_AND_GHOSTS = "ven-106-166";
const SOUL_HARVEST = "unl-159-219";
const SPOILS_OF_WAR = "ogn-144-298";
const ROYAL_GUARD = "sfd-157-221"; // 4-cost 2-Might: "When you play me, play a 2 [Might] Sand Soldier unit token here."
const VICIOUS_SNAPJAWS = "unl-129-219"; // 5 Might: "When another friendly unit dies, gain 1 XP."
const IMMORTAL_PHOENIX = "ogn-037-298"; // "When you kill a unit with a spell, you may pay [1][fury] to play me from your trash."

/**
 * P2's turn 2: P2 plays Royal Guard to its bf1 → the Sand Soldier token is made "here". Also at bf1:
 * P2's 3-Might Card C and 4-Might Big D; Vicious Snapjaws in P2's base (die-trigger oracle). Then
 * the turn passes to P1 (main phase) and P1 is given `energy` + 1 chaos/order/body. P1 holds Wind and
 * Ghosts, Soul Harvest and Spoils of War. Returns the game and the token's id.
 */
async function board(energy = 9, extra?: (s: ReturnType<typeof scenario>) => ReturnType<typeof scenario>): Promise<{ game: Game; token: string }> {
  let s = scenario()
    .active(P2)
    .resources(P2, { energy: 4 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Card C" }, "cardC")
    .unit(P2, "bf1", { might: 4, name: "Big D" }, "bigD")
    .unit(P2, "base", VICIOUS_SNAPJAWS, "snapjaws")
    .unit(P1, "base", { might: 1, name: "Homebody" }, "homebody")
    .hand(P2, ROYAL_GUARD, "rg")
    .hand(P1, WIND_AND_GHOSTS, "wg")
    .hand(P1, SOUL_HARVEST, "sh")
    .hand(P1, SPOILS_OF_WAR, "spoils");
  if (extra) {
    s = extra(s);
  }
  const game = await s.build();
  await game.p2.play("rg", { to: "bf1" });
  await game.settle();
  const tokens = game.findAll({ name: "Sand Soldier", owner: P2 });
  expect(tokens).toHaveLength(1);
  const token = tokens[0] as string;
  expect(game.state(token)).toMatchObject({ controller: P2, isToken: true, might: 2, zone: "battlefield-bf1" });
  await game.advanceTurn(); // → P1's turn 3, main phase (pools were emptied)
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
  await game.p1.do("addResources", { energy, power: { body: 1, chaos: 1, order: 1 } });
  expect(game.p2.xp()).toBe(0);
  return { game, token };
}

const offered = (game: Game, spell: string): string[] =>
  ((game.p1.option("cast", spell)?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][]).map((t) => t[0] as string).sort();

// biome-ignore lint/suspicious/noExplicitAny: read-only peeks at per-turn bookkeeping
const gs = (game: Game): any => game.gameState;

describe("Sand Soldier token: Soul Harvest (kill) vs Wind and Ghosts (banish / bounce) — and what Spoils of War makes of it", () => {
  test("targeting: both spells offer the token, Card C and Royal Guard (units at a battlefield ≤3 / any); Soul Harvest never offers 4-Might Big D, Wind and Ghosts does; base units are never offered", async () => {
    const { game, token } = await board();
    expect(offered(game, "sh")).toEqual(["cardC", "rg", token].sort());
    expect(offered(game, "wg")).toEqual(["bigD", "cardC", "rg", token].sort());
    expect(offered(game, "wg")).not.toContain("snapjaws");
    expect(offered(game, "wg")).not.toContain("homebody");
    // Before anything happens Spoils is full price: 4 + [body].
    expect(gs(game).turnEvents?.[P1] ?? []).not.toContain("enemy-died");
  });

  // ── (a) Soul Harvest KILLS the token ────────────────────────────────────────────────────────

  test("(a) Soul Harvest on the token: it is killed board → trash and, being a token, ceases to exist there (186.1) — not on the board, not in P2's trash, `has()` false, zone 'gone'", async () => {
    const { game, token } = await board();
    await game.p1.cast("sh", { targets: token });
    expect(game.p1.resources()).toEqual({ energy: 7, power: { body: 1, chaos: 1, order: 0 } });
    await game.settle();
    expect(game.zoneOf(token)).toBe("gone");
    expect(game.has(token)).toBe(false);
    expect(game.p2.trash()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.p2.units("bf1").sort()).toEqual(["bigD", "cardC", "rg"]);
    expect(game.zoneOf("sh")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(a) …but the death DID happen (origin was the board, 428.2.a): a `die` event for the token, P2 saw a friendly unit die, P1 saw an enemy unit die, last-killed = the token under P2's control", async () => {
    const { game, token } = await board();
    await game.p1.cast("sh", { targets: token });
    await game.settle();
    expect(gs(game).turnEventCounts?.[`die|c:${token}`]).toBe(1);
    expect(gs(game).turnEventCounts?.["die|p:player-2"]).toBe(1);
    expect(gs(game).turnEvents?.[P2]).toContain("friendly-died");
    expect(gs(game).turnEvents?.[P1]).toContain("enemy-died");
    expect(gs(game).lastKilledUnitId).toBe(token);
    expect(gs(game).lastKilledUnitController).toBe(P2);
    expect(gs(game).lastKilledUnitMight).toBe(2);
  });

  test("(a) 'when a unit dies' triggers fire for the token's death: P2's Vicious Snapjaws gains P2 1 XP", async () => {
    const { game, token } = await board();
    await game.p1.cast("sh", { targets: token });
    await game.settle();
    expect(game.p2.xp()).toBe(1);
  });

  test("(a) killedBy = Soul Harvest, responsible = P1 (428.5.b): Immortal Phoenix in P1's trash sees 'you killed a unit with a spell' and offers P1 its optional [1][fury] replay", async () => {
    const { game, token } = await board(9, (s) => s.trash(P1, IMMORTAL_PHOENIX, "phoenix"));
    await game.p1.do("addResources", { power: { fury: 1 } });
    await game.p1.cast("sh", { targets: token });
    const settled = await game.settle();
    // The optional "you may pay [1][fury] to play me" is P1's to answer — proof the kill is credited to P1's spell.
    expect(settled.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.decision()?.source?.cardId).toBe("phoenix");
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(a) → Spoils of War now costs [2] less: with only 2 energy + [body] left it IS castable, pays exactly 2 + body, and P1 draws 2", async () => {
    const { game, token } = await board(4); // 4 − 2 (Soul Harvest) = 2 left
    await game.p1.cast("sh", { targets: token });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 2, power: { body: 1, chaos: 1, order: 0 } });
    expect(game.p1.can("cast", "spoils")).toBe(true);
    const hand = game.p1.hand().length;
    const deck = game.p1.deck().length;
    await game.p1.cast("spoils");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, chaos: 1, order: 0 } });
    await game.settle();
    expect(game.zoneOf("spoils")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 2);
    expect(game.p1.deck()).toHaveLength(deck - 2);
  });

  // ── (b) Wind and Ghosts BANISHES the token ──────────────────────────────────────────────────

  test("(b) Wind and Ghosts on the 2-Might token: 2 ≤ 3 → banished directly from the board (427.2); the token ceases to exist on arrival (186.1) → P2's banishment holds NO Sand Soldier, nor does the trash or hand", async () => {
    const { game, token } = await board();
    await game.p1.cast("wg", { targets: token });
    expect(game.p1.resources()).toEqual({ energy: 6, power: { body: 1, chaos: 0, order: 1 } });
    await game.settle();
    expect(game.zoneOf(token)).toBe("gone");
    expect(game.has(token)).toBe(false);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.p2.hand()).not.toContain(token);
    expect(game.findAll({ name: "Sand Soldier" })).toEqual([]);
    expect(game.p2.units("bf1").sort()).toEqual(["bigD", "cardC", "rg"]);
    expect(game.zoneOf("wg")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(b) banish is NOT a kill (427.2.a): no `die` event, nobody 'died' for either player, no last-killed record, a `banish` event instead — and Snapjaws gains no XP", async () => {
    const { game, token } = await board();
    await game.p1.cast("wg", { targets: token });
    await game.settle();
    expect(gs(game).turnEventCounts?.die).toBeUndefined();
    expect(gs(game).turnEventCounts?.[`die|c:${token}`]).toBeUndefined();
    expect(gs(game).turnEventCounts?.[`banish|c:${token}`]).toBe(1);
    expect(gs(game).turnEvents?.[P2] ?? []).not.toContain("friendly-died");
    expect(gs(game).turnEvents?.[P1] ?? []).not.toContain("enemy-died");
    expect(gs(game).lastKilledUnitId).toBeUndefined();
    expect(game.p2.xp()).toBe(0);
  });

  test("(b) killedBy = ∅: Immortal Phoenix in P1's trash is NOT offered after the banish (nothing was killed with a spell)", async () => {
    const { game, token } = await board(9, (s) => s.trash(P1, IMMORTAL_PHOENIX, "phoenix"));
    await game.p1.do("addResources", { power: { fury: 1 } });
    await game.p1.cast("wg", { targets: token });
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("phoenix")).toBe("trash");
  });

  test("(b) → Spoils of War stays FULL price: with 2 energy + [body] left it is NOT castable; with 4 left it costs exactly 4 + body", async () => {
    const tight = await board(5); // 5 − 3 (W&G) = 2 left
    await tight.game.p1.cast("wg", { targets: tight.token });
    await tight.game.settle();
    expect(tight.game.p1.resources()).toEqual({ energy: 2, power: { body: 1, chaos: 0, order: 1 } });
    expect(tight.game.p1.can("cast", "spoils")).toBe(false);

    const { game, token } = await board(7); // 7 − 3 = 4 left
    await game.p1.cast("wg", { targets: token });
    await game.settle();
    expect(game.p1.energy()).toBe(4);
    expect(game.p1.can("cast", "spoils")).toBe(true);
    const hand = game.p1.hand().length;
    await game.p1.cast("spoils");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, chaos: 0, order: 1 } });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand - 1 + 2); // it still draws 2, of course
  });

  // ── (c) Wind and Ghosts on the real 3-Might CARD ────────────────────────────────────────────

  test("(c) Wind and Ghosts on Card C (3 Might, a card): banished board → P2's banishment and it STAYS there (a card does not cease to exist); not in the trash, not in hand", async () => {
    const { game } = await board();
    await game.p1.cast("wg", { targets: "cardC" });
    await game.settle();
    expect(game.zoneOf("cardC")).toBe("banishment");
    expect(game.has("cardC")).toBe(true);
    expect(game.p2.banishment()).toEqual(["cardC"]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.p2.hand()).not.toContain("cardC");
    expect(game.state("cardC")).toMatchObject({ damage: 0, might: 3, owner: P2, zone: "banishment" });
  });

  test("(c) still not a kill: no die event, no 'enemy unit has died', Snapjaws 0 XP → Spoils of War full price (2 left → not castable)", async () => {
    const { game } = await board(5);
    await game.p1.cast("wg", { targets: "cardC" });
    await game.settle();
    expect(gs(game).turnEventCounts?.die).toBeUndefined();
    expect(gs(game).turnEventCounts?.["banish|c:cardC"]).toBe(1);
    expect(gs(game).turnEvents?.[P1] ?? []).not.toContain("enemy-died");
    expect(gs(game).lastKilledUnitId).toBeUndefined();
    expect(game.p2.xp()).toBe(0);
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("cast", "spoils")).toBe(false);
  });

  test("(c) 'indefinitely': two turns later Card C is still face up in P2's banishment", async () => {
    const { game } = await board();
    await game.p1.cast("wg", { targets: "cardC" });
    await game.settle();
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1
    expect(game.zoneOf("cardC")).toBe("banishment");
    expect(game.p2.banishment()).toEqual(["cardC"]);
  });

  // ── (d) Wind and Ghosts on a 4-Might unit ───────────────────────────────────────────────────

  test("(d) Wind and Ghosts on Big D (4 Might): 4 > 3 → returned to its OWNER's (P2's) hand — a move to hand, not a kill: no die event, nothing banished, Snapjaws 0 XP", async () => {
    const { game } = await board();
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("wg", { targets: "bigD" });
    await game.settle();
    expect(game.zoneOf("bigD")).toBe("hand");
    expect(game.state("bigD").owner).toBe(P2);
    expect(game.p2.hand()).toContain("bigD");
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.p2.trash()).toEqual([]);
    expect(gs(game).turnEventCounts?.die).toBeUndefined();
    expect(gs(game).turnEventCounts?.banish).toBeUndefined();
    expect(gs(game).turnEvents?.[P1] ?? []).not.toContain("enemy-died");
    expect(gs(game).lastKilledUnitId).toBeUndefined();
    expect(game.p2.xp()).toBe(0);
  });

  test("(d) → Spoils of War full price after the bounce (2 left → not castable; 4 left → pays 4 + body)", async () => {
    const tight = await board(5);
    await tight.game.p1.cast("wg", { targets: "bigD" });
    await tight.game.settle();
    expect(tight.game.p1.energy()).toBe(2);
    expect(tight.game.p1.can("cast", "spoils")).toBe(false);

    const { game } = await board(7);
    await game.p1.cast("wg", { targets: "bigD" });
    await game.settle();
    await game.p1.cast("spoils");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, chaos: 0, order: 1 } });
  });

  // ── summary: only (a) satisfies Spoils of War ───────────────────────────────────────────────

  test("summary — same 4-energy budget after the first spell resolves: only the Soul Harvest line leaves Spoils of War castable for 2", async () => {
    const lines: { spell: "sh" | "wg"; target: "token" | "cardC" | "bigD"; discounted: boolean }[] = [
      { discounted: true, spell: "sh", target: "token" },
      { discounted: false, spell: "wg", target: "token" },
      { discounted: false, spell: "wg", target: "cardC" },
      { discounted: false, spell: "wg", target: "bigD" },
    ];
    for (const line of lines) {
      const cost = line.spell === "sh" ? 2 : 3;
      const { game, token } = await board(cost + 2); // exactly 2 energy left afterwards
      await game.p1.cast(line.spell, { targets: line.target === "token" ? token : line.target });
      await game.settle();
      expect(game.p1.energy()).toBe(2);
      expect({ line, castable: game.p1.can("cast", "spoils") }).toEqual({ castable: line.discounted, line });
    }
  });
});
