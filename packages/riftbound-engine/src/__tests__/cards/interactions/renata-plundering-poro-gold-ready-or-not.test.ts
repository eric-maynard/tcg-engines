/**
 * Interaction: Plundering Poro (sfd-069-221) · Unit · Mind · 2 · 2 Might
 *     "When I conquer, play a Gold gear token exhausted."
 *   × Renata Glasc, Industrialist (sfd-171-221) · Champion Unit · Order · 4 + [order] · 4 Might
 *     "Your tokens enter ready."
 *
 * Rules: 439.2–439.4 / 439.4.a (creating a token = its controller plays it; owner = the creating player),
 * 185.3.a.1 / 185.3.b / 187.5 (Gold = domainless, costless GEAR token "[Reaction] — Kill this, [Exhaust]: [Add]
 * [rainbow]"), 359.2.d (gear is played to its controller's BASE), 149.1 (gear enters ready by default) but 184.1
 * (the creating effect may stipulate the entry state — here "exhausted"), 369.3 / 375 ("Your tokens enter ready" is
 * an as-enters replacement of the entry event; it swaps whatever exhausted-entry the event carries for ready),
 * 182 / 183 (a token's controller = the controller of the effect that made it), 186.1 (a token that leaves the
 * board ceases to exist).
 *
 * Question / expected. P1's lone Poro walks into an UNCONTROLLED bf1, the empty showdown passes out, P1 conquers.
 *  (a) No Renata: one Gold gear token appears in P1's BASE, owner+controller P1, EXHAUSTED; [Exhaust] is part of its
 *      cost so P1 cannot cash it for [rainbow] until it readies (P1's next Awaken).
 *  (b) P1 also controls Renata: her replacement beats the creating effect's "exhausted" → the Gold enters READY and
 *      P1 may immediately Kill+Exhaust it for 1 [rainbow]; the token then ceases to exist.
 *  (c) Only P2 controls Renata: "YOUR tokens" — P1's Gold is not hers → EXHAUSTED exactly as in (a).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PLUNDERING_PORO = "sfd-069-221";
const RENATA = "sfd-171-221";

/** P1's turn; bf1 uncontrolled and empty; Poro ready in P1's base; `renata` says who (if anyone) has her in base. */
function board(renata: "none" | "p1" | "p2" = "none") {
  const s = scenario().battlefield("bf1", { controller: null }).unit(P1, "base", PLUNDERING_PORO, "poro");
  if (renata === "p1") {
    s.unit(P1, "base", RENATA, "renata");
  } else if (renata === "p2") {
    s.unit(P2, "base", RENATA, "renata");
  }
  return s;
}

const goldAnywhere = (game: Game) => game.findAll({ name: "Gold" }).filter((id) => game.has(id) && game.locationOf(id) !== undefined);

/** Poro → bf1 alone, non-combat showdown passes out, conquer trigger resolves. Returns the single Gold id. */
async function conquer(game: Game): Promise<string> {
  expect(goldAnywhere(game)).toEqual([]);
  await game.p1.move("poro", "bf1");
  await game.settle();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  const gold = goldAnywhere(game);
  expect(gold).toHaveLength(1);
  return gold[0] as string;
}

