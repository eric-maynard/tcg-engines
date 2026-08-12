/**
 * Interaction: Baited Hook (ogn-242-298) · Gear · Order · [3]
 *     "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 …"   — NO [Action] tag
 *   × Malzahar, Fanatic (ogn-113-298) · Unit · Mind · [4] · 3 Might
 *     "Kill a friendly unit or gear, [Exhaust]: [Action] — [Add] [rainbow][rainbow].
 *      (Use on your turn or in showdowns. Abilities that add resources can't be reacted to.)"
 *   × Sunlit Guardian (ogn-054-298) · Unit · Calm · [3] · 3 Might · [Shield] [Tank]  — the unit that
 *     walks into bfA and opens the Showdown.
 *
 * Rules: 145.2 (a unit's activated ability may be executed during its controller's Main Phase in an Open
 * State, AND NOT DURING A SHOWDOWN), 151.2 (same sentence for gear), 313.1 / 313.1.a (a player with Focus
 * may not play spells or activate abilities that lack [Action] or [Reaction]), 806.1 / 806.1.a ([Action]
 * may sit on a permanent's activated ability), 429.2 / 429.2.a ([Add] abilities resolve as soon as they
 * are finalized, ahead of other outstanding chain items — nothing goes on the chain, nothing can respond),
 * 316.5.b (Neutral Open Main Phase), 310.1.a.
 *
 * Question: P1 moves Sunlit Guardian into bfA, opening a non-combat Showdown in which P1 holds Focus.
 * P1's board also has Baited Hook (gear, untagged ability) and Malzahar, Fanatic at bfA, and P1 has the
 * runes to pay BOTH costs.
 *   (a) Which of the two may P1 activate right now?
 *   (b) The client greys the illegal one with "Can't pay its cost right now" — is that the real reason?
 *   (c) When Malzahar's [Add] is activated, does Focus pass, or does anything go on the chain?
 *   (d) Same board in a Neutral Open Main Phase with no showdown — which is usable then?
 *
 * Expected: (a) only Malzahar's — his ability carries [Action]; Baited Hook's does not, so 145.2 / 151.2
 * still bar it and 313.1.a lifts the bar only for tagged abilities. (b) NO: the cost is fully payable, as
 * (d) proves with the same pool — the reason is the missing [Action] permission during a Showdown.
 * (c) nothing is added to the chain and Focus does NOT pass: P1 keeps it and the pool gains
 * [rainbow][rainbow]. (d) in a Neutral Open Main Phase both are usable and the tag is irrelevant.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HOOK = "ogn-242-298";
const MALZ = "ogn-113-298";
const GUARDIAN = "ogn-054-298";

/** Enough for BOTH costs: Baited Hook wants [1][order]; Malzahar wants a friendly kill + [Exhaust]. */
const POOL = { energy: 4, power: { order: 2 } };

/** P1 is about to walk Sunlit Guardian into bfA and open a non-combat Showdown there. */
function preShowdown() {
  return scenario()
    .resources(P1, POOL)
    .battlefield("bfA", { controller: P2 })
    .battlefield("bfB", { controller: P1 })
    .unit(P1, "base", GUARDIAN, "guardian")
    .unit(P1, "bfA", MALZ, "malz")
    .unit(P1, "bfB", { might: 1, name: "Pawn" }, "pawn")
    .gear(P1, HOOK, "hook");
}

/** Same board, nothing contested: a plain Neutral Open Main Phase. */
function neutralOpen() {
  return scenario()
    .resources(P1, POOL)
    .battlefield("bfB", { controller: P1 })
    .unit(P1, "base", GUARDIAN, "guardian")
    .unit(P1, "base", MALZ, "malz")
    .unit(P1, "bfB", { might: 1, name: "Pawn" }, "pawn")
    .gear(P1, HOOK, "hook");
}

