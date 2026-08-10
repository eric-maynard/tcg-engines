/**
 * Interaction: Mel, Newly Awakened (ven-069-166) · Unit · Mind · 4 · 4 Might
 *                "When you play me, draw 1. [Empower] [3]. [Empowered][>] Your spells and abilities can't be countered.
 *                 If a spell or ability you control would give -[Might] to a unit it chooses, it gives an additional -1."
 *            × Sanction (ven-035-166) · Spell · 3+[calm] · "[Reaction] Choose one — • Empower a unit. Disempower it at end
 *                 of turn. • Disempower a unit that's [Empowered]. Empower it at end of turn."
 *            × Not So Fast (sfd-045-221) · Spell · 2+[calm] · "[Reaction] Counter an enemy spell or ability that chooses a
 *                 friendly unit or gear."
 *            with Riptide Rex (ogn-092-298) · Unit · 6+[mind][mind] · 6 · "When you play me, deal 6 to an enemy unit at a
 *                 battlefield." as the ability at stake.
 *
 * P1: Mel in base NOT Empowered, 9 energy + [mind][mind][calm], Rex and Sanction in hand. P2: 5-Might U at bf1, Not So
 * Fast in hand (2+[calm]). P1 plays Rex to base → its play trigger chooses U. P2 answers with NSF on the trigger. P1
 * answers with Sanction (mode 1) Empowering Mel.
 *   (a) Was NSF legal — and would the trigger still be OFFERED to NSF if Mel had already been Empowered?
 *   (b) Resolve: is the Rex trigger countered? Where do NSF / Sanction / Rex / U end up; anything refunded?
 *   (c) Contrast — no Sanction: trigger countered, U untouched; Rex is NOT un-played and nothing is refunded.
 *
 * Rules: 355.9.a.2 / 425.3 (an ability on the chain is a counterable object), 358.3.a + 355.9.b ("can't be countered"
 * is not a choose-restriction — the counter may still be played, it just does nothing), 340.1 (LIFO), 441.1 / 828.1.c
 * (Empowered status → dependent passive Active from that instant), 054.1 (can't beats can), 359.3.e.6 (impossible
 * instruction ignored; NSF still resolves → trash), 425.1.a (countered ability cleared), 425.1.c (no refund),
 * 383.4.a.2 (the unit's play completed when it entered — the trigger is a separate item), 419.4.b (Rex still counts
 * as played), Sanction's "Disempower it at end of turn" delayed trigger.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MEL = "ven-069-166";
const SANCTION = "ven-035-166";
const NOT_SO_FAST = "sfd-045-221";
const RIPTIDE_REX = "ogn-092-298";
const EMPOWER_MODE = 0; // Sanction's first printed bullet

function targetsOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const opt = game[seat].option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : v === null ? [] : [v]) as string[]))];
}

/** P1's turn. Mel (un-Empowered unless asked) in P1's base; U (5) at P2's bf1; exact resources on both sides. */
function board(melEmpowered = false) {
  return scenario()
    .resources(P1, { energy: 9, power: { calm: 1, mind: 2 } })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", MEL, "mel", melEmpowered ? { empowered: true } : undefined)
    .unit(P2, "bf1", { might: 5, name: "Victim U" }, "u")
    .hand(P1, RIPTIDE_REX, "rex")
    .hand(P1, SANCTION, "sanction")
    .hand(P2, NOT_SO_FAST, "nsf");
}

/** P1 plays Rex to base; its trigger (only legal choice: U) is finalized on the chain; P1 passes priority to P2. */
async function rexPlayed(melEmpowered = false): Promise<Game> {
  const game = await board(melEmpowered).build();
  await game.p1.play("rex", { to: "base" });
  expect(game.zoneOf("rex")).toBe("base");
  expect(game.p1.resources()).toEqual({ energy: 3, power: { calm: 1, mind: 0 } }); // 6 + [mind][mind] paid
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rex", controller: P1, targets: ["u"], triggered: true, type: "ability" })]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  return game;
}

