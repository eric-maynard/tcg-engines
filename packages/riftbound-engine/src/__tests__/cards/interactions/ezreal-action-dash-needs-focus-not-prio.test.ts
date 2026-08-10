/**
 * Interaction: Ezreal, Dashing (sfd-082-221) · Champion Unit · Mind · 4 · 3 Might
 *     "When I attack or defend, deal damage equal to my Might to an enemy unit here.
 *      I don't deal combat damage. [mind]: [Action] — Move me to your base."
 *   × Seal of Insight (ogn-120-298) · Gear · Mind · 0 · "[Exhaust]: [Reaction] — [Add] [mind]."
 *   × Vanguard Sergeant (ogn-219-298) · Unit · Order · 4 · 4 Might (vanilla)
 *
 * The classic judge question: can Ezreal ping the attacker and then dash home before combat damage?
 * P2's turn. P1 holds bfA with Ezreal and has a ready Seal of Insight in base, empty pool. P2
 * Standard-Moves the Sergeant into bfA.
 *   (a) While Ezreal's defend trigger sits on the Combat Chain and P1 holds PRIORITY (not Focus): may P1
 *       activate the Seal ([Reaction] [Add])? May P1 activate Ezreal's [Action] dash?
 *   (b) After that chain empties, who has Focus — may P1 dash now?
 *   (c) When exactly does the dash become legal, and who holds Focus after the dash's chain closes?
 *   (d) Final combat outcome.
 *
 * Rules: 464.2.c.1/345 (attacker P2 opens with Focus), 464.2.e + 337.4 (defend trigger is the only
 * Combat Chain item → P1 gets Priority), 813.1.c.2 + 309.1.a + 337.2/429.2 ([Reaction] [Add] is legal
 * for the priority holder in a Closed state, resolves at once, moves neither Priority nor Focus),
 * 806.1.b vs 806.1.c.2/813.1.c + 358.4/358.5 ([Action] grants showdown-Open permission only — not
 * Closed-state permission → illegal, undone at Check Legality), 346.1 (chain opened by a TRIGGER →
 * Focus does not pass when it empties), 335.1, 313.2/313.4 (need Focus AND Priority), 347.2.b (P2
 * passes → P1 gains Focus + Priority), 347.1/347.1.b (activated ability starts a chain; when it closes
 * Focus passes on), 449 (ability move; Ezreal drops the Defender tag on leaving, 323.2.c), 348.1 →
 * 465.1 (no defenders → no damage exchange), 466.1.a.1 (Combat Cleanup heals all units), 466.3.a /
 * 466.5 / 466.5.d (P2 wins, establishes control = Conquer, +1).
 *
 * Expected: (a) Seal yes (pool → 1 mind, nothing else changes); dash no. (b) Focus stays with P2; P1
 * still cannot dash. (c) Only after P2 passes Focus: P1 pays the floated mind, ability on the chain
 * (P1 → P2 pass) → Ezreal to base; Focus → P2. (d) P2 pass, P1 pass → showdown closes; no damage step;
 * Sergeant healed; P2 conquers bfA (+1); Ezreal safe in base having dealt his 3.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const EZREAL = "sfd-082-221";
const SEAL_OF_INSIGHT = "ogn-120-298";
const VANGUARD_SERGEANT = "ogn-219-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P2's turn. P1: Ezreal alone at bfA (P1-controlled), ready Seal of Insight in base, EMPTY pool. P2: Vanguard Sergeant in base. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bfA", { controller: P1 })
    .unit(P1, "bfA", EZREAL, "ezreal")
    .gear(P1, SEAL_OF_INSIGHT, "seal")
    .unit(P2, "base", VANGUARD_SERGEANT, "sergeant");
}

function showdown(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).at(-1);
}

/** Sergeant moved in → combat showdown open, Ezreal's defend trigger (→ Sergeant) on the Combat Chain, P1 holds priority. */
async function triggerPending(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("sergeant", "bfA");
  if (game.decision()?.kind === "pick") {
    await game.acting().pick("sergeant"); // the only enemy unit here
  }
  return game;
}

