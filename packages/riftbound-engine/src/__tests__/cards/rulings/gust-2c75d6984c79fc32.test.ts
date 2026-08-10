/**
 * Ruling 2c75d6984c79fc32 — Gust (OGN-169 → ogn-169-298) [Reaction] · 1 "Return a unit at a battlefield with 3
 *   [Might] or less to its owner's hand."
 *   × Discipline (OGN-058 → ogn-058-298) [Reaction] · 2 "Give a unit +2 [Might] this turn. Draw 1."
 *   × Shakedown (OGN-033 → ogn-033-298) [Reaction] · 2 "Choose an enemy unit. Deal 6 to it unless its controller
 *     has you draw 2."
 *
 * Q: Opponent Gusts my 3-Might unit, I Discipline it, opponent reacts with Shakedown and the unit dies before
 *    Discipline resolves. Do I still draw from Discipline?
 * A: Yes. Everything on the chain resolves (unless countered) doing as much as it can: the +2 has no legal
 *    target and is skipped, but "Draw 1" is not conditional and still happens. Gust then whiffs too.
 * Rules: 338/339 (LIFO), 359.3.e.1 / 359.3.e.5 / 359.3.e.11 (illegal target → only related instructions skipped).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const DISCIPLINE = "ogn-058-298";
const SHAKEDOWN = "ogn-033-298";

/** P2's turn. P1's 3-Might Scout holds bf1. P2: Gust + Shakedown, 3 energy + [fury]. P1: Discipline, 2 energy, known deck top. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Scout" }, "scout")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P2, GUST, "gust")
    .hand(P2, SHAKEDOWN, "shake")
    .deck(P1, ["ogn-175-298"], ["p1top"]);
}

/** Gust → Discipline → Shakedown on the chain, all aimed at the Scout; priority back with P1. */
async function threeDeep(game: Game): Promise<void> {
  await game.p2.cast("gust", { targets: "scout" });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.cast("disc", { targets: "scout" });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.cast("shake", { targets: "scout" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["gust", "disc", "shake"]);
  expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  expect(game.p1.energy()).toBe(0);
}

/** Both pass → Shakedown resolves; the Scout's controller (P1) is asked and takes the 6. */
async function shakedownKillsScout(game: Game): Promise<void> {
  await game.p2.passPriority();
  await game.p1.passPriority();
  // "unless its controller has you draw 2" — the Scout's controller (P1) decides.
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  const opts = d?.kind === "pick" ? d.options : [];
  const dmg = opts.find((o) => /deal 6/i.test(o.label));
  expect(dmg).toBeDefined();
  await game.p1.pick(dmg!.key);
  expect(game.zoneOf("scout")).toBe("trash"); // 6 ≥ 3: dead before Discipline resolves
  expect(game.zoneOf("shake")).toBe("trash");
}

describe("Ruling 2c75d6984c79fc32 — Discipline still draws when its target was killed in response", () => {
  test("the reaction window: P2 may still react (Shakedown) on top of P1's Discipline — reactions can't be blocked", async () => {
    const game = await board().build();
    await threeDeep(game);
    expect(game.chain().at(-1)).toMatchObject({ cardId: "shake", controller: P2 });
  });

  test("Shakedown resolves first (LIFO): the Scout's controller P1 chooses, takes 6, and the 3-Might Scout dies while Discipline and Gust are still on the chain", async () => {
    const game = await board().build();
    await threeDeep(game);
    await shakedownKillsScout(game);
    expect(game.chain().map((c) => c.cardId)).toEqual(["gust", "disc"]);
    expect(game.p2.hand()).toHaveLength(0); // P1 did not "have them draw 2"
  });

  test("Discipline then resolves doing as much as it can: no unit gets +2, but P1 still draws 1 (359.3.e.5)", async () => {
    const game = await board().build();
    await threeDeep(game);
    await shakedownKillsScout(game);
    const handBefore = game.p1.hand().length;
    expect(handBefore).toBe(0);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Discipline resolves
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.p1.hand()).toEqual(["p1top"]); // drew 1
    expect(game.state("scout").mightModifier).toBe(0); // nothing was pumped (it is in the trash)
    expect(game.chain().map((c) => c.cardId)).toEqual(["gust"]);
  });

  test("finally Gust resolves to no effect (its target left the board): Scout stays in the trash, nothing returns to hand, all three spells in trash, costs stay spent", async () => {
    const game = await board().build();
    await threeDeep(game);
    await shakedownKillsScout(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.p1.hand()).toEqual(["p1top"]);
    expect(game.p1.energy()).toBe(0);
    expect(game.p2.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
