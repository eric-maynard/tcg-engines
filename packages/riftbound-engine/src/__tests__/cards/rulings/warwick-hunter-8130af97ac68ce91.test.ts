/**
 * Ruling 8130af97ac68ce91 — Warwick, Hunter (OGN-159 → ogn-159-298) · 5 Might · "I enter ready. When I attack, kill all damaged enemy units here."
 *   × Anivia, Primal (OGN-148 → ogn-148-298) · 8 Might · "When I attack, deal 3 to all enemy units here."
 *
 * Q: Attacking with both Warwick and Anivia — do all enemies die before combat, and does the order of the attack triggers matter?
 * A: Order matters (the attacker CHOOSES it). Put Warwick's trigger on the chain first (bottom) and Anivia's second (top): Anivia resolves
 *    first and damages everything, then Warwick resolves, sees damaged enemies and kills them all — before combat damage. Reversed
 *    (Anivia bottom, Warwick top): Warwick resolves first with nothing damaged → no kills; Anivia then deals 3; nobody dies to the triggers.
 * Rules: 383.3.d (controller orders simultaneous triggers), 383 (LIFO), 464 (initial combat chain before combat damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WARWICK = "ogn-159-298";
const ANIVIA = "ogn-148-298";

/** P1's turn. P2 holds bf1 with two undamaged 7-Might Brutes (14 total vs 5+8 = 13 attacking). Warwick (ready) + Anivia in P1's base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7, name: "Brute One" }, "b1")
    .unit(P2, "bf1", { might: 7, name: "Brute Two" }, "b2")
    .unit(P1, "base", WARWICK, "ww")
    .unit(P1, "base", ANIVIA, "anivia");
}

const ids = (game: Game) => game.chain().map((c) => c.cardId);

/** Both attack together; P1 is offered the ORDER of the two simultaneous attack triggers. */
async function attackTogether(): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["ww", "anivia"], "bf1");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "order", seat: P1 });
  expect(d?.kind === "order" ? d.items.map((i) => i.card).sort() : []).toEqual(["anivia", "ww"]);
  return game;
}

/** Resolve exactly the top chain item (everyone passes once around). */
async function resolveTop(game: Game): Promise<void> {
  const before = game.chain().length;
  for (let i = 0; i < 4 && game.chain().length >= before; i++) {
    await game.acting().passPriority();
  }
}

describe("Ruling 8130af97ac68ce91 — Warwick + Anivia: the attacker orders the triggers, and only Warwick-bottom / Anivia-top wipes the board pre-combat", () => {
  test("the choice is P1's: an 'order' decision listing both attack triggers is surfaced before anything resolves", async () => {
    const game = await attackTogether();
    expect(game.state("b1").damage).toBe(0);
    expect(game.state("b2").damage).toBe(0);
  });

  test("CORRECT order — Warwick = chain 1 (bottom), Anivia = chain 2 (top): Anivia resolves first (3 to each Brute), then Warwick kills both damaged Brutes — all before combat damage", async () => {
    const game = await attackTogether();
    const d = game.decision();
    const keyOf = (card: string) => (d?.kind === "order" ? d.items.find((i) => i.card === card)?.key : undefined) as string;
    await game.p1.order([keyOf("ww"), keyOf("anivia")]);
    expect(ids(game)).toEqual(["ww", "anivia"]); // bottom → top
    await resolveTop(game); // Anivia
    expect(ids(game)).toEqual(["ww"]);
    expect(game.state("b1")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(game.state("b2")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    await resolveTop(game); // Warwick
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("b1")).toBe("trash");
    expect(game.zoneOf("b2")).toBe("trash");
    // Still in the showdown — combat damage has not been dealt: both attackers are unhurt.
    expect(game.state("ww").damage).toBe(0);
    expect(game.state("anivia").damage).toBe(0);
    await game.settle();
    expect(game.zoneOf("ww")).toBe("battlefield-bf1");
    expect(game.zoneOf("anivia")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("REVERSED order — Anivia = chain 1, Warwick = chain 2 (top): Warwick resolves first and sees NO damaged enemies (kills nothing); Anivia then deals 3; both Brutes are alive going into combat", async () => {
    const game = await attackTogether();
    const d = game.decision();
    const keyOf = (card: string) => (d?.kind === "order" ? d.items.find((i) => i.card === card)?.key : undefined) as string;
    await game.p1.order([keyOf("anivia"), keyOf("ww")]);
    expect(ids(game)).toEqual(["anivia", "ww"]);
    await resolveTop(game); // Warwick — nothing damaged yet
    expect(ids(game)).toEqual(["anivia"]);
    expect(game.zoneOf("b1")).toBe("battlefield-bf1");
    expect(game.zoneOf("b2")).toBe("battlefield-bf1");
    expect(game.state("b1").damage).toBe(0);
    await resolveTop(game); // Anivia — damages, but Warwick has already resolved
    expect(game.chain()).toEqual([]);
    expect(game.state("b1")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(game.state("b2")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    // The enemies did NOT die before combat; combat now decides it: 13 into the two pre-damaged Brutes (4 + 4 lethal) kills both, but
    // their 14 back kills Warwick (5) AND Anivia (8) too — a wipe instead of the clean pre-combat sweep, and no conquer for P1.
    await game.settle();
    expect(game.zoneOf("b1")).toBe("trash");
    expect(game.zoneOf("b2")).toBe("trash");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.zoneOf("anivia")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
  });
});