/** …P1 floated a mind off the Seal, both passed, the trigger resolved (Sergeant took 3). Chain empty, Focus P2. */
async function triggerResolved(): Promise<Game> {
  const game = await triggerPending();
  await game.p1.activate("seal");
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
  return game;
}

/** …P2 passed Focus → P1 holds Focus + Priority in the Showdown Open state. */
async function p1HasFocus(): Promise<Game> {
  const game = await triggerResolved();
  await game.p2.passFocus();
  return game;
}

/** …P1 dashed: ability on the chain, P1 pass, P2 pass → Ezreal home. */
async function dashed(): Promise<Game> {
  const game = await p1HasFocus();
  await game.p1.activate("ezreal");
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("(a) Priority without Focus on the Combat Chain", () => {
  test("combat opens at bfA: P2 is the Attacker and holds Focus (464.2.c.1, 345); Ezreal is a Defender; his defend trigger (target: Sergeant) is the only Combat Chain item, so P1 — its controller — holds PRIORITY (337.4)", async () => {
    const game = await triggerPending();
    expect(showdown(game)).toMatchObject({ battlefieldId: "bfA", focusPlayer: P2, isCombatShowdown: true });
    expect(game.state("ezreal").combatRole).toBe("defender");
    expect(game.state("sergeant").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ezreal", controller: P1, targets: ["sergeant"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("Seal of Insight ([Reaction] — [Add]) IS legal for the priority holder in this Closed state: it exhausts, P1's pool gains 1 mind, and neither the chain, nor Priority (still P1), nor Focus (still P2) changes (813.1.c.2, 309.1.a, 337.2, 429.2)", async () => {
    const game = await triggerPending();
    expect(game.p1.can("activate", "seal")).toBe(true);
    await game.p1.activate("seal");
    expect(game.state("seal").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ezreal", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(showdown(game)?.focusPlayer).toBe(P2);
  });

  test("Ezreal's dash is [Action]-only: even with the mind floated, P1 (Priority but no Focus, Closed state) is NOT offered it and an attempt is rejected — Ezreal stays put, the mind stays in the pool (806.1.b vs 813.1.c, 313.4, 358.4/358.5)", async () => {
    const game = await triggerPending();
    expect(game.p1.can("activate", "ezreal")).toBe(false); // before floating
    await game.p1.activate("seal");
    expect(game.p1.can("activate", "ezreal")).toBe(false); // and after — resources were never the problem
    expect(game.p1.legal().some((o) => o.key.startsWith("activateAbility:ezreal"))).toBe(false);
    const r = await game.p1.try((p) => p.activate("ezreal", 3));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("ezreal")).toBe("battlefield-bfA");
    expect(game.p1.power("mind")).toBe(1);
    expect(game.chain()).toHaveLength(1);
  });

  test("P1 pass, P2 pass → the defend trigger resolves: the Sergeant takes 3 (Ezreal's Might) and survives as a 4-Might unit at bfA", async () => {
    const game = await triggerResolved();
    expect(game.state("sergeant")).toMatchObject({ damage: 3, might: 4, zone: "battlefield-bfA" });
    expect(game.state("ezreal")).toMatchObject({ damage: 0, zone: "battlefield-bfA" });
  });
});

describe("(b) the Combat Chain empties — Focus does NOT pass (346.1)", () => {
  test("the chain was opened by a triggered ability, so when it empties Focus stays with P2, who also has Priority (335.1): it is P2's showdown decision; P1 holds neither and still cannot dash (313.4)", async () => {
    const game = await triggerResolved();
    expect(showdown(game)).toMatchObject({ focusPlayer: P2, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.legal()).toEqual([]);
    expect(game.p1.can("activate", "ezreal")).toBe(false);
    expect((await game.p1.try((p) => p.activate("ezreal", 3))).ok).toBe(false);
    expect(game.zoneOf("ezreal")).toBe("battlefield-bfA");
    expect(game.p1.power("mind")).toBe(1); // the floated mind is still waiting
  });
});

describe("(c) P2 passes Focus → NOW the [Action] dash is legally timed", () => {
  test("P2 passes (347.2.b) → P1 gains Focus AND Priority (313.2) in the Showdown Open state → Ezreal's '[mind]: [Action] — Move me to your base' is offered (806.1.c.2, 347.1)", async () => {
    const game = await p1HasFocus();
    expect(showdown(game)?.focusPlayer).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "ezreal")).toBe(true);
  });

  test("activating it spends the floated mind and starts a chain with a NON-triggered Ezreal item; P1 has priority, passes → P2 gets a response window; P2 passes → it resolves: Ezreal is in P1's base, undamaged, no longer a Defender (449, 323.2.c)", async () => {
    const game = await p1HasFocus();
    await game.p1.activate("ezreal");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ezreal", controller: P1, triggered: false })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.zoneOf("ezreal")).toBe("battlefield-bfA"); // not yet
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("ezreal")).toMatchObject({ combatRole: null, damage: 0, zone: "base" });
    expect(game.p1.base()).toContain("ezreal");
  });

  test("that chain was opened by an ACTIVATED ability (not a trigger / Add) → when it closes Focus passes to P2 with Priority (346, 347.1.b); the showdown is still the same combat showdown at bfA", async () => {
    const game = await dashed();
    expect(showdown(game)).toMatchObject({ battlefieldId: "bfA", focusPlayer: P2, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.state("sergeant")).toMatchObject({ combatRole: "attacker", zone: "battlefield-bfA" });
  });
});

describe("(d) the combat outcome", () => {
  test("P2 pass, P1 pass → the showdown closes with only attackers at bfA: no combat-damage exchange (465.1) — Ezreal sits in base with 0 damage having dealt his 3; P2 wins, establishes control of bfA = Conquer, scores 1 (466.3.a, 466.5, 466.5.d); back to P2's open main phase", async () => {
    const game = await dashed();
    await game.p2.passFocus();
    await game.p1.passFocus();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(showdown(game)).toBeUndefined();
    expect(game.state("ezreal")).toMatchObject({ combatRole: null, damage: 0, zone: "base" });
    expect(game.state("sergeant")).toMatchObject({ combatRole: null, zone: "battlefield-bfA" });
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.state("seal").isExhausted).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  // Expected (348.1 → 466.1.a.1, 143.3.b.2): closing a Combat Showdown proceeds through the remaining
  // Steps of Combat; the Resolution Step's Combat Cleanup inserts "3c. Heal all Units", so the Sergeant's
  // 3 damage from Ezreal's trigger is cleared even though no damage step happened. Actual: when the
  // defenders are gone before the showdown closes the engine skips the heal — the Sergeant keeps 3 damage.
  test("the Sergeant should be healed by the Combat Cleanup (466.1.a.1) — 0 damage after the combat, not 3", async () => {
    const game = await dashed();
    await game.p2.passFocus();
    await game.p1.passFocus();
    await game.settle();
    expect(game.gameState.battlefields.bfA?.controller).toBe(P2);
    expect(game.state("sergeant").damage).toBe(0);
  });

  test("contrast — no dash: if P1 just passes Focus back, the showdown closes with Ezreal still defending; 'I don't deal combat damage' means the Sergeant (4) takes nothing more while Ezreal (3) takes 4 → Ezreal dies and P2 conquers bfA anyway — the dash is what saves him", async () => {
    const game = await p1HasFocus();
    await game.p1.passFocus();
    await game.settle();
    expect(game.zoneOf("ezreal")).toBe("trash");
    expect(game.state("sergeant").zone).toBe("battlefield-bfA");
    expect(game.gameState.battlefields.bfA?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.power("mind")).toBe(1); // floated, never spent (it will empty at end of turn)
  });
});