describe("(a) baseline, no Renata: the Gold is created in P1's base, EXHAUSTED, with the 187.5 characteristics", () => {
  test("where: in P1's BASE (359.2.d) — not at bf1 where the Poro conquered, not in P2's base; chain empty afterwards", async () => {
    const game = await board("none").build();
    const gold = await conquer(game);
    expect(game.zoneOf(gold)).toBe("base");
    expect(game.locationOf(gold)).toBe("base");
    expect(game.p1.base()).toContain(gold);
    expect(game.p2.base()).not.toContain(gold);
    expect(game.cardsAt("battlefield-bf1")).toEqual(["poro"]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("what: a gear TOKEN named Gold, no domain, cost 0, owner P1, controller P1 (187.5, 185.3, 439.4, 182/183)", async () => {
    const game = await board("none").build();
    const gold = await conquer(game);
    expect(game.state(gold)).toMatchObject({ cardType: "gear", controller: P1, energyCost: 0, isToken: true, name: "Gold", owner: P1 });
    expect(game.state(gold).domains).toEqual([]);
    expect(game.state(gold).powerCost).toEqual([]);
  });

  test("state: EXHAUSTED — the creating effect's stipulation (184.1) beats the gear default (149.1)", async () => {
    const game = await board("none").build();
    const gold = await conquer(game);
    expect(game.state(gold)).toMatchObject({ isExhausted: true, isReady: false });
  });

  test("[Exhaust] is part of the cost → P1 cannot cash it in this turn; after P1's next Awaken it is ready and Kill+Exhaust adds 1 [rainbow], the token ceasing to exist (186.1)", async () => {
    const game = await board("none").build();
    const gold = await conquer(game);
    expect(game.p1.can("activate", gold)).toBe(false);
    expect((await game.p1.try((p) => p.activate(gold))).ok).toBe(false);
    expect(game.p1.power("rainbow")).toBe(0);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 (Awaken readies the Gold)
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state(gold).isReady).toBe(true);
    expect(game.p1.can("activate", gold)).toBe(true);
    await game.p1.activate(gold);
    await game.settle();
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.has(gold)).toBe(false);
    expect(game.zoneOf(gold)).toBe("gone");
  });
});

describe("(b) P1 controls Renata: 'Your tokens enter ready' replaces the exhausted entry → READY, cashable at once", () => {
  test("the Gold enters READY in P1's base (369.3 / 375 beat the 'exhausted' stipulation riding on the entry event)", async () => {
    const game = await board("p1").build();
    const gold = await conquer(game);
    expect(game.zoneOf(gold)).toBe("base");
    expect(game.state(gold)).toMatchObject({ controller: P1, isExhausted: false, isReady: true, isToken: true, name: "Gold", owner: P1 });
    expect(game.state("renata").controller).toBe(P1);
  });

  test("P1 may IMMEDIATELY Kill+Exhaust it: +1 [rainbow] in P1's pool this very turn, the token is gone (186.1), nothing lands in P1's trash", async () => {
    const game = await board("p1").build();
    const gold = await conquer(game);
    expect(game.p1.can("activate", gold)).toBe(true);
    const trashBefore = game.p1.trash().length;
    await game.p1.activate(gold);
    await game.settle();
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.has(gold)).toBe(false);
    expect(game.zoneOf(gold)).toBe("gone");
    expect(game.p1.trash()).toHaveLength(trashBefore);
    expect(goldAnywhere(game)).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Renata herself and the Poro are non-token units and are unaffected: the Poro is exhausted at bf1 from its move, Renata untouched in base", async () => {
    const game = await board("p1").build();
    await conquer(game);
    expect(game.state("poro")).toMatchObject({ isExhausted: true, zone: "battlefield-bf1" });
    expect(game.state("renata")).toMatchObject({ isReady: true, zone: "base" });
  });
});

describe("(c) mirror — only P2 controls Renata: 'YOUR tokens' does not reach P1's Gold → EXHAUSTED as in (a)", () => {
  test("the Gold is P1's (controller of the Poro's ability, 182) and enters EXHAUSTED; P2's base gets nothing", async () => {
    const game = await board("p2").build();
    const gold = await conquer(game);
    expect(game.state("renata").controller).toBe(P2);
    expect(game.state(gold)).toMatchObject({ controller: P1, isExhausted: true, isReady: false, owner: P1, zone: "base" });
    expect(game.p1.base()).toContain(gold);
    expect(game.p2.base()).not.toContain(gold);
    expect(game.p2.base().filter((id) => game.state(id).name === "Gold")).toEqual([]);
  });

  test("…so P1 cannot cash it in this turn, exactly like the no-Renata baseline", async () => {
    const game = await board("p2").build();
    const gold = await conquer(game);
    expect(game.p1.can("activate", gold)).toBe(false);
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
