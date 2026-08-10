/**
 * Ruling 06f1f687cbe64e69 — Daughter of the Void (OGN-247 → ogn-247-298) · Legend · Kai'Sa
 *   "[Exhaust]: [Reaction] — [Add] [rainbow]. Use only to play spells. (Abilities that add resources can't be
 *    reacted to.)"
 *   × Malzahar, Fanatic (OGN-113 → ogn-113-298) · 3 Might "Kill a friendly unit or gear, [Exhaust]: [Action] —
 *     [Add] [rainbow][rainbow]."
 *   (+ Smoke Screen ogn-093-298, a [2][mind] Reaction, as the spell the added power pays for.)
 *
 * Q: When you use an [Add] ability during a Showdown, does Focus pass after it resolves?
 * A: No. The Add ability goes on the chain, resolves immediately (cannot be reacted to), and you keep BOTH
 *    Focus and priority — you may immediately spend the added resources on another card/ability.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DAUGHTER_OF_THE_VOID = "ogn-247-298";
const MALZAHAR = "ogn-113-298";
const SMOKE_SCREEN = "ogn-093-298";

/**
 * P1's turn. bf1 is P2's with a 5-Might Wall; P1's Scout (2) attacks it → combat showdown, P1 has Focus.
 * P1: Kai'Sa legend, Malzahar + a Trinket gear in base, Smoke Screen in hand, [2] energy but NO power —
 * so Smoke Screen ([2][mind]) is unaffordable until something Adds a [rainbow].
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .legend(P1, DAUGHTER_OF_THE_VOID, "kaisa")
    .unit(P1, "base", MALZAHAR, "malz")
    .gear(P1, { cardType: "gear", name: "Trinket" }, "trinket")
    .hand(P1, SMOKE_SCREEN, "smoke")
    .resources(P1, { energy: 2 });
}

describe("Ruling 06f1f687cbe64e69 — [Add] abilities in a Showdown resolve at once and do NOT pass Focus", () => {
  test("setup: Scout attacking opens a showdown where P1 holds Focus; Smoke Screen is not yet castable (no power)", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "smoke")).toBe(false);
    expect(game.p1.can("activate", "kaisa")).toBe(true);
  });

  test("Kai'Sa legend: activating [Add][rainbow] with Focus resolves immediately (empty chain, legend exhausted, +1 rainbow) and P1 STILL has Focus and priority", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.p1.activate("kaisa");
    expect(game.chain()).toEqual([]); // resolved at once — nothing for P2 to respond to
    expect(game.state("kaisa").isExhausted).toBe(true);
    expect(game.p1.power("rainbow")).toBe(1);
    // Focus did not pass: it is still P1's showdown action, not P2's.
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("…and P1 can immediately spend the added [rainbow] on a spell (Smoke Screen on Wall) without P2 acting in between", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.p1.activate("kaisa");
    expect(game.p1.can("cast", "smoke")).toBe(true);
    await game.p1.cast("smoke", { targets: "wall" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["smoke"]);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("wall").might).toBe(1);
  });

  test("Malzahar ([Action] — kill Trinket, exhaust: [Add] 2 rainbow) in the showdown: resolves at once, P1 keeps Focus and can cast right away", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    expect(game.p1.can("activate", "malz")).toBe(true); // [Action] abilities are usable in showdowns
    await game.p1.activate("malz", undefined, { sacrifice: "trinket" });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("trinket")).toBe("trash");
    expect(game.state("malz").isExhausted).toBe(true);
    expect(game.p1.power("rainbow")).toBe(2);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "smoke")).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
