/**
 * Interaction: Defy (ogn-045-298) · Spell · Calm · 1 + [calm] · Reaction
 *     "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Wind Wall (ogn-064-298) · Spell · Calm · 3 + [calm][calm] · Reaction — "Counter a spell."
 *   × Void Seeker (ogn-024-298) · Spell · Fury · 3 + [fury] · Action
 *     "Deal 4 to a unit at a battlefield. Draw 1."
 *
 * Rules: 355.9.a.2 ("spell" = an object on the Chain), 355.9.b / 355.8 (all targeting restrictions must
 * be met to even put the spell on the chain), 206 (printed cost), 340.1 / 340.4 (newest item resolves
 * first; then the controller of the new newest item gets priority), 425.1.a / .a.1 / .c (a countered
 * card does nothing, goes to trash, nothing is refunded — additional costs included), 359.3.e.2 / .e.7
 * / .e.10 (a target that left the chain is invalid → the instruction does not execute; the spell still
 * counts as played), 419.4.a.1 / 419.4.b (countered cards were still Finalized → they count for
 * Legion-style "cards played" checks).
 *
 * Question: P1 plays Void Seeker at P2's unit X. P2 responds with Defy → Void Seeker. P1 responds with
 * Wind Wall → Defy.
 *   (a) a counterspell on the chain is itself "a spell": Wind Wall may choose Defy. LIFO: Wind Wall
 *       counters Defy (trash, no effect), then Void Seeker resolves — 4 to X, P1 draws 1.
 *   (b) P2's SECOND Defy cannot answer Wind Wall (3 + two power > "no more than [rainbow]") — Wind Wall
 *       is not offered to it; a second Wind Wall on P1's Wind Wall IS legal → it counters P1's Wind
 *       Wall, then Defy counters Void Seeker: no damage, no draw.
 *   (c) P1 mis-targets its own Void Seeker with Wind Wall: Void Seeker is countered; Defy then resolves
 *       with an invalid target and does nothing (fizzles, not countered) → trash.
 *   (d) every energy/power paid stays spent in every line; all those cards count as played this turn.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const WIND_WALL = "ogn-064-298";
const VOID_SEEKER = "ogn-024-298";

/** P1: Void Seeker (3+[fury]) + Wind Wall (3+[calm][calm]) exactly. P2: two Defys (1+[calm] each) + Wind Wall (3+[calm][calm]) exactly. */
const P1_POOL = { energy: 6, power: { calm: 2, fury: 1 } };
const P2_POOL = { energy: 5, power: { calm: 4 } };

function board() {
  return scenario()
    .resources(P1, P1_POOL)
    .resources(P2, P2_POOL)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "X" }, "x")
    .hand(P1, VOID_SEEKER, "seeker")
    .hand(P1, WIND_WALL, "windwall")
    .hand(P2, DEFY, "defy")
    .hand(P2, DEFY, "defy2")
    .hand(P2, WIND_WALL, "windwall2");
}

function targetsOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const opt = game[seat].option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

const chainIds = (game: Game) => game.chain().map((i) => i.cardId);

/** Void Seeker → X; P1 passes; Defy → Void Seeker; P2 passes → P1 holds priority with Wind Wall in hand. */
async function seekerThenDefy(game: Game): Promise<void> {
  await game.p1.cast("seeker", { targets: "x" });
  expect(game.p1.resources()).toEqual({ energy: 3, power: { calm: 2, fury: 0 } });
  await game.p1.passPriority();
  await game.p2.cast("defy", { targets: "seeker" });
  expect(game.p2.resources()).toEqual({ energy: 4, power: { calm: 3 } });
  expect(chainIds(game)).toEqual(["seeker", "defy"]);
  await game.p2.passPriority(); // controller of the newest item passes first (340.4)
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
}

