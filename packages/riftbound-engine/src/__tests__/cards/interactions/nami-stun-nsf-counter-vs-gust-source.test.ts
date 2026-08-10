/**
 * Interaction: Nami, Headstrong (unl-052-219) · Champion Unit · Calm · 3 · 3 Might
 *     "You may pay [calm] as an additional cost to play me. When you play me, if you paid the additional cost,
 *      [Stun] an enemy unit. When I hold, the next time you play a unit this turn, ready it and [Buff] it."
 *   × Not So Fast (sfd-045-221) · Spell · Calm · 2 + [calm] · Reaction
 *     "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × Gust (ogn-169-298) · Spell · Chaos · 1 · Reaction
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Board: P1's turn. P1 controls bf1 (a 1-Might Recruit there); P2's 6-Might V sits at bf2. P1 plays Nami to bf1
 * PAYING the extra [calm]; her play trigger chooses V. P2 holds NSF + Gust with 3 energy + [calm] (enough for both).
 *
 * Rules: 355.9.a.2 / 425.3 (NSF targets an ABILITY on the chain — the trigger is enemy to P2 and chooses V,
 * friendly to P2 → legal), 340.1 (LIFO), 425.1.a (a countered ability does nothing), 425.1.c / 425.1.c.1 (no
 * refund, optional additional cost included), 359.2 / 383.4.a.2 (Nami herself already resolved on entering —
 * countering the trigger does not touch her), 419.4.b (she WAS played: Finalized → counts as a card played),
 * 383.2.a.1 ("if you paid the additional cost" is part of the trigger CONDITION, satisfied when it triggered;
 * removing the source afterwards does not remove the ability — cf. the Sona example), 359.3.e.12 (the stun
 * effect references nothing about Nami, so no null look-ups), 355.8 (no [calm] → no trigger → nothing to NSF).
 *
 * Expected: (a) NSF counters the trigger: V not stunned; Nami stays at bf1 exhausted; P1's 3 + [calm] gone;
 * cards-played count still 1; NSF → P2's trash. (b) Gust bounces Nami (3 Might, at a battlefield) → the trigger
 * still resolves: V IS stunned. (c) After Gust, NSF is still offered the source-less trigger and counters it: V not
 * stunned, Nami in P1's hand, Gust + NSF in P2's trash, P2's pool empty. (d) Unpaid: no chain item, no window,
 * NSF has no target.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NAMI = "unl-052-219";
const NOT_SO_FAST = "sfd-045-221";
const GUST = "ogn-169-298";

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { calm: 1 } })
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 1, name: "Recruit" }, "recruit")
    .unit(P2, "bf2", { might: 6, name: "V" }, "v")
    .hand(P1, NAMI, "nami")
    .hand(P2, NOT_SO_FAST, "nsf")
    .hand(P2, GUST, "gust");
}

function targetsOffered(game: Game, alias: string): string[] {
  const field = game.p2.option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** P1 plays Nami to bf1 paying the [calm]; her trigger (choosing V, the only enemy unit) is on the chain and P1 passes → P2's window. */
async function namiPaidP2Window(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("nami", { payOptional: true, to: "bf1" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "nami", controller: P1, targets: ["v"], triggered: true })]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  return game;
}

