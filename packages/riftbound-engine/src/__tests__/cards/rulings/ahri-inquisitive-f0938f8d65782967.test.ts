/**
 * Ruling f0938f8d65782967 — Ahri, Inquisitive (OGN-119 → ogn-119-298) · Unit · Mind · 3 Might
 *   "When I attack or defend, give an enemy unit here -2 [Might] this turn, to a minimum of 1 [Might]."
 *   × Galio, Indefatigable (UNL-171 → unl-171-219) · 6 Might · [Deflect] [Tank] "I don't deal combat damage."
 *
 * Q: Must you pay [Deflect] when Ahri's TRIGGERED ability chooses a Deflect unit, and may you decline?
 * A: Yes — the surcharge is owed as the trigger picks its target. You may refuse to pay, and if you do the
 *    triggered ability ceases to exist: it is removed before it ever becomes a chain item.
 * Rules: 809.1.c.1 ([Deflect] surcharge is charged when the object is chosen), 402.2 (a trigger's targets are
 *        chosen at finalization), 402.4 / 404.2 (a trigger with no payable choice is removed unasked).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AHRI = "ogn-119-298";
const GALIO = "unl-171-219";

/** P1's Ahri in base about to attack P2's bf1. `power` = P1's floating [rainbow]. */
function board(power: number, withGrunt: boolean) {
  const s = scenario()
    .resources(P1, { energy: 3, power: { rainbow: power } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", AHRI, "ahri")
    .unit(P2, "bf1", GALIO, "galio");
  return withGrunt ? s.unit(P2, "bf1", { might: 2, name: "Grunt" }, "grunt") : s;
}

describe("Ruling f0938f8d65782967 — Ahri's trigger owes [Deflect] for the unit it chooses", () => {
  test("ruling: the choice is offered at FINALIZATION and the Galio option carries its +1 [Deflect] surcharge", async () => {
    const game = await board(1, true).build();
    await game.p1.move("ahri", "bf1");
    const d = game.decision() as Extract<Decision, { kind: "pick" }>;
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", timing: "FIN" });
    expect(d.source?.cardId).toBe("ahri");
    expect(d.options.find((o) => o.card === "galio")).toMatchObject({ deflect: 1 });
    expect(d.options.find((o) => o.card === "grunt")?.deflect).toBeUndefined();
  });

  test("…and picking Galio actually charges it: P1's [rainbow] is gone and Galio ends at 4 Might", async () => {
    const game = await board(1, true).build();
    await game.p1.move("ahri", "bf1");
    expect(game.p1.power("rainbow")).toBe(1);
    await game.p1.pick("galio");
    expect(game.p1.power("rainbow")).toBe(0); // paid at finalization, before the item can resolve
    await game.settle();
    expect(game.state("galio").might).toBe(4); // 6 − 2
  });

  test("control: picking the non-Deflect Grunt costs nothing", async () => {
    const game = await board(1, true).build();
    await game.p1.move("ahri", "bf1");
    await game.p1.pick("grunt");
    expect(game.p1.power("rainbow")).toBe(1);
    await game.settle();
    expect(game.state("grunt").might).toBe(1); // 2 − 2, floored at the printed minimum of 1
    expect(game.state("galio").might).toBe(6);
  });

  test("ruling: when the surcharge cannot be paid the ability CEASES TO EXIST — nothing is asked, nothing reaches the chain, no -2 lands", async () => {
    const game = await board(0, false).build();
    await game.p1.move("ahri", "bf1");
    expect(game.decision()?.kind).not.toBe("pick"); // no prompt at all
    expect(game.chain()).toEqual([]); // never became a chain item
    expect(game.state("galio").might).toBe(6);
    await game.settle();
    expect(game.state("galio")).toMatchObject({ might: 6, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });

  test("…and with a payable non-Deflect alternative present, an unaffordable Galio is simply dropped: the Grunt is the only candidate left", async () => {
    const game = await board(0, true).build();
    await game.p1.move("ahri", "bf1");
    // Only one payable candidate remains, so nothing has to be asked — it is bound straight away.
    expect(game.chain().map((c) => c.cardId)).toEqual(["ahri"]);
    await game.settle();
    expect(game.state("grunt").might).toBe(1); // 2 − 2, floored at 1
    expect(game.state("galio")).toMatchObject({ might: 6, mightModifier: 0 });
    expect(game.p1.power("rainbow")).toBe(0);
  });

  // ruling f0938f8d65782967 — "you may refuse to pay, and the ability then ceases to exist". When Galio is the
  // ONLY candidate the refusal is not a target choice at all but the payment question itself (DESIGN.md
  // §Paying costs = manual pay): the surcharge is surfaced as the FIN opt-in on Ahri's own item, so answering
  // 'no' pays nothing and drops the trigger. A declinable *pick* would be the wrong surface — 402.2 keeps a
  // trigger's target choice mandatory once a payable candidate has been named.
  test("ruling f0938f8d65782967 — with Galio the only candidate P1 is asked to pay the [Deflect], and refusing removes Ahri's trigger from the chain, unpaid", async () => {
    const game = await board(1, false).build();
    await game.p1.move("ahri", "bf1");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN", canAccept: true });
    expect(d?.prompt).toContain("Deflect");
    expect(game.chain().map((i) => i.cardId)).toEqual(["ahri"]);

    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.state("galio").might).toBe(6);
    await game.settle();
    expect(game.state("galio")).toMatchObject({ might: 6, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });

  test("…and accepting that same offer pays the [rainbow] and lands the -2 (the refusal is a real fork, not a no-op prompt)", async () => {
    const game = await board(1, false).build();
    await game.p1.move("ahri", "bf1");
    await game.p1.yes();
    await game.settle();
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.state("galio").might).toBe(4);
  });
});
