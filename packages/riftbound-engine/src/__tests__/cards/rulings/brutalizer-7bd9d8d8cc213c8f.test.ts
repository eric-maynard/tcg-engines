/**
 * Ruling 7bd9d8d8cc213c8f — Brutalizer (SFD-042 → sfd-042-221) · Equipment · +1 Might "[Equip] [calm]. If this was attached to me
 *   this turn, I have an additional +2 [Might]." × Grandmaster at Arms (SFD-193 → sfd-193-221, Jax legend)
 *   #1 "[Exhaust]: Attach an attached Equipment you control to a unit you control."
 *
 * Q: If I equip Brutalizer and then re-equip it with Jax's legend ability, do I get +2 or +4?
 * A: Neither stacks: the unit has +3 total from Brutalizer (+1 bonus, +2 "attached this turn"). On detaching it loses every
 *    Brutalizer bonus; on re-attaching it regains +1 and +2. Never +4 / +5.
 * Rules: 136.3.a (Might Bonus applies only while attached), 434.1.f (attach anew ⇒ detach first), 435.1.e.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BRUTALIZER = "sfd-042-221";
const JAX = "sfd-193-221";

/** P1's turn: Jax legend, [calm] in pool, Brutalizer (detached) in base, Squire (2) and Page (2) in base. */
function board() {
  return scenario()
    .legend(P1, JAX, "jax")
    .resources(P1, { energy: 0, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .unit(P1, "base", { might: 2, name: "Page" }, "page")
    .gear(P1, BRUTALIZER, "brut");
}

/** Equip Brutalizer onto Squire for [calm]. */
async function equipped(): Promise<Game> {
  const game = await board().build();
  await game.p1.choose("equipCard", { params: { equipmentId: "brut", unitId: "squire" } });
  await game.settle();
  expect(game.p1.power("calm")).toBe(0);
  expect(game.state("brut").attachedTo).toBe("squire");
  return game;
}

/** Activate Jax #1 (re-attach an attached Equipment) steering every prompt toward `wanted` (equipment, then unit). */
async function jaxReequip(game: Game, wanted: string[]): Promise<void> {
  const hasTargets = game.p1.option("activateAbility:jax#1")?.fields.some((f) => f.arg === "targets");
  await game.p1.activate("jax", 1, hasTargets ? { targets: wanted } : { answers: wanted });
  for (let i = 0; i < 4; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d?.kind !== "pick") {
      return;
    }
    expect(d.seat).toBe(P1);
    const hit = d.options.find((o) => wanted.includes(o.card ?? o.key));
    await game.p1.pick(hit ? hit.key : (d.options[0]?.key as string));
  }
}

describe("Ruling 7bd9d8d8cc213c8f — re-equipping Brutalizer with Jax gives +3 total, never +4", () => {
  test("mechanics: Equip attaches Brutalizer to the Squire; Jax #1 (Exhaust) re-attaches it and it ends up on the Squire again with Jax exhausted", async () => {
    const game = await equipped();
    expect(game.state("squire").attachments).toEqual(["brut"]);
    await jaxReequip(game, ["brut", "squire"]);
    expect(game.state("jax").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.state("brut").attachedTo).toBe("squire");
    expect(game.state("squire").attachments).toEqual(["brut"]);
    expect(game.violations()).toEqual([]);
  });

  test("freshly equipped 2-Might Squire reads 2 + 1 (bonus) + 2 (attached this turn) = 5", async () => {
    const game = await equipped();
    expect(game.state("squire")).toMatchObject({ attachments: ["brut"], baseMight: 2, might: 5 });
  });

  test("the ruling: after the same-turn Jax re-equip onto the SAME unit it is exactly 5 (+3 total) — not 7 (+1 +2 +2 stacked), not 6 (+4)", async () => {
    const game = await equipped();
    await jaxReequip(game, ["brut", "squire"]);
    expect(game.state("brut").attachedTo).toBe("squire");
    expect(game.state("squire")).toMatchObject({ attachments: ["brut"], baseMight: 2, might: 5 });
  });

  test("detachment strips every Brutalizer bonus: Jax moves it Squire → Page, and the Squire drops straight back to its base 2", async () => {
    const game = await equipped();
    await jaxReequip(game, ["brut", "page"]);
    expect(game.state("brut").attachedTo).toBe("page");
    expect(game.state("squire")).toMatchObject({ attachments: [], might: 2, mightModifier: 0 });
    expect(game.state("page").attachments).toEqual(["brut"]);
    expect(game.state("page")).toMatchObject({ baseMight: 2, might: 5 }); // the new bearer is "attached this turn" too
  });

  test("next turn the 'this turn' +2 lapses (Squire reads 3); a Jax re-equip then makes it 'attached this turn' again → back to exactly 5", async () => {
    const game = await equipped();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("squire")).toMatchObject({ attachments: ["brut"], might: 3 });
    await jaxReequip(game, ["brut", "squire"]);
    expect(game.state("brut").attachedTo).toBe("squire");
    expect(game.state("squire").might).toBe(5);
  });
});