/** …P2 casts NSF on the trigger, passes; P1 casts Sanction (Empower) on Mel. Chain bottom→top: Rex trigger, NSF, Sanction. */
async function fullChain(): Promise<Game> {
  const game = await rexPlayed();
  await game.p2.cast("nsf", { targets: "rex" });
  await game.p2.passPriority();
  await game.p1.cast("sanction", { mode: EMPOWER_MODE, targets: "mel" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["rex", "nsf", "sanction"]);
  expect(game.chain().at(-1)).toMatchObject({ cardId: "sanction", controller: P1, mode: EMPOWER_MODE, targets: ["mel"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, mind: 0 } });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  return game;
}

describe("Mel Empowered IN RESPONSE (Sanction) blanks Not So Fast aimed at Riptide Rex's play trigger", () => {
  // ---------------------------------------------------------------- (a) legality of NSF

  test("(a) NSF is legal: the Rex trigger is an enemy ABILITY on the chain that chooses U (friendly to P2) — offered (via its source card) and castable; P2 pays 2+[calm]", async () => {
    const game = await rexPlayed();
    expect(game.p2.can("cast", "nsf")).toBe(true);
    expect(targetsOffered(game, "p2", "nsf")).toEqual(["rex"]);
    await game.p2.cast("nsf", { targets: "rex" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["rex", "nsf"]);
    expect(game.chain()[1]).toMatchObject({ cardId: "nsf", controller: P2, targets: ["rex"], type: "spell" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.state("mel").isEmpowered).toBe(false);
  });

  test("(a) even with Mel ALREADY Empowered the trigger is still offered to NSF and the cast is legal — 'can't be countered' is not a choose-restriction (358.3.a vs 355.9.b)", async () => {
    const game = await rexPlayed(true);
    expect(game.state("mel").isEmpowered).toBe(true);
    expect(game.p2.can("cast", "nsf")).toBe(true);
    expect(targetsOffered(game, "p2", "nsf")).toEqual(["rex"]);
    await game.p2.cast("nsf", { targets: "rex" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["rex", "nsf"]);
    // …and it simply does nothing on resolution: U dies to the trigger anyway, NSF spent.
    await game.settle();
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.zoneOf("u")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  // ---------------------------------------------------------------- (b) the full chain

  test("(b) Sanction is castable by P1 in response (Reaction, P1 has priority after P2 passes) and Mel is a legal mode-1 target; nothing changes status until it resolves", async () => {
    const game = await rexPlayed();
    await game.p2.cast("nsf", { targets: "rex" });
    expect(game.p1.can("cast", "sanction")).toBe(false); // P2 still holds priority after finalizing NSF
    await game.p2.passPriority();
    expect(game.p1.can("cast", "sanction")).toBe(true);
    expect(targetsOffered(game, "p1", "sanction")).toContain("mel");
    await game.p1.cast("sanction", { mode: EMPOWER_MODE, targets: "mel" });
    expect(game.state("mel").isEmpowered).toBe(false);
  });

  test("(b) LIFO step 1 — Sanction resolves first (340.1): Mel is Empowered from that instant (441.1 / 828.1.c); NSF and the trigger still wait; P2 (NSF's controller) gets priority", async () => {
    const game = await fullChain();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("sanction")).toBe("trash");
    expect(game.state("mel").isEmpowered).toBe(true);
    expect(game.chain().map((c) => c.cardId)).toEqual(["rex", "nsf"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("(b) LIFO step 2 — NSF resolves: countering an ability P1 controls is now forbidden (054.1) → instruction ignored (359.3.e.6); NSF → P2's trash, 2+[calm] stay spent (425.1.c); the trigger remains, NOT countered", async () => {
    const game = await fullChain();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Sanction
    await game.p2.passPriority();
    await game.p1.passPriority(); // NSF
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.state("nsf").owner).toBe(P2);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rex", countered: false, targets: ["u"], triggered: true })]);
    expect(game.state("u")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
  });

  test("(b) LIFO step 3 — the Rex trigger resolves: 6 to U (5 Might) → U dies to P2's trash; final zones: NSF P2 trash, Sanction P1 trash, Rex on the board in base (exhausted), Mel Empowered; no refunds anywhere", async () => {
    const game = await fullChain();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("u")).toBe("trash");
    expect(game.state("u").owner).toBe(P2);
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.zoneOf("sanction")).toBe("trash");
    expect(game.state("sanction").owner).toBe(P1);
    expect(game.state("rex")).toMatchObject({ isExhausted: true, location: "base", zone: "base" });
    expect(game.state("mel").isEmpowered).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, mind: 0 } });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(b) Sanction's rider: Mel is Disempowered at end of turn (delayed trigger) — un-Empowered once P2's turn has begun", async () => {
    const game = await fullChain();
    await game.settle();
    expect(game.state("mel").isEmpowered).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("mel").isEmpowered).toBe(false);
  });

  // ---------------------------------------------------------------- (c) contrast: no Sanction

  test("(c) contrast — P1 does not Sanction: NSF resolves and COUNTERS the trigger (425.1.a) — it is cleared from the chain, U takes no damage; NSF → P2's trash", async () => {
    const game = await rexPlayed();
    await game.p2.cast("nsf", { targets: "rex" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // NSF resolves
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.chain()).toEqual([]); // countered ability cleared — nothing left to resolve
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("u")).toMatchObject({ damage: 0, might: 5, zone: "battlefield-bf1" });
    expect(game.state("mel").isEmpowered).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("(c) Rex himself is untouched by the counter: still on the board in base (his play completed when he entered, 383.4.a.2), still counted as a card P1 played this turn (419.4.b), and 6+[mind][mind] is NOT refunded (425.1.c); Sanction still in hand", async () => {
    const game = await rexPlayed();
    await game.p2.cast("nsf", { targets: "rex" });
    await game.settle();
    expect(game.state("rex")).toMatchObject({ isExhausted: true, location: "base", owner: P1, zone: "base" });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.gameState.cardsPlayedThisTurn?.[P2]).toBe(1); // NSF resolved (not countered) — it was played too
    expect(game.p1.resources()).toEqual({ energy: 3, power: { calm: 1, mind: 0 } });
    expect(game.p1.hand()).toEqual(["sanction"]);
    expect(game.zoneOf("u")).toBe("battlefield-bf1");
  });
});
