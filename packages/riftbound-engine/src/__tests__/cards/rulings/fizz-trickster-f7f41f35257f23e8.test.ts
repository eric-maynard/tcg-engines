/**
 * Ruling f7f41f35257f23e8 — Fizz, Trickster (SFD-140 → sfd-140-221) · 3 [Might] · [3][chaos]
 *   "When you play me, you may play a spell from your trash with Energy cost no more than [3], ignoring its Energy
 *    cost. Recycle that spell after you play it."
 *   × Cleave (OGN-004 → ogn-004-298) · [Action] · [1] · "Give a unit [Assault 3] this turn."
 *
 * Q: Can the spell Fizz lets me play target Fizz himself?
 * A: Yes. Fizz's ability and the spell it plays are separate objects — the spell picks its target by its own rules,
 *    and Fizz is an ordinary unit for "a unit". (A spell reading "an ENEMY unit" still could not choose him.)
 * Rules: 355.9.c (an ability's source is a legal target of what the ability plays), 355.10 (targets declared on play),
 *        383.3.a (the leading "you may" is decided at finalization; the play happens as the item resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIZZ = "sfd-140-221";
const CLEAVE = "ogn-004-298";

/** P1's turn. Cleave sits in the trash; Fizz is in hand with exactly his cost available. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .trash(P1, CLEAVE, "cleave")
    .hand(P1, FIZZ, "fizz")
    .resources(P1, { energy: 3, power: { chaos: 1 } });
}

/** Play Fizz, accept his trigger, and resolve it — the trash Cleave is now asking for its target. */
async function cleaveTargeting(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("fizz", { to: "base" });
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "fizz" } });
  await game.p1.yes();
  await game.acting().passPriority();
  await game.acting().passPriority();
  return game;
}

describe("Ruling f7f41f35257f23e8 — a spell Fizz plays from the trash may target Fizz himself", () => {
  test("the trash Cleave goes on the Chain and Fizz is offered as one of its targets", async () => {
    const game = await cleaveTargeting();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d.prompt).toContain("Cleave");
    expect(d.options.map((o) => o.key).sort()).toEqual(["fizz", "foe"]);
  });

  test("aiming it at Fizz works — he ends up with [Assault 3] and the opponent's unit is untouched", async () => {
    const game = await cleaveTargeting();
    await game.p1.pick("fizz");
    await game.settle();
    expect(game.zoneOf("fizz")).toBe("base");
    expect(game.state("fizz").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("foe").grantedKeywords).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("Cleave's own [1] Energy is ignored — only Fizz's [3][chaos] was paid — and Cleave is recycled, not re-trashed", async () => {
    const game = await cleaveTargeting();
    await game.p1.pick("fizz");
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("chaos")).toBe(0);
    expect(game.zoneOf("cleave")).toBe("mainDeck");
  });

  test("the choice stays free: aiming the same Cleave at the enemy unit instead is equally legal", async () => {
    const game = await cleaveTargeting();
    await game.p1.pick("foe");
    await game.settle();
    expect(game.state("foe").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("fizz").grantedKeywords).toEqual([]);
  });
});