describe("Defy vs Wind Wall — counter-war LIFO and Defy's cost cap", () => {
  // ── (a) Wind Wall on Defy ───────────────────────────────────────────────────────────────────

  test("(a) Defy on the chain is 'a spell': P1's Wind Wall offers BOTH chain spells (Void Seeker, Defy) and may choose Defy (355.9.a.2)", async () => {
    const game = await board().build();
    await seekerThenDefy(game);
    expect(targetsOffered(game, "p1", "windwall").sort()).toEqual(["defy", "seeker"]);
    await game.p1.cast("windwall", { targets: "defy" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    expect(chainIds(game)).toEqual(["seeker", "defy", "windwall"]);
    expect(game.chain().at(-1)).toMatchObject({ cardId: "windwall", controller: P1, targets: ["defy"] });
  });

  test("(a) LIFO: Wind Wall resolves first and counters Defy (Defy → P2's trash having done nothing); Void Seeker is left alone on the chain and P1 — its controller — regains priority (340.1, 340.4, 425.1.a)", async () => {
    const game = await board().build();
    await seekerThenDefy(game);
    await game.p1.cast("windwall", { targets: "defy" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Wind Wall resolves
    expect(game.zoneOf("windwall")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.p2.trash()).toContain("defy");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "seeker", controller: P1, countered: false, targets: ["x"] })]);
    expect(game.state("x").damage).toBe(0); // Void Seeker has not resolved yet
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(a) …then Void Seeker resolves normally: 4 damage to X (5 Might, survives with 4 marked) and P1 draws 1", async () => {
    const game = await board().build();
    await seekerThenDefy(game);
    await game.p1.cast("windwall", { targets: "defy" });
    const hand = game.p1.hand().length; // seeker & windwall already left the hand
    const deck = game.p1.deck().length;
    await game.settle();
    expect(game.state("x")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.p1.deck()).toHaveLength(deck - 1);
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) answering Wind Wall ─────────────────────────────────────────────────────────────────

  test("(b) P2's second Defy can NOT target Wind Wall — printed 3 + [calm][calm] exceeds 'no more than [rainbow]'; it is offered only the ≤4/≤1 spells (Void Seeker, and P2's own Defy) and a cast at Wind Wall is rejected (355.8, 355.9.b)", async () => {
    const game = await board().build();
    await seekerThenDefy(game);
    await game.p1.cast("windwall", { targets: "defy" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    const offered = targetsOffered(game, "p2", "defy2");
    expect(offered).not.toContain("windwall");
    expect(offered).toContain("seeker"); // 3 energy, 1 power — still a legal Defy target
    expect(offered.sort()).toEqual(["defy", "seeker"]);
    await expect(game.p2.cast("defy2", { targets: "windwall" })).rejects.toThrow();
    expect(game.zoneOf("defy2")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 4, power: { calm: 3 } }); // nothing debited for the failed attempt
  });

  test("(b) a second Wind Wall on P1's Wind Wall IS legal ('Counter a spell' has no cost cap): it resolves first and counters P1's Wind Wall, then Defy resolves and counters Void Seeker — X undamaged, no draw, all four spells in trash", async () => {
    const game = await board().build();
    await seekerThenDefy(game);
    await game.p1.cast("windwall", { targets: "defy" });
    await game.p1.passPriority();
    expect(targetsOffered(game, "p2", "windwall2").sort()).toEqual(["defy", "seeker", "windwall"]);
    await game.p2.cast("windwall2", { targets: "windwall" });
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    expect(chainIds(game)).toEqual(["seeker", "defy", "windwall", "windwall2"]);
    const hand = game.p1.hand().length;
    await game.p2.passPriority();
    await game.p1.passPriority(); // Wind Wall #2 resolves → P1's Wind Wall countered
    expect(game.zoneOf("windwall")).toBe("trash");
    expect(chainIds(game)).toEqual(["seeker", "defy"]);
    await game.settle(); // Defy counters Void Seeker
    expect(game.state("x")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.p1.hand()).toHaveLength(hand); // no draw
    for (const c of ["seeker", "windwall"]) {
      expect(game.p1.trash()).toContain(c);
    }
    for (const c of ["defy", "windwall2"]) {
      expect(game.p2.trash()).toContain(c);
    }
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(b) pointing Defy #2 at Void Seeker again is legal (3 energy, 1 power) — then P1 would need yet another answer: with none, Void Seeker ends up countered even though Wind Wall took out Defy #1", async () => {
    const game = await board().build();
    await seekerThenDefy(game);
    await game.p1.cast("windwall", { targets: "defy" });
    await game.p1.passPriority();
    await game.p2.cast("defy2", { targets: "seeker" });
    expect(game.p2.resources()).toEqual({ energy: 3, power: { calm: 2 } });
    expect(chainIds(game)).toEqual(["seeker", "defy", "windwall", "defy2"]);
    const hand = game.p1.hand().length;
    await game.settle();
    expect(game.state("x").damage).toBe(0);
    expect(game.p1.hand()).toHaveLength(hand);
    expect([...game.p1.trash(), ...game.p2.trash()].sort()).toEqual(["defy", "defy2", "seeker", "windwall"]);
  });

  // ── (c) Wind Wall on P1's own Void Seeker ───────────────────────────────────────────────────

  test("(c) mis-target: Wind Wall also offers P1's OWN Void Seeker; choosing it counters Void Seeker first (trash, X untouched, no draw) and leaves Defy alone on the chain aimed at a spell that is gone", async () => {
    const game = await board().build();
    await seekerThenDefy(game);
    expect(targetsOffered(game, "p1", "windwall")).toContain("seeker");
    await game.p1.cast("windwall", { targets: "seeker" });
    const hand = game.p1.hand().length;
    await game.p1.passPriority();
    await game.p2.passPriority(); // Wind Wall resolves
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.zoneOf("windwall")).toBe("trash");
    expect(game.state("x").damage).toBe(0);
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "defy", controller: P2, countered: false, targets: ["seeker"] })]);
  });

  test("(c) Defy then resolves with an invalid target and simply does nothing — not countered, just no effect — and goes to P2's trash; board and pools otherwise unchanged (359.3.e.2/.e.7/.e.10)", async () => {
    const game = await board().build();
    await seekerThenDefy(game);
    await game.p1.cast("windwall", { targets: "seeker" });
    await game.settle();
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.p2.trash()).toContain("defy");
    expect(game.chain()).toEqual([]);
    expect(game.state("x")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    expect(game.p2.resources()).toEqual({ energy: 4, power: { calm: 3 } });
    expect(game.p2.hand().sort()).toEqual(["defy2", "windwall2"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (d) the tally ───────────────────────────────────────────────────────────────────────────

  test("(d) line (a): nothing is refunded — P1 spent 6 + [fury] + [calm][calm] (pool 0/0), P2 spent 1 + [calm] on the countered Defy (4 / calm 3) (425.1.c)", async () => {
    const game = await board().build();
    await seekerThenDefy(game);
    await game.p1.cast("windwall", { targets: "defy" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    expect(game.p2.resources()).toEqual({ energy: 4, power: { calm: 3 } });
  });

  test("(d) line (b, Wind Wall #2): P1 is 0/0 with nothing to show for it; P2 spent 4 + [calm]×3 in total (1 / calm 1) — the countered Wind Wall and Void Seeker refund nothing", async () => {
    const game = await board().build();
    await seekerThenDefy(game);
    await game.p1.cast("windwall", { targets: "defy" });
    await game.p1.passPriority();
    await game.p2.cast("windwall2", { targets: "windwall" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    expect(game.state("x").damage).toBe(0);
  });

  test("(d) every one of those cards was Finalized, so each counts as a card its controller PLAYED this turn — countered or fizzled alike (419.4.b: Legion etc. stay live)", async () => {
    const game = await board().build();
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 0, [P2]: 0 });
    await seekerThenDefy(game);
    await game.p1.cast("windwall", { targets: "defy" });
    await game.p1.passPriority();
    await game.p2.cast("windwall2", { targets: "windwall" });
    await game.settle();
    // P1: Void Seeker (countered) + Wind Wall (countered); P2: Defy (resolved) + Wind Wall #2 (resolved).
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 2, [P2]: 2 });

    const fizzle = await board().build();
    await seekerThenDefy(fizzle);
    await fizzle.p1.cast("windwall", { targets: "seeker" });
    await fizzle.settle();
    // P1: Void Seeker (countered) + Wind Wall; P2: Defy (fizzled — still played, 359.3.e.10).
    expect(fizzle.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 2, [P2]: 1 });
  });
});
