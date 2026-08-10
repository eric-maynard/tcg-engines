/**
 * Interaction: Noxian Guillotine (ogn-254-298) · Action spell · Fury/Order · 4 + one [C] pip
 *     "Choose a unit. Kill it the next time it takes damage this turn. [Legion] — Kill it now instead."
 *   × Discipline (ogn-058-298) · Reaction · Calm · 2 — "Give a unit +2 [Might] this turn. Draw 1."
 *   × Defy       (ogn-045-298) · Reaction · Calm · 1+[calm] — "Counter a spell that costs no more than [4]
 *     and no more than [rainbow]."
 *
 * Rules: 812.1.b.1 / 812.1.c / 812.2 / 812.3 (Legion: dependent text Active "as long as a card different
 * than this one has been Finalized by you on the same turn" — a continuous condition), 727.1.b/.b.2
 * (dependent keyword text is Inactive until its condition holds), 419.4.b (non-triggered "played a card"
 * checks key off FINALIZATION — Defy example), 425.1.b/.c (countered ≠ played only for TRIGGERS; costs not
 * refunded), 402.2 / 404.1 (choices and costs are locked at finalization; effect text is read on
 * resolution), 337.4 (after finalizing, the caster holds priority), 340.1 (LIFO), 359.3.d.
 *
 * Question: P1 has finalized NO card this turn. P2's 5-Might unit X sits at a battlefield. P1 casts
 * Guillotine choosing X.
 *   (a) nobody responds → Legion Inactive at resolution → delayed kill armed, X lives; next damage kills it.
 *   (b) P1 responds to its OWN Guillotine with Discipline (finalized + resolves first) → when Guillotine
 *       resolves "another card has been finalized by you this turn" is TRUE → "Kill it now instead".
 *   (c) P2 responds with ITS Discipline on X (X → 7) → not a card finalized BY P1 → Legion stays off →
 *       delayed kill armed; the +2 is irrelevant — any damage this turn kills X.
 *   (d) P1 responds with Discipline, P2 Defies it → a countered card was still Finalized (419.4.b) →
 *       Legion Active → X killed now; Discipline did nothing, sits in P1's trash, cost unrefunded.
 *   (e) Legion never changes Guillotine's cost or its target set.
 * Text-state map (finalize / resolve): (a) off/off · (b) off/ON · (c) off/off · (d) off/ON.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUILLOTINE = "ogn-254-298";
const DISCIPLINE = "ogn-058-298";
const DEFY = "ogn-045-298";
const HEXTECH_RAY = "ogn-009-298"; // "Deal 3 to a unit at a battlefield." — the later, non-lethal damage

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Flatten the `targets` field of a seat's cast option into the set of card ids offered. */
function targetsOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const opt = game[seat].option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** The armed delayed "kill on next damage" effects, as the public state reports them. */
function armed(game: Game): { replaces?: string; sourceCardId?: string; targetCardIds?: string[] }[] {
  return (game.gameState.activeReplacements ?? []) as { replaces?: string; sourceCardId?: string; targetCardIds?: string[] }[];
}

