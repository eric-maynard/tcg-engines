/**
 * Interaction: Petricite Monument (sfd-104-221) · Gear · Body · 2 — "[Temporary] Friendly units have [Deflect].
 *     (Opponents must pay [rainbow] to choose them with a spell or ability.)"
 *   × Hostile Takeover (sfd-202-221) · [Action] spell · Mind/Order · 5 + [rainbow][rainbow] — "Take control of an enemy
 *     unit at a battlefield. Ready it. (Start a combat if other enemies are there. Otherwise, conquer.) Lose control of
 *     that unit and recall it at end of turn."
 *   × Gust (ogn-169-298) · [Reaction] spell · Chaos · 1 — "Return a unit at a battlefield with 3 [Might] or less to its
 *     owner's hand."
 *
 * Question: P1's turn. P1 has Petricite Monument in base (+ a bystander ally to show the aura). P2's vanilla X (3 Might,
 * exhausted) is alone at battlefield B, which P2 controls; P2 has no Deflect source. P1 plays Hostile Takeover on X. P2
 * holds Gust with exactly 1 energy and 1 spare power.
 *   (a) Does P1 owe a Deflect surcharge to target X?
 *   (b) NO-side: P2 Gusts X in response — Deflect cost? Where does X go, what does Hostile Takeover then do?
 *   (c) YES-side: HT resolves first, then P2 Gusts X in the ensuing showdown — does X now have Deflect against P2, what
 *       does Gust cost, whose hand does X go to, what does HT's end-of-turn clause do, and does anyone hold B?
 *
 * Rules: 740.1.a (friendly = shares a controller), 809.1.c / 809.1.c.1 / 809.1.d (Deflect taxes OPPONENTS of the unit's
 * controller 1 power of any domain per choice, as a mandatory additional cost), 809.3 (having Deflect is a continuously
 * evaluated characteristic), 477.1.a (control-changing effect), 056.2 / 127.1 (a card returning to hand goes to its
 * OWNER's hand), 359.3.e.5 / 359.3.e.10 (sole target gone → spell resolves doing nothing, still played), 359.3.e.12
 * (delayed clause about an object no longer on the board → ignored), 190.3.a + 344.2 (unit becomes present at a
 * battlefield its controller doesn't control → Contested → non-combat showdown at next cleanup), 190.4.c / 323.6 (no
 * units there in an open state → lose the battlefield).
 *
 * Expected: (a) No — X is P2's, not friendly to the Monument; HT costs exactly 5 + 2 rainbow. (b) In response X is still
 * P2's and has no Deflect → Gust costs 1 energy only; X → P2's hand; HT resolves with no effect, goes to trash, costs
 * stay paid; B ends up uncontrolled. (c) After HT: X controlled by P1 (owner P2), readied, HAS Deflect; B Contested →
 * showdown; once P2 has Focus Gust is legal and costs 1 energy + 1 power (unplayable with no spare power); X → P2's hand
 * as a fresh P2 card; nobody has units at B → B uncontrolled, no points; at end of turn HT's clause does nothing — X
 * stays in P2's hand.
 */
import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PETRICITE_MONUMENT = "sfd-104-221";
const HOSTILE_TAKEOVER = "sfd-202-221";
const GUST = "ogn-169-298";

