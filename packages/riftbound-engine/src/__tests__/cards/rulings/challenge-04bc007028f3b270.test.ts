/**
 * Ruling 04bc007028f3b270 — Challenge (OGN-128 → ogn-128-298) · Spell · Body · 2+[body] · [Action]
 *   "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *   × Darius, Trifarian (OGN-027 → ogn-027-298) · 5 Might "When you play your second card in a turn, give me +2 [Might]
 *     this turn and ready me."
 *
 * Q: Does Darius get the +2 for Challenge if Challenge is the 2nd card played (with Darius as the friendly unit)?
 * A: No (not in time to matter). A spell counts as played when it resolves: Challenge's mutual damage is dealt during its
 *    resolution with Darius still at 5; Darius's trigger is only added in the Cleanup that follows — the same Cleanup in
 *    which a Darius carrying 5+ damage dies. The trigger then resolves and whiffs (Darius is gone).
 * Rules: 359.3.e.10 / 419.4.a (spell "played" on resolution), 319–323 (Cleanup: pending triggers + lethal deaths), 402.4.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";
const DARIUS = "ogn-027-298";
const PAWN = { cardType: "unit", energyCost: 1, might: 1, name: "Pawn" } as const;

/** P1's turn. Darius (exhausted) in P1's base; P2 has a Brute of the given Might in its base. P1: Pawn (1st card) + Challenge. */
function board(bruteMight: number) {
  return scenario()
    .resources(P1, { energy: 3, power: { body: 1 } })
    .unit(P1, "base", DARIUS, "darius", { exhausted: true })
    .unit(P2, "base", { might: bruteMight, name: "Brute" }, "brute")
    .hand(P1, PAWN, "pawn")
    .hand(P1, CHALLENGE, "challenge");
}

describe("Ruling 04bc007028f3b270 — Challenge as the 2nd card: Darius fights at 5 and his +2/ready comes too late", () => {
  test("Pawn (1st card), then Challenge (2nd) Darius ↔ a 6-Might Brute: while Challenge is on the chain Darius has NOT triggered (a spell is 'played' when it resolves) — still 5, still exhausted", async () => {
    const game = await board(6).build();
    await game.p1.play("pawn");
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
    await game.p1.cast("challenge", { targets: ["darius", "brute"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["challenge"]);
    expect(game.chain().some((c) => c.cardId === "darius")).toBe(false);
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
  });

  test("Challenge resolves: they trade 5 ↔ 6 at Darius's CURRENT 5 Might — the Brute takes exactly 5 (not 7), Darius takes 6 ≥ 5 and dies in the following Cleanup; his trigger whiffs", async () => {
    const game = await board(6).build();
    await game.p1.play("pawn");
    await game.settle();
    await game.p1.cast("challenge", { targets: ["darius", "brute"] });
    await game.settle();
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.state("brute")).toMatchObject({ damage: 5, zone: "base" });
    expect(game.zoneOf("darius")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — against a 4-Might Brute Darius survives (4 < 5); THEN his 2nd-card trigger resolves: +2 this turn (7) and readied — the Brute still only took 5", async () => {
    const game = await board(4).build();
    await game.p1.play("pawn");
    await game.settle();
    await game.p1.cast("challenge", { targets: ["darius", "brute"] });
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash"); // 5 ≥ 4
    expect(game.state("darius")).toMatchObject({ damage: 4, isReady: true, might: 7, zone: "base" });
    expect(game.violations()).toEqual([]);
  });
});