/**
 * P1's turn, nothing played yet. P2's 5-Might X at bf1 (P2 controls it), plus a P1 bystander so "a unit"
 * is a real choice. P1: Guillotine (4 + [C]=fury), Discipline (2), Hextech Ray (1 + fury) → 7 energy,
 * 2 fury. P2: its own Discipline (2) and Defy (1 + calm) → 3 energy, 1 calm.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { fury: 2 } })
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Unit X" }, "x")
    .unit(P1, "base", { might: 1, name: "Bystander" }, "ally")
    .hand(P1, GUILLOTINE, "ng")
    .hand(P1, DISCIPLINE, "p1disc")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P2, DISCIPLINE, "p2disc")
    .hand(P2, DEFY, "defy");
}

describe("Noxian Guillotine — Legion waking up on the chain (Discipline / Defy responses)", () => {
  // ── setup / (e) ─────────────────────────────────────────────────────────────────────────

  test("setup: P1 has finalized no card this turn; Guillotine offers every unit (X and the bystander) and costs 4 + one pip", async () => {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    const offered = targetsOffered(game, "p1", "ng");
    expect(offered.sort()).toEqual([game.card("ally"), game.card("x")].sort());
    expect(game.state("ng").energyCost).toBe(4);
    expect(game.state("ng").powerCost).toHaveLength(1);
  });

  test("(e) casting Guillotine with Legion OFF charges exactly 4 energy + 1 fury and locks X as the target on the chain item", async () => {
    const game = await board().build();
    await game.p1.cast("ng", { targets: "x" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
    const item = game.chain().find((i) => i.cardId === "ng");
    expect(item?.targets).toEqual(["x"]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(1); // Guillotine itself is finalized
  });

  test("(e) Legion ON at play time (a card was already finalized) charges the SAME 4 + 1 fury and offers the SAME targets", async () => {
    const game = await board().hand(P1, { energyCost: 0, might: 1, name: "Cheap Recruit", cardType: "unit" }, "recruit").build();
    await game.p1.play("recruit");
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(1);
    const offered = targetsOffered(game, "p1", "ng");
    expect(offered.sort()).toEqual([game.card("ally"), game.card("recruit"), game.card("x")].sort());
    await game.p1.cast("ng", { targets: "x" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
    expect(game.chain().find((i) => i.cardId === "ng")?.targets).toEqual(["x"]);
  });

  // ── (a) NO side: nobody responds ────────────────────────────────────────────────────────

  test("(a) nobody responds: Legion Inactive at resolution → X lives, undamaged, and a delayed take-damage kill from Guillotine is armed on it", async () => {
    const game = await board().build();
    await game.p1.cast("ng", { targets: "x" });
    await game.settle();
    expect(game.zoneOf("ng")).toBe("trash");
    expect(game.locationOf("x")).toBe("bf1");
    expect(game.state("x").damage).toBe(0);
    expect(armed(game)).toEqual([expect.objectContaining({ replaces: "take-damage", sourceCardId: "ng", targetCardIds: ["x"] })]);
    expect(game.chain()).toEqual([]);
  });

  test("(a) the next non-lethal damage this turn (Hextech Ray 3 < 5 Might) kills X — the armed effect is spent", async () => {
    const game = await board().build();
    await game.p1.cast("ng", { targets: "x" });
    await game.settle();
    await game.p1.cast("ray", { targets: "x" });
    await game.settle();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("x")).toBe("trash");
    expect(armed(game)).toHaveLength(0);
  });

  test("(a) if X takes no damage this turn the delayed kill simply expires — X is alive on P2's turn with nothing armed", async () => {
    const game = await board().build();
    await game.p1.cast("ng", { targets: "x" });
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.locationOf("x")).toBe("bf1");
    expect(armed(game)).toHaveLength(0);
  });

  // ── (b) YES side: P1 responds to its own Guillotine with Discipline ─────────────────────

  test("(b) after finalizing Guillotine P1 holds priority (337.4) and may play Discipline in response to its own spell", async () => {
    const game = await board().build();
    await game.p1.cast("ng", { targets: "x" });
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "p1disc")).toBe(true);
    await game.p1.cast("p1disc", { targets: "ally" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["ng", "p1disc"]); // Discipline on top (LIFO)
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(2);
  });

  test("(b) Discipline resolves first (+2 on the bystander, draw 1); Guillotine then resolves with Legion ACTIVE → X is killed NOW, no delayed effect left behind", async () => {
    const game = await board().build();
    const p1Deck = game.p1.deck().length;
    await game.p1.cast("ng", { targets: "x" });
    await game.p1.cast("p1disc", { targets: "ally" });
    await game.settle();
    // Discipline did its thing …
    expect(game.zoneOf("p1disc")).toBe("trash");
    expect(game.state("ally").might).toBe(1 + 2);
    expect(game.p1.deck()).toHaveLength(p1Deck - 1);
    expect(game.p1.hand()).toEqual([game.card("ray"), expect.any(String)]); // ray + the drawn card
    // … and Guillotine read its Legion text on resolution.
    expect(game.zoneOf("ng")).toBe("trash");
    expect(game.zoneOf("x")).toBe("trash"); // P2's trash — killed now
    expect(game.p2.trash()).toContain(game.card("x"));
    expect(armed(game)).toHaveLength(0); // "instead": nothing armed
    expect(game.chain()).toEqual([]);
  });

  test("(b) 'any unit': P1's Discipline aimed at X itself also wakes Legion — X (now 7 Might) still dies on Guillotine's resolution", async () => {
    const game = await board().build();
    await game.p1.cast("ng", { targets: "x" });
    await game.p1.cast("p1disc", { targets: "x" }); // "any unit" — even the Guillotine target
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
    expect(armed(game)).toHaveLength(0);
  });

  // ── (c) Contrast: P2 responds with ITS Discipline on X ──────────────────────────────────

  test("(c) P2's Discipline on X (X → 7) is not a card finalized BY P1 → Legion stays Inactive → Guillotine only arms the delayed kill; X alive at 7 Might", async () => {
    const game = await board().build();
    const p2Deck = game.p2.deck().length;
    await game.p1.cast("ng", { targets: "x" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "p2disc")).toBe(true);
    await game.p2.cast("p2disc", { targets: "x" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["ng", "p2disc"]);
    await game.settle();
    expect(game.zoneOf("p2disc")).toBe("trash");
    expect(game.p2.deck()).toHaveLength(p2Deck - 1); // P2 drew 1
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(1); // only Guillotine itself
    expect(game.locationOf("x")).toBe("bf1");
    expect(game.state("x").might).toBe(7);
    expect(game.state("x").damage).toBe(0);
    expect(armed(game)).toEqual([expect.objectContaining({ replaces: "take-damage", sourceCardId: "ng", targetCardIds: ["x"] })]);
  });

  test("(c) the +2 Might is irrelevant to the delayed kill: Hextech Ray's 3 (< 7) still kills X this turn", async () => {
    const game = await board().build();
    await game.p1.cast("ng", { targets: "x" });
    await game.p1.passPriority();
    await game.p2.cast("p2disc", { targets: "x" });
    await game.settle();
    expect(game.state("x").might).toBe(7);
    await game.p1.cast("ray", { targets: "x" });
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
    expect(armed(game)).toHaveLength(0);
  });

  // ── (d) Contrast: P1 responds with Discipline, P2 Defies it ─────────────────────────────

  test("(d) P1's Discipline gets Defied: chain is Guillotine → Discipline → Defy; Defy resolves, Discipline is countered (no +2, no draw, in P1's trash, cost not refunded)", async () => {
    const game = await board().build();
    const p1Deck = game.p1.deck().length;
    await game.p1.cast("ng", { targets: "x" });
    await game.p1.cast("p1disc", { targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } }); // 7 − 4 − 2, fury 2 − 1
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "defy")).toBe(true);
    expect(targetsOffered(game, "p2", "defy")).toContain(game.card("p1disc"));
    await game.p2.cast("defy", { targets: "p1disc" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["ng", "p1disc", "defy"]);
    await game.settle();
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("p1disc")).toBe("trash");
    expect(game.p1.trash()).toContain(game.card("p1disc"));
    expect(game.state("ally").might).toBe(1); // no +2
    expect(game.p1.deck()).toHaveLength(p1Deck); // no draw
    expect(game.p1.hand()).toEqual([game.card("ray")]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } }); // 425.1.c: nothing refunded
  });

  test("(d) a countered Discipline was still FINALIZED by P1 (419.4.b) → Legion Active when Guillotine resolves → X killed now, nothing armed", async () => {
    const game = await board().build();
    await game.p1.cast("ng", { targets: "x" });
    await game.p1.cast("p1disc", { targets: "ally" });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "p1disc" });
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(2); // Guillotine + (countered) Discipline
    expect(game.zoneOf("ng")).toBe("trash");
    expect(game.zoneOf("x")).toBe("trash");
    expect(armed(game)).toHaveLength(0);
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("ally")).toBe("base"); // only the chosen unit dies
  });

  test("no invariant violations across the branches", async () => {
    const game = await board().build();
    await game.p1.cast("ng", { targets: "x" });
    await game.p1.cast("p1disc", { targets: "ally" });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "p1disc" });
    await game.settle();
    expect(game.violations()).toEqual([]);
  });
});
