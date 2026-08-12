/**
 * Ruling 50eb12a831dcd065 — Brutalizer (SFD-042 → sfd-042-221) · Equipment · [2] · +1 Might
 *   "[Equip] [calm]. If this was attached to me this turn, I have an additional +2 [Might]."
 *   × Grandmaster at Arms (SFD-193 → sfd-193-221, Jax legend) #1 "[Exhaust]: Attach an attached
 *     Equipment you control to a unit you control." — the way to detach it again.
 *
 * Q: If a Brutalizer is equipped and then detached, does the +2 persist on the unit?
 * A: No. Both of Brutalizer's bonuses — the printed +1 Might Bonus and the conditional +2 — apply
 *    only while it is attached, and are lost the instant it detaches. Nothing lingers on the unit.
 * Rules: 136.3.a (a Might Bonus applies while the card is Attached and stops when it is not),
 *        434.1.f (attaching anew detaches first), 435.1.e (a detached Equipment's Effect Text is inactive).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const BRUTALIZER = "sfd-042-221";
const JAX = "sfd-193-221";

/** P1's turn: Jax legend, [calm] banked, a detached Brutalizer and two 2-Might units in base. */
function board() {
  return scenario()
    .legend(P1, JAX, "jax")
    .resources(P1, { energy: 0, power: { calm: 1 } })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .unit(P1, "base", { might: 2, name: "Page" }, "page")
    .gear(P1, BRUTALIZER, "brut");
}

/** Equip Brutalizer onto the Squire for [calm]. */
async function equipped(): Promise<Game> {
  const game = await board().build();
  await game.p1.choose("equipCard", { params: { equipmentId: "brut", unitId: "squire" } });
  await game.settle();
  expect(game.state("brut").attachedTo).toBe("squire");
  return game;
}

/** Jax #1: re-attach the Brutalizer onto `to`, which detaches it from whoever wears it. */
async function reattachTo(game: Game, to: string): Promise<void> {
  const wanted = ["brut", to];
  const hasTargets = game.p1.option("activateAbility:jax#1")?.fields.some((f) => f.arg === "targets");
  await game.p1.activate("jax", 1, hasTargets ? { targets: wanted } : { answers: wanted });
  for (let i = 0; i < 4; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d?.kind !== "pick") {
      return;
    }
    const hit = d.options.find((o) => wanted.includes(o.card ?? o.key));
    await game.p1.pick(hit ? hit.key : (d.options[0]?.key as string));
  }
}

describe("Ruling 50eb12a831dcd065 — Brutalizer's +2 (and its +1) vanish the moment it detaches", () => {
  test("premise: while attached this turn the 2-Might Squire is a 5 (2 + 1 Might Bonus + 2 'attached this turn')", async () => {
    const game = await equipped();
    expect(game.state("squire")).toMatchObject({ attachments: ["brut"], baseMight: 2, might: 5 });
  });

  test("ruling 50eb12a831dcd065 — Jax moves the Brutalizer to the Page: the Squire keeps NOTHING and is a bare 2 again", async () => {
    const game = await equipped();
    await reattachTo(game, "page");
    expect(game.state("brut").attachedTo).toBe("page");
    expect(game.state("squire")).toMatchObject({ attachments: [], baseMight: 2, might: 2 });
    expect(game.state("squire").mightModifier).toBe(0); // nothing was left behind as a lingering buff
    expect(game.violations()).toEqual([]);
  });

  test("the bonuses travel with the card: the Page (the new holder) is the one at 5", async () => {
    const game = await equipped();
    await reattachTo(game, "page");
    expect(game.state("page")).toMatchObject({ attachments: ["brut"], baseMight: 2, might: 5 });
  });

  test("and the Squire stays a 2 into the next turn — the loss is permanent, not a 'this turn' effect that could come back", async () => {
    const game = await equipped();
    await reattachTo(game, "page");
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.state("squire").might).toBe(2);
    expect(game.state("brut").attachedTo).toBe("page");
  });
});
