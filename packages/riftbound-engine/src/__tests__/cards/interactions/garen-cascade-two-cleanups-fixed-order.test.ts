/**
 * Interaction: Garen, Commander (ogs-013-024) · Champion Unit · Order · 6 · 5 Might
 *     "Other friendly units have +1 [Might] here."
 *   × Undercover Agent (ogn-178-298) · Unit · Chaos · 5 · 5 Might
 *     "[Deathknell] — Discard 2, then draw 2."
 *   × Watchful Sentry (ogn-096-298) · Unit · Mind · 2 · 1 Might
 *     "[Deathknell] — Draw 1."
 *   × Flurry of Blades (ogn-133-298) · Spell · Body · 1+[body] · [Reaction] "Deal 1 to all units at battlefields."
 *
 * Question (P1's turn; P2 holds bf1 with Garen 5 carrying 4, Undercover Agent 5+1=6 carrying 4, Watchful
 * Sentry 1+1=2 carrying 1; P2's hand is exactly one card H; P2's deck top is D1, D2, D3). P1 resolves Flurry.
 *   (a) Which units die in the Cleanup right after Flurry leaves the chain, which only in a cascaded Cleanup?
 *   (b) Are the Sentry's and the Agent's Deathknells "simultaneous" — is anyone asked to order them? In what
 *       order are they finalized / resolved, and is either resolved INSIDE a Cleanup?
 *   (c) P2's final hand and trash?
 *   (d) Does anyone receive priority between the two deaths?
 *
 * Rules: 319.5 (Cleanup after an item leaves the chain), 323.4/323.5 (3a queue Deathknells as Pending items,
 * 808.1.d.2; 3b lethal units to trash simultaneously), 319.6 + 322/322.1 (Garen leaving the board during C1
 * makes a NEW Cleanup C2 outstanding, run right after C1 — not nested), 320/320.1 (nothing is finalized,
 * resolved or given priority during a Cleanup), 383.3.d (ordering applies to SIMULTANEOUS triggers only),
 * 337.1/337.1.b (Pending items are finalized in append order — Sentry DK bottom, Agent DK top), 334.2 (FEPR
 * only after all Cleanups), 337.4 (controller of the newest item — P2 — gets priority first), LIFO resolution
 * (Agent DK first, then Sentry DK), 359.3.e.11 ("Discard 2" with one card discards that one), 323.6 (bf1 is
 * lost once the state is Open with no P2 unit there).
 *
 * Expected: (a) C1 kills Garen (5/5) and Sentry (2/2); Agent (5/6) survives C1, then with the aura gone is 5/5
 * and dies in C2. (b) Not simultaneous → NO order decision for anyone; chain bottom→top = [Sentry DK, Agent DK];
 * neither resolved inside a Cleanup; P2 holds priority first. (c) Agent DK: discard H, draw D1+D2; Sentry DK:
 * draw D3 → hand {D1,D2,D3}, trash gains H + Garen + Sentry + Agent. (d) No — the first decision anyone sees is
 * P2's priority with both Deathknells already on the chain. Afterwards bf1 is uncontrolled.
 * Contrast (discriminates b): had the Agent carried 5 damage (lethal in C1 too) both Deathknells WOULD be
 * simultaneous and P2 is offered the 383.3.d order decision.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GAREN = "ogs-013-024";
const UNDERCOVER_AGENT = "ogn-178-298";
const WATCHFUL_SENTRY = "ogn-096-298";
const FLURRY = "ogn-133-298";
const SKULKER = "ogn-175-298"; // vanilla filler for H / D1..D4

/**
 * P1's turn, Neutral Open. P2 controls bf1 with Garen (4 dmg), Undercover Agent (`agentDamage`, default 4)
 * and Watchful Sentry (1 dmg). P2's hand = [H]; P2's deck top = D1, D2, D3, D4 (then auto-filler).
 * P1 has exactly 1+[body] and Flurry of Blades in hand.
 */
function board(agentDamage = 4) {
  return scenario()
    .resources(P1, { energy: 1, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", GAREN, "garen", { damage: 4 })
    .unit(P2, "bf1", UNDERCOVER_AGENT, "agent", { damage: agentDamage })
    .unit(P2, "bf1", WATCHFUL_SENTRY, "sentry", { damage: 1 })
    .hand(P2, SKULKER, "H")
    .deck(P2, [SKULKER, SKULKER, SKULKER, SKULKER], ["D1", "D2", "D3", "D4"])
    .hand(P1, FLURRY, "flurry");
}

/** P1 casts Flurry; P1 and P2 pass so Flurry (only) resolves and leaves the chain → Cleanup(s) run. */
async function flurryResolves(agentDamage = 4): Promise<{ game: Game; lastPass: Awaited<ReturnType<Game["p2"]["passPriority"]>> }> {
  const game = await board(agentDamage).build();
  await game.p1.cast("flurry");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "flurry", controller: P1, triggered: false })]);
  await game.p1.passPriority();
  const lastPass = await game.p2.passPriority();
  expect(game.zoneOf("flurry")).toBe("trash");
  return { game, lastPass };
}

