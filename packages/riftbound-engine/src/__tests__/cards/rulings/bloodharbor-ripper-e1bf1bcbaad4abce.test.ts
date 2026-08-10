/**
 * Ruling e1bf1bcbaad4abce — Bloodharbor Ripper (Pyke legend, UNL-185 → unl-185-219)
 *     "[1], [Exhaust]: Return a friendly unit at a battlefield to its owner's hand. Play a Gold gear token exhausted."
 *
 * Q: Can Pyke's legend ability be used during a Showdown?
 * A: No. An activated ability without [Action] or [Reaction] may only be activated on your turn in a (Neutral) Open State
 *    with an empty chain — never mid-showdown, whether you are attacking or defending.
 * Rules: 381 / 398 (activated ability timing), 813 ([Action] needed for showdowns), 347 (Focus lets you play Actions only),
 *        310 (turn states).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BLOODHARBOR_RIPPER = "unl-185-219";

/**
 * P1 = Pyke legend with [1] floating and a friendly unit at a battlefield in every case (so cost and target are never the
 * reason the ability is missing). bf1: P1's Holder. bf2: P2's Sentry. P1's Raider / P2's Attacker in base to open showdowns.
 */
function board(active: typeof P1 | typeof P2 = P1) {
  return scenario()
    .active(active)
    .legend(P1, BLOODHARBOR_RIPPER, "pyke")
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 5, name: "Sentry" }, "sentry")
    .unit(P1, "base", { might: 2, name: "Raider" }, "raider")
    .unit(P2, "base", { might: 2, name: "Attacker" }, "attacker");
}

describe("Ruling e1bf1bcbaad4abce — Pyke's legend ability has no [Action]/[Reaction]: not usable in showdowns", () => {
  test("baseline: on P1's turn in a Neutral Open state the ability IS available and works (Holder → hand, exhausted Gold token, legend exhausted, [1] paid)", async () => {
    const game = await board().build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "pyke")).toBe(true);
    await game.p1.activate("pyke", 0, { targets: "holder", answers: ["holder"] });
    await game.settle();
    expect(game.state("pyke").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("holder")).toBe("hand");
    const gold = game.p1.gear().find((g) => game.state(g).isToken);
    expect(gold).toBeDefined();
    expect(game.state(gold as string)).toMatchObject({ isExhausted: true, name: "Gold" });
  });

  test("attacking: P1's Raider opens a combat showdown at bf2; while P1 holds Focus (chain empty, Showdown Open) the legend ability is NOT on the menu and activating it is rejected", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf2");
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf2", focusPlayer: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "pyke")).toBe(false);
    const r = await game.p1.try((p) => p.activate("pyke", 0, { targets: "holder" }));
    expect(r.ok).toBe(false);
    expect(game.state("pyke").isExhausted).toBe(false);
    expect(game.p1.energy()).toBe(1);
    expect(game.locationOf("holder")).toBe("bf1");
  });

  test("defending: on P2's turn P2 attacks bf1; when Focus passes to P1 mid-showdown the ability is still unavailable (not P1's turn, not Neutral Open)", async () => {
    const game = await board(P2).build();
    await game.p2.move("attacker", "bf1");
    expect(game.state("holder").combatRole).toBe("defender");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "pyke")).toBe(false);
    expect((await game.p1.try((p) => p.activate("pyke", 0, { targets: "holder" }))).ok).toBe(false);
    expect(game.locationOf("holder")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });
});