function targetsOffered(game: Game, seat: Seat, alias: string): string[] {
  const field = game.seat(seat).option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/**
 * P1's turn. P1: Petricite Monument + a 2-Might ally in base, Hostile Takeover in hand, exactly 5 energy + 2 rainbow.
 * P2: X (3, exhausted) alone at B (P2's), Gust in hand, exactly 1 energy + `p2power` (default one FURY pip — off-domain,
 * to show the Deflect pip may be of any domain).
 */
function board(p2power: Record<string, number> = { fury: 1 }) {
  return scenario()
    .resources(P1, { energy: 5, power: { rainbow: 2 } })
    .resources(P2, { energy: 1, power: p2power })
    .battlefield("bfB", { controller: P2 })
    .gear(P1, PETRICITE_MONUMENT, "monument")
    .unit(P1, "base", { might: 2, name: "P1 Ally" }, "ally")
    .unit(P2, "bfB", { might: 3, name: "X" }, "xx", { exhausted: true })
    .hand(P1, HOSTILE_TAKEOVER, "takeover")
    .hand(P2, GUST, "gust");
}

/** HT cast on X, P1 passes priority → P2 holds priority with HT on the chain (the (b) window). */
async function htOnChainP2Priority(p2power?: Record<string, number>): Promise<Game> {
  const game = await board(p2power).build();
  await game.p1.cast("takeover", { targets: "xx" });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

/** HT cast on X and resolved unopposed; `settle` hands back at the non-combat showdown at B with P1 holding Focus. */
async function htResolved(p2power?: Record<string, number>): Promise<Game> {
  const game = await board(p2power).build();
  await game.p1.cast("takeover", { targets: "xx" });
  const r = await game.settle();
  expect(r.reason).toBe("open");
  expect(game.zoneOf("takeover")).toBe("trash");
  return game;
}

/** …and P1 passes Focus so P2 may act in the showdown (the (c) window). */
async function p2FocusAfterHt(p2power?: Record<string, number>): Promise<Game> {
  const game = await htResolved(p2power);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  return game;
}

describe("Petricite Monument × Hostile Takeover × Gust — Deflect follows control, bounce goes to the owner", () => {
  // ── setup / (a) ───────────────────────────────────────────────────────────────────────────────
  test("setup: the Monument's aura gives Deflect to P1's units only (740.1.a) — P1's ally has it, P2's X does not", async () => {
    const game = await board().build();
    expect(game.state("ally").keywords).toContain("Deflect");
    expect(game.state("xx").keywords).not.toContain("Deflect");
    expect(game.state("xx")).toMatchObject({ controller: P2, isExhausted: true, location: "bfB", might: 3, owner: P2 });
  });

  test("(a) no Deflect surcharge for P1 to target X: Hostile Takeover offers X and costs exactly 5 energy + 2 rainbow", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "takeover")).toBe(true);
    expect(targetsOffered(game, P1, "takeover")).toEqual(["xx"]);
    await game.p1.cast("takeover", { targets: "xx" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "takeover", controller: P1, targets: ["xx"] })]);
    expect(game.state("xx").controller).toBe(P2); // nothing changes until resolution
  });

  // ── (b) Gust in response ──────────────────────────────────────────────────────────────────────
  test("(b) in response X is still P2's own unit with no Deflect → Gust is legal on it and costs P2 just 1 energy (power untouched)", async () => {
    const game = await htOnChainP2Priority();
    expect(game.state("xx").keywords).not.toContain("Deflect");
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(targetsOffered(game, P2, "gust")).toEqual(["xx"]);
    await game.p2.cast("gust", { targets: "xx" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 1 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["takeover", "gust"]);
  });

  test("(b) …so P2 can Gust in response even with ZERO spare power", async () => {
    const game = await htOnChainP2Priority({});
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "xx" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
  });

  test("(b) Gust resolves first: X returns to its owner's — P2's — hand (056.2 / 127.1)", async () => {
    const game = await htOnChainP2Priority();
    await game.p2.cast("gust", { targets: "xx" });
    await game.settle();
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("xx")).toBe("hand");
    expect(game.p2.hand()).toContain("xx");
    expect(game.p1.hand()).not.toContain("xx");
    expect(game.state("xx")).toMatchObject({ controller: P2, owner: P2 });
  });

  test("(b) Hostile Takeover then resolves with its only target gone → no effect, but it still counts as played: to trash, 5 + 2 rainbow stay spent, P1 controls nothing new (359.3.e.5 / 359.3.e.10)", async () => {
    const game = await htOnChainP2Priority();
    await game.p2.cast("gust", { targets: "xx" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("takeover")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.state("xx").controller).toBe(P2);
    expect(game.cardsAt("bfB")).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // no showdown — nothing became present at B
  });

  test("(b) with X gone P2 has no unit at B → P2 loses B at the next cleanup; nobody controls it, nobody scored (190.4.c / 323.6)", async () => {
    const game = await htOnChainP2Priority();
    await game.p2.cast("gust", { targets: "xx" });
    await game.settle();
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) HT resolves, then Gust in the showdown ────────────────────────────────────────────────
  test("(c) HT resolves unopposed: P1 now CONTROLS X (owner still P2), X is readied and stays at B (477.1.a)", async () => {
    const game = await htResolved();
    expect(game.state("xx")).toMatchObject({ controller: P1, isReady: true, location: "bfB", might: 3, owner: P2 });
  });

  test("(c) X is now friendly to the Monument → X HAS Deflect (aura re-evaluated continuously, 809.3 / 740.1.a)", async () => {
    const game = await htResolved();
    expect(game.state("xx").keywords).toContain("Deflect");
    expect(game.state("ally").keywords).toContain("Deflect"); // and P1's own unit still does
  });

  test("(c) B becomes Contested by P1 and a non-combat showdown opens (190.3.a / 344.2); P1 holds Focus first — Gust is NOT yet legal for P2", async () => {
    const game = await htResolved();
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p2.can("cast", "gust")).toBe(false);
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(targetsOffered(game, P2, "gust")).toEqual(["xx"]); // 3 Might, at a battlefield — legal object
  });

  test("(c) P2 is an OPPONENT of X's controller now → choosing X costs P2 an extra power of any domain: Gust = 1 energy + 1 (fury) power, exactly affordable (809.1.c / 809.1.c.1 / 809.1.d)", async () => {
    const game = await p2FocusAfterHt();
    expect(game.p2.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    await game.p2.cast("gust", { targets: "xx" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gust", controller: P2, targets: ["xx"] })]);
  });

  test("(c) contrast: with NO spare power the Deflect pip is unpayable → Gust on X is not legal for P2 at all (mandatory additional cost)", async () => {
    const game = await p2FocusAfterHt({});
    expect(game.p2.resources()).toEqual({ energy: 1, power: {} });
    expect(game.p2.can("cast", "gust")).toBe(false);
    expect(targetsOffered(game, P2, "gust")).toEqual([]);
    await expect(game.p2.cast("gust", { targets: "xx" })).rejects.toThrow();
    expect(game.zoneOf("gust")).toBe("hand");
    expect(game.p2.energy()).toBe(1);
    expect(game.state("xx")).toMatchObject({ controller: P1, location: "bfB" });
  });

  test("(c) Gust resolves: X goes to its OWNER's hand — P2's, not P1's — as a fresh P2 card (control change and Deflect gone) (056.2 / 127.1)", async () => {
    const game = await p2FocusAfterHt();
    await game.p2.cast("gust", { targets: "xx" });
    await game.settle();
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("xx")).toBe("hand");
    expect(game.p2.hand()).toContain("xx");
    expect(game.p1.hand()).not.toContain("xx");
    expect(game.state("xx")).toMatchObject({ controller: P2, might: 3, owner: P2 });
    expect(game.state("xx").keywords).not.toContain("Deflect");
  });

  test("(c) with X gone nobody has units at B: the showdown closes with no conquer — B is uncontrolled, P1 scores nothing, P2 (no units there) does not keep it either (190.4.c / 323.6)", async () => {
    const game = await p2FocusAfterHt();
    await game.p2.cast("gust", { targets: "xx" });
    await game.settle();
    const r = await game.settle(); // pass Focus through whatever is left of the showdown
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.cardsAt("bfB")).toEqual([]);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.scoredThisTurn[P1] ?? []).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(c) at end of turn Hostile Takeover's 'lose control and recall it' finds no object on the board → ignored: X simply stays in P2's hand, B still empty and uncontrolled (359.3.e.12)", async () => {
    const game = await p2FocusAfterHt();
    await game.p2.cast("gust", { targets: "xx" });
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("xx")).toBe("hand");
    expect(game.p2.hand()).toContain("xx");
    expect(game.state("xx")).toMatchObject({ controller: P2, owner: P2 });
    expect(game.cardsAt("bfB")).toEqual([]);
    expect(game.cardsAt("base")).not.toContain("xx");
    expect(game.gameState.battlefields.bfB?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("(c) contrast — if P2 does nothing in the showdown, P1 conquers B with the stolen X and scores 1 ('Otherwise, conquer.')", async () => {
    const game = await p2FocusAfterHt();
    await game.p2.passFocus();
    await game.settle();
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.state("xx")).toMatchObject({ controller: P1, location: "bfB" });
  });
});