describe("Nami, Headstrong's paid stun trigger × Not So Fast (counter) vs Gust (remove the source)", () => {
  // ───────────────────────────── premise ─────────────────────────────

  test("premise: playing Nami with the optional [calm] costs 3 + [calm]; she is at bf1 (exhausted), counts as a card played, and her stun trigger — already choosing V — is the only chain item", async () => {
    const game = await board().build();
    const payField = game.p1.option("play", "nami")?.fields.find((f) => f.arg === "payOptional");
    expect(payField?.options).toEqual([false, true]);
    await game.p1.play("nami", { payOptional: true, to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.zoneOf("nami")).toBe("battlefield-bf1");
    expect(game.state("nami").isExhausted).toBe(true);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "nami", targets: ["v"], triggered: true })]);
    expect(game.state("v").isStunned).toBe(false); // nothing resolved yet
  });

  // ───────────────────────────── (a) NSF on the trigger ─────────────────────────────

  test("(a) in P2's window both Reactions are listed; NSF's only legal choice is Nami's trigger (enemy ability choosing P2's V — 355.9.a.2 / 425.3)", async () => {
    const game = await namiPaidP2Window();
    expect(game.p2.can("cast", "nsf")).toBe(true);
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(targetsOffered(game, "nsf")).toEqual(["nami"]);
  });

  test("(a) NSF resolves first (340.1) and counters the trigger: V is NOT stunned; NSF → P2's trash, P2 paid 2 + [calm]", async () => {
    const game = await namiPaidP2Window();
    await game.p2.cast("nsf", { targets: "nami" });
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 0 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["nami", "nsf"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("v").isStunned).toBe(false);
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.p2.trash()).toContain("nsf");
  });

  test("(a) Nami herself is untouched by the counter — still at bf1, exhausted (359.2 / 383.4.a.2); nothing refunded to P1, neither the 3 energy nor the optional [calm] (425.1.c / 425.1.c.1)", async () => {
    const game = await namiPaidP2Window();
    await game.p2.cast("nsf", { targets: "nami" });
    await game.settle();
    expect(game.zoneOf("nami")).toBe("battlefield-bf1");
    expect(game.state("nami").isExhausted).toBe(true);
    expect(game.p1.units("bf1").sort()).toEqual(["nami", "recruit"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test("(a) Nami still counts as PLAYED after her trigger is countered (419.4.b): P1's cards-played-this-turn stays 1 and it is P1's Open main phase again", async () => {
    const game = await namiPaidP2Window();
    await game.p2.cast("nsf", { targets: "nami" });
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ───────────────────────────── (b) Gust the source ─────────────────────────────

  test("(b) Gust is legal on Nami (3 Might, at a battlefield) — offered alongside the 1-Might Recruit, never the 6-Might V", async () => {
    const game = await namiPaidP2Window();
    expect(targetsOffered(game, "gust").sort()).toEqual(["nami", "recruit"]);
  });

  test("(b) Gust resolves first: Nami → P1's hand; her trigger is STILL on the chain as its own object, still choosing V", async () => {
    const game = await namiPaidP2Window();
    await game.p2.cast("gust", { targets: "nami" });
    expect(game.p2.energy()).toBe(2);
    expect(game.chain().map((i) => i.cardId)).toEqual(["nami", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("nami")).toBe("hand");
    expect(game.p1.hand()).toContain("nami");
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "nami", countered: false, targets: ["v"], triggered: true })]);
  });

  test("(b) …and with the source gone the trigger still RESOLVES: V is Stunned (383.2.a.1 — condition was met when it triggered; 359.3.e.12 — the effect looks up nothing about Nami)", async () => {
    const game = await namiPaidP2Window();
    await game.p2.cast("gust", { targets: "nami" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nami")).toBe("hand");
    expect(game.state("v").isStunned).toBe(true);
    expect(game.zoneOf("v")).toBe("battlefield-bf2");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1); // bounced, but she was played
  });

  test("(b) back in hand Nami is a new object: replaying her would cost the full 3 (+ optional [calm]) again — with P1's pool empty she is not playable", async () => {
    const game = await namiPaidP2Window();
    await game.p2.cast("gust", { targets: "nami" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.p1.can("play", "nami")).toBe(false);
  });

  // ───────────────────────────── (c) Gust, then NSF the source-less trigger ─────────────────────────────

  test("(c) after Gust has resolved (Nami in hand), NSF is STILL offered the trigger — it targets an ability on the chain, which still exists and still chooses V", async () => {
    const game = await namiPaidP2Window();
    await game.p2.cast("gust", { targets: "nami" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves; P1 gets priority on the remaining trigger
    expect(game.zoneOf("nami")).toBe("hand");
    expect(game.actingSeat()).toBe(P1);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "nsf")).toBe(true);
    expect(targetsOffered(game, "nsf")).toEqual(["nami"]);
    await game.p2.cast("nsf", { targets: "nami" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["nami", "nsf"]);
  });

  // Expected: NSF counters the trigger regardless of where its source now is (425.1.a — the ability on the chain is
  // the target, not the card) → V NOT stunned; Nami in P1's hand; Gust + NSF in P2's trash; P2's pool empty; P1's
  // 3 + [calm] gone for nothing. Actual: once Nami has left the board NSF resolves without countering — the trigger
  // then resolves and V IS stunned (the counter only lands while the source card is still on the board).
  test("Gust resolved, then NSF on the source-less trigger — the trigger must be countered and V not stunned (425.1.a, 355.9.a.2)", async () => {
    const game = await namiPaidP2Window();
    await game.p2.cast("gust", { targets: "nami" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    await game.p1.passPriority();
    await game.p2.cast("nsf", { targets: "nami" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nami")).toBe("hand");
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.state("v").isStunned).toBe(false);
  });

  // Same defect, other ordering: NSF cast first, Gust on top of it in the same chain (LIFO: Gust bounces Nami, then
  // NSF resolves against the now source-less trigger). Expected V not stunned; actual V stunned.
  test("NSF then Gust on one chain (Gust resolves first) — NSF must still counter the trigger: V not stunned, Nami in hand, both spells in P2's trash", async () => {
    const game = await namiPaidP2Window();
    await game.p2.cast("nsf", { targets: "nami" });
    expect(game.p2.can("cast", "gust")).toBe(true); // P2 keeps priority after adding to the chain
    await game.p2.cast("gust", { targets: "nami" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["nami", "nsf", "gust"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nami")).toBe("hand");
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.state("v").isStunned).toBe(false);
  });

  test("(c) final zones on the Gust-then-NSF line that do NOT depend on the counter landing: Nami in P1's hand, Gust and NSF in P2's trash, both pools empty, cards-played still 1, back to P1's main phase", async () => {
    const game = await namiPaidP2Window();
    await game.p2.cast("gust", { targets: "nami" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p1.passPriority();
    await game.p2.cast("nsf", { targets: "nami" });
    await game.settle();
    expect(game.zoneOf("nami")).toBe("hand");
    expect(game.p2.trash().sort()).toEqual(["gust", "nsf"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ───────────────────────────── (d) [calm] not paid ─────────────────────────────

  test("(d) without the [calm] the trigger condition is false (383.2.a.1): Nami resolves with NO chain item, P1 keeps the [calm], V untouched — no window opens for P2 at all", async () => {
    const game = await board().build();
    await game.p1.play("nami", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 1 } });
    expect(game.zoneOf("nami")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.legal()).toEqual([]); // no priority for P2 → neither NSF nor Gust now
    expect(game.state("v").isStunned).toBe(false);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
  });

  test("(d) …so NSF has nothing to target (355.8): even when P2 next holds priority (P1 opens a chain later), NSF is not castable while Gust on Nami is", async () => {
    const poke = {
      abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
      cardType: "spell",
      domain: "calm",
      energyCost: 0,
      name: "Poke",
      rulesText: "Draw 1.",
      timing: "action",
    } as const;
    const game = await board().hand(P1, poke, "poke").build();
    await game.p1.play("nami", { to: "bf1" });
    await game.p1.cast("poke"); // a target-less P1 spell: chooses no unit of P2's
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "nsf")).toBe(false);
    expect(targetsOffered(game, "nsf")).toEqual([]);
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(targetsOffered(game, "gust")).toContain("nami");
  });
});