describe("Showdown permission: an untagged gear ability is barred, Malzahar's [Action] [Add] is not", () => {
  test("premise: only Malzahar's ability is printed with [Action] (806.1.a); Baited Hook's is untagged", async () => {
    const game = await neutralOpen().build();
    expect(game.state("malz").rulesText).toContain("[Action]");
    expect(game.state("malz").rulesText).toContain("in showdowns");
    expect(game.state("hook").rulesText).not.toContain("[Action]");
  });

  test("premise: moving Sunlit Guardian into bfA opens a Showdown at bfA with P1 holding Focus (310.1.a, 345)", async () => {
    const game = await preShowdown().build();
    await game.p1.move("guardian", "bfA");
    expect(game.gameState.battlefields.bfA?.contested).toBe(true);
    expect(game.gameState.battlefields.bfA?.contestedBy).toBe(P1);
    const d = game.decision();
    expect(d?.kind).toBe("action");
    expect(d?.seat).toBe(P1);
    expect((d as { context?: string }).context).toBe("showdown");
    expect(game.p2.units("bfA")).toEqual([]); // non-combat: no enemy unit here
  });

  test("(a) during the Showdown ONLY Malzahar's ability is offered — Baited Hook is absent from the menu (145.2 / 151.2, 313.1.a)", async () => {
    const game = await preShowdown().build();
    await game.p1.move("guardian", "bfA");
    expect(game.p1.can("activate", "malz")).toBe(true);
    expect(game.p1.can("activate", "hook")).toBe(false);
    const keys = game.p1.legal().map((o) => o.key);
    expect(keys).toContain("activateAbility:malz#0");
    expect(keys.some((k) => k.startsWith("activateAbility:hook"))).toBe(false);
  });

  test("(b) the reason is NOT payability: the pool still holds [1][order] and a killable friendly unit, and the refusal quotes the MENU, not a cost", async () => {
    const game = await preShowdown().build();
    await game.p1.move("guardian", "bfA");
    // Everything Baited Hook's cost asks for is present: [1][order], a ready gear, a friendly unit.
    expect(game.p1.energy()).toBeGreaterThanOrEqual(1);
    expect(game.p1.power("order")).toBeGreaterThanOrEqual(1);
    expect(game.state("hook").isExhausted).toBe(false);
    expect(game.p1.units().length).toBeGreaterThan(0);

    const refused = await game.p1.try((p) => p.activate("hook"));
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.error.code).toBe("UNKNOWN_OPTION");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { order: 2 } });
    expect(game.state("hook").isExhausted).toBe(false);
  });

  test("(b) and adding MORE resources does not unlock it — after Malzahar's [Add] the Hook is still barred", async () => {
    const game = await preShowdown().build();
    await game.p1.move("guardian", "bfA");
    await game.p1.activate("malz", 0, { costs: { paid: { kill: "pawn" } } });
    expect(game.p1.power("rainbow")).toBe(2);
    expect(game.p1.can("activate", "hook")).toBe(false);
  });

  test("(c) the [Add] never reaches the chain and Focus does NOT pass — P1 still acts in the same Showdown (429.2, 429.2.a)", async () => {
    const game = await preShowdown().build();
    await game.p1.move("guardian", "bfA");
    await game.p1.activate("malz", 0, { costs: { paid: { kill: "pawn" } } });
    expect(game.chain()).toEqual([]);
    expect(game.actingSeat()).toBe(P1);
    const d = game.decision();
    expect((d as { context?: string }).context).toBe("showdown");
    expect(d?.prompt).toContain("Focus");
    expect(game.gameState.battlefields.bfA?.contested).toBe(true);
  });

  test("(c) the [Add] itself resolved: the pool gained [rainbow][rainbow], the cost objects are gone, Malzahar is exhausted", async () => {
    const game = await preShowdown().build();
    await game.p1.move("guardian", "bfA");
    await game.p1.activate("malz", 0, { costs: { paid: { kill: "pawn" } } });
    expect(game.p1.power("rainbow")).toBe(2);
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.state("malz").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("(d) Neutral Open Main Phase: BOTH are usable — outside a Showdown the [Action] tag is never the reason (145.2, 151.2, 316.5.b)", async () => {
    const game = await neutralOpen().build();
    expect(game.p1.can("activate", "malz")).toBe(true);
    expect(game.p1.can("activate", "hook")).toBe(true);
    const keys = game.p1.legal().map((o) => o.key);
    expect(keys).toContain("activateAbility:malz#0");
    expect(keys).toContain("activateAbility:hook#0");
  });

  test("(d) and Baited Hook's cost really is payable from that very pool — it exhausts and charges [1][order]", async () => {
    const game = await neutralOpen().build();
    await game.p1.activate("hook", 0, { targets: "pawn" });
    expect(game.state("hook").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(3);
    expect(game.p1.power("order")).toBe(1);
  });
});
