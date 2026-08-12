/**
 * Ruling 6e31bb7e0af6ae75 — Traveling Merchant (OGN-185 → ogn-185-298) · Unit · Chaos · [2] · 2 Might
 *     "When I move, discard 1, then draw 1."
 *   × Yasuo, Remorseful (OGN-076 → ogn-076-298) · 6 Might · "When I attack, deal damage equal to my Might to an
 *     enemy unit here." (an attack trigger)
 *
 * Q: I attack with Traveling Merchant and another unit that has an Attack trigger — which triggers first?
 * A: The Merchant's is a MOVE trigger, not an attack trigger. It triggers and fully resolves before the showdown
 *    begins; only then are attacker/defender assigned and the attack triggers put on the initial chain.
 * Rules: 448 (Cleanup after a Move action), 383.3 (triggers go on the chain when they trigger),
 *        464.2.c.3 (designations as combat is staged), 336/337 (chain resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MERCHANT = "ogn-185-298";
const YASUO = "ogn-076-298";
const SKULKER = "ogn-175-298";

/** P1's turn. P2 holds bf1 with a 7-Might Guard (survives Yasuo's 6). P1 sends Merchant + Yasuo together. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7, name: "Guard" }, "guard")
    .unit(P1, "base", MERCHANT, "merchant")
    .unit(P1, "base", YASUO, "yasuo")
    .hand(P1, SKULKER, "spare")
    .deck(P1, [SKULKER, SKULKER], ["d1", "d2"]);
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

describe("Ruling 6e31bb7e0af6ae75 — the Merchant's move trigger goes first, before any attack trigger exists", () => {
  test("both units move in together: ONLY the Merchant's move trigger is on the chain, and nobody is an attacker yet", async () => {
    const game = await board().build();
    await game.p1.move(["merchant", "yasuo"], "bf1");
    expect(chainIds(game)).toEqual(["merchant"]);
    expect(game.chain()[0]).toMatchObject({ controller: P1, triggered: true });
    expect(game.state("merchant").combatRole).toBeNull();
    expect(game.state("yasuo").combatRole).toBeNull();
    expect(game.state("guard").combatRole).toBeNull();
    expect(game.state("guard").damage).toBe(0); // Yasuo's attack trigger has not even triggered
  });

  test("that trigger resolves first (discard 1 → draw 1); Yasuo's attack trigger only appears afterwards, once the showdown is staged", async () => {
    const game = await board().build();
    await game.p1.move(["merchant", "yasuo"], "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Merchant's move trigger resolves
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "RES" });
    await game.p1.pick("spare");
    expect(game.zoneOf("spare")).toBe("trash");
    expect(game.p1.hand()).toContain("d1");
    // Now — and only now — combat is staged and the attack trigger is on the initial chain.
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.state("merchant").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(chainIds(game)).toEqual(["yasuo"]);
    expect(game.chain()[0]).toMatchObject({ controller: P1, triggered: true });
  });

  test("epilogue: Yasuo's attack trigger then resolves for 6 into the Guard — strictly after the Merchant's discard/draw", async () => {
    const game = await board().build();
    await game.p1.move(["merchant", "yasuo"], "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("spare");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Yasuo's attack trigger resolves
    expect(chainIds(game)).toEqual([]);
    expect(game.state("guard").damage).toBe(6);
    expect(game.zoneOf("guard")).toBe("battlefield-bf1"); // 7 Might survives
    expect(game.violations()).toEqual([]);
  });
});
