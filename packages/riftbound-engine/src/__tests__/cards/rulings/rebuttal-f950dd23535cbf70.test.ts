/**
 * Ruling f950dd23535cbf70 — Rebuttal (VEN-152 → ven-152-166) · Spell · [Reaction] · [1][rainbow]
 *   "Choose a spell with Energy cost no more than [4]. You may pay [rainbow]. If you do, gain control of it
 *    and you may make new choices for it. Otherwise, counter it."
 *   × Hextech Ray (OGN-009 → ogn-009-298) · [Action] · [1][fury] "Deal 3 to a unit at a battlefield."
 *   × Galio, Indefatigable (UNL-171 → unl-171-219) · 6 Might · [Deflect] [Tank].
 *
 * Q: Do I have to pay the [Deflect] cost of a spell I take over with Rebuttal?
 * A: No. [Deflect] is a cost charged when a spell is PLAYED (finalized) — the original controller already
 *    paid it. Rebuttal does not play the spell, it only changes control of an already-finalized chain item.
 *    And if you use the "make new choices" option to aim it at a Deflect unit, that new Deflect cost is
 *    ignored too: costs "to play" incurred by new choices on a finalized item are not charged.
 * Rules: 809.1.c (Deflect applies during finalization only), 755 (costs from new choices on a finalized
 *        chain item are ignored), 751–754 (new choices), 340.4 (priority after a control change).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REBUTTAL = "ven-152-166";
const HEXTECH_RAY = "ogn-009-298";
const GALIO = "unl-171-219";

/**
 * P2's turn. P2 casts Hextech Ray at P1's plain Grunt at bf1; P1's Galio ([Deflect]) also stands there.
 * P1 holds Rebuttal with exactly [1] + two [rainbow]: one for Rebuttal's pip, one for its optional pay.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1, power: { fury: 1, rainbow: 1 } })
    .resources(P1, { energy: 1, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Grunt" }, "grunt")
    .unit(P1, "bf1", GALIO, "galio")
    .hand(P2, HEXTECH_RAY, "ray")
    .hand(P1, REBUTTAL, "reb");
}

/** P2 casts the Ray at the Grunt; P1 answers with Rebuttal on it and both pass until Rebuttal resolves. */
async function rebutTheRay(game: Game): Promise<void> {
  await game.p2.cast("ray", { targets: "grunt" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 1 } }); // no Deflect owed for the Grunt
  if (game.actingSeat() === P2) await game.p2.passPriority();
  await game.p1.cast("reb", { targets: "ray" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "reb"]);
  while (game.decision()?.kind === "action" && game.chain().some((c) => c.cardId === "reb")) {
    await game.acting().passPriority();
  }
}

describe("Ruling f950dd23535cbf70 — taking control of a spell never charges [Deflect]", () => {
  test("ruling: paying Rebuttal's optional [rainbow] hands P1 the Ray and costs P1 nothing beyond Rebuttal itself", async () => {
    const game = await board().build();
    await rebutTheRay(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // [1][rainbow] + the optional [rainbow]
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P1, countered: false })]);
    expect(game.zoneOf("reb")).toBe("trash");
  });

  test("…and re-aiming it onto the [Deflect] Galio costs nothing either — the new Deflect is flagged as ignored", async () => {
    const game = await board().build();
    await rebutTheRay(game);
    await game.p1.yes();
    // "you may make new choices for it" — the target slot is offered to the new controller.
    const d = game.decision() as Extract<Decision, { kind: "pick" }>;
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { pendingChoiceType: "new-choices" } });
    const galioOption = d.options.find((o) => o.card === "galio") as { deflect?: number; surcharge?: number } | undefined;
    expect(galioOption).toBeDefined();
    // No surcharge is quoted on the Deflect unit: rule 755 ignores costs "to play" for new choices.
    expect(galioOption?.deflect).toBeUndefined();
    expect(galioOption?.surcharge).toBeUndefined();
    await game.p1.pick("galio");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // still nothing charged
    await game.settle();
    expect(game.state("galio").damage).toBe(3);
    expect(game.state("grunt").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("keeping the original choice works too: the Ray resolves for P1 against the Grunt", async () => {
    const game = await board().build();
    await rebutTheRay(game);
    await game.p1.yes();
    await game.p1.decline(); // keep the current target
    await game.settle();
    expect(game.state("grunt").damage).toBe(3);
    expect(game.state("galio").damage).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });

  test("intermediate fact: [Deflect] IS charged to whoever PLAYS the spell — P2 aiming the Ray at Galio pays the surcharge up front", async () => {
    const game = await board().build();
    await game.p2.cast("ray", { targets: "galio" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 0 } }); // the extra [rainbow] went on Deflect
  });

  test("…and P1 taking that same already-paid-for spell over adds no second Deflect charge", async () => {
    const game = await board().build();
    await game.p2.cast("ray", { targets: "galio" });
    if (game.actingSeat() === P2) await game.p2.passPriority();
    await game.p1.cast("reb", { targets: "ray" });
    while (game.decision()?.kind === "action" && game.chain().some((c) => c.cardId === "reb")) {
      await game.acting().passPriority();
    }
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // Rebuttal's own cost only
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P1 })]);
  });

  test("declining the optional pay simply counters the Ray — nobody is damaged", async () => {
    const game = await board().build();
    await rebutTheRay(game);
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("grunt").damage).toBe(0);
    expect(game.state("galio").damage).toBe(0);
    expect(game.p1.power("rainbow")).toBe(1); // the optional [rainbow] was not spent
    expect(game.violations()).toEqual([]);
  });
});