describe("setup — Garen's aura and the pre-marked damage", () => {
  test("Garen 5 (4 dmg), Agent 5+1 = 6 (4 dmg), Sentry 1+1 = 2 (1 dmg); P2 hand = [H], deck top D1..D3", async () => {
    const game = await board().build();
    expect(game.state("garen")).toMatchObject({ damage: 4, might: 5, zone: "battlefield-bf1" });
    expect(game.state("agent")).toMatchObject({ baseMight: 5, damage: 4, might: 6, zone: "battlefield-bf1" });
    expect(game.state("sentry")).toMatchObject({ baseMight: 1, damage: 1, might: 2, zone: "battlefield-bf1" });
    expect(game.p2.hand()).toEqual(["H"]);
    expect(game.p2.deck().slice(0, 3)).toEqual(["D1", "D2", "D3"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});

describe("(a)+(d) two Cleanups back to back — Garen & Sentry in C1, the Agent in the cascaded C2, nobody acts in between", () => {
  test("after P2's pass Flurry resolves and ALL THREE are in P2's trash before anyone is asked anything; the only move executed was the pass itself (320.1, 322)", async () => {
    const { game, lastPass } = await flurryResolves();
    expect(lastPass.executed.filter((m) => m.auto !== true).map((m) => m.moveId)).toEqual(["passChainPriority"]);
    expect(game.zoneOf("garen")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("agent")).toBe("trash");
    expect(game.cardsAt("battlefield-bf1")).toEqual([]);
  });

  test("C1 trashes Garen and Sentry together (323.5), the Agent follows in C2 — P2's trash order is [garen, sentry] then agent", async () => {
    const { game } = await flurryResolves();
    const trash = game.p2.trash();
    expect(trash.slice(0, 3)).toEqual(expect.arrayContaining(["garen", "sentry", "agent"]));
    expect(trash.indexOf("agent")).toBeGreaterThan(trash.indexOf("garen"));
    expect(trash.indexOf("agent")).toBeGreaterThan(trash.indexOf("sentry"));
  });

  test("(d) the very first decision after the pass is P2's PRIORITY with both Deathknells already finalized on the chain — no order prompt, no window between the deaths (334.2, 337.4)", async () => {
    const { game, lastPass } = await flurryResolves();
    expect(lastPass.decision).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()).toHaveLength(2);
    expect(game.chain().every((i) => i.triggered && i.controller === P2)).toBe(true);
  });
});

describe("(b) NOT simultaneous: fixed append order, no 383.3.d ordering, nothing resolved inside a Cleanup", () => {
  test("chain bottom→top = [Sentry DK (queued in C1), Agent DK (queued in C2)] (337.1.b)", async () => {
    const { game } = await flurryResolves();
    expect(game.chain().map((i) => i.cardId)).toEqual(["sentry", "agent"]);
  });

  test("neither P2 (controller of both) nor P1 (turn player) is offered an `order` decision — the triggers came from two different Cleanups", async () => {
    const { game, lastPass } = await flurryResolves();
    expect(lastPass.decision?.kind).not.toBe("order");
    expect(game.decision()?.kind).not.toBe("order");
    expect(game.p1.decision()?.kind ?? "none").not.toBe("order");
  });

  test("nothing was resolved inside either Cleanup (320): P2 still holds exactly H and has drawn nothing while both items wait", async () => {
    const { game } = await flurryResolves();
    expect(game.p2.hand()).toEqual(["H"]);
    expect(game.p2.deck().slice(0, 3)).toEqual(["D1", "D2", "D3"]);
  });

  test("LIFO: the Agent's Deathknell (died LATER) resolves FIRST — discard H (only card, 359.3.e.11), draw D1 + D2; the Sentry's item is still on the chain", async () => {
    const { game } = await flurryResolves();
    await game.p2.passPriority();
    await game.p1.passPriority(); // → top item (Agent DK) resolves
    expect(game.chain().map((i) => i.cardId)).toEqual(["sentry"]);
    expect(game.zoneOf("H")).toBe("trash");
    expect(game.p2.hand().sort()).toEqual(["D1", "D2"]);
    expect(game.p2.deck()[0]).toBe("D3");
    // P2 (controller of the remaining item) has priority again.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("then the Sentry's Deathknell resolves: draw D3", async () => {
    const { game } = await flurryResolves();
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p2.hand().sort()).toEqual(["D1", "D2", "D3"]);
  });

  test("CONTRAST (discriminates): with the Agent on 5 damage it is lethal in C1 too → Sentry DK and Agent DK ARE simultaneous and P2 is offered the 383.3.d order decision over both", async () => {
    const { game } = await flurryResolves(5);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P2 });
    const cards = d?.kind === "order" ? d.items.map((i) => i.card).sort() : [];
    expect(cards).toEqual(["agent", "sentry"]);
  });
});

describe("(c) final position", () => {
  test("P2 ends with hand {D1, D2, D3} (3 cards) and trash ⊇ {H, Garen, Sentry, Agent}; P1 drew nothing", async () => {
    const { game } = await flurryResolves();
    const p1Hand = game.p1.hand().length;
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p2.hand().sort()).toEqual(["D1", "D2", "D3"]);
    expect(game.p2.trash()).toEqual(expect.arrayContaining(["H", "garen", "sentry", "agent"]));
    expect(game.p2.trash()).toHaveLength(4);
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.p1.trash()).toEqual(["flurry"]);
  });

  test("had the engine batched them with the Sentry on top, P2 would end with only {D2, D3} — it does not: D1 is in hand, not in the trash", async () => {
    const { game } = await flurryResolves();
    await game.settle();
    expect(game.zoneOf("D1")).toBe("hand");
    expect(game.p2.hand()).toHaveLength(3);
  });

  test("afterwards the state is Open, bf1 has no P2 unit → P2 loses control (323.6); nobody scored; P1 is back in its main phase", async () => {
    const { game } = await flurryResolves();
    // While the Deathknells keep the state Closed, bf1 is still P2's.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
