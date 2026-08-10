/**
 * Ruling 3ea8054a37d6b7ca — The List (UNL-138 → unl-138-219) · Gear · Chaos · 1
 *     "As you play this, name a tag. [Exhaust]: Give a unit with the named tag -2 [Might] this turn."
 *   × Ruin Runner (SFD-105 → sfd-105-221) · 5 Might "I can't be chosen by enemy spells and abilities."
 *
 * Q: Can I use The List on an (enemy) Ruin Runner?
 * A: No. Picking "a unit with the named tag" is a player choice of a specific unit, i.e. targeting — not a
 *    programmatic selection — so Ruin Runner's "can't be chosen by enemy spells and abilities" protects it.
 * Rules: 355.10 / 355.10.d (choosing a specific object = targeting), 757 (can't be chosen).
 *
 * Note: our Ruin Runner data carries no tag, so the enemy Ruin Runner below is the real sfd-105-221 definition
 * (same text/ability) with a "Poro" tag added — otherwise the named-tag filter alone would exclude it and the
 * ruling's point could not be observed.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../../harness";

const THE_LIST = "unl-138-219";
const RUIN_RUNNER = "sfd-105-221";

async function taggedRuinRunner() {
  const def = (await loadDefaultCardPool()).get(RUIN_RUNNER);
  expect(def?.name).toBe("Ruin Runner");
  return { ...(def as Record<string, unknown>), cardType: "unit", id: undefined, tags: ["Poro"] };
}

/** P1's turn: P1 plays The List naming "Poro". P2 has a Poro-tagged Ruin Runner and (optionally) a plain Poro; P1 has a Poro too. */
async function listNamingPoro(withPlainEnemyPoro: boolean): Promise<Game> {
  let b = scenario()
    .resources(P1, { energy: 1 })
    .unit(P2, "base", await taggedRuinRunner(), "runner")
    .unit(P1, "base", { might: 4, name: "Friendly Poro", tags: ["Poro"] }, "mine")
    .hand(P1, THE_LIST, "list");
  if (withPlainEnemyPoro) {
    b = b.unit(P2, "base", { might: 4, name: "Plain Enemy Poro", tags: ["Poro"] }, "plain");
  }
  const game = await b.build();
  expect(game.state("runner")).toMatchObject({ controller: P2, might: 5, name: "Ruin Runner" });
  expect(game.state("runner").keywords).toContain("Untargetable"); // "I can't be chosen by enemy spells and abilities"
  await game.p1.play("list");
  await game.settle();
  // "As you play this, name a tag" — P1 names it.
  expect(game.decision()).toMatchObject({ kind: "name", seat: P1 });
  await game.p1.name("Poro");
  await game.settle();
  expect(game.state("list").meta.namedTag).toBe("Poro");
  expect(game.zoneOf("list")).toBe("base");
  return game;
}

const listTargets = (game: Game) =>
  ((game.p1.option("activate", "list")?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][]).flat().toSorted();

describe("Ruling 3ea8054a37d6b7ca — The List's [Exhaust] chooses (targets) a unit, so it cannot pick an enemy Ruin Runner", () => {
  test("the [Exhaust] ability offers every Poro-tagged unit EXCEPT the enemy Ruin Runner", async () => {
    const game = await listNamingPoro(true);
    expect(game.p1.can("activate", "list")).toBe(true);
    expect(listTargets(game)).toEqual(["mine", "plain"]); // runner is Poro-tagged too, but can't be chosen
    const r = await game.p1.try((p) => p.activate("list", 1, { targets: "runner" }));
    expect(r.ok).toBe(false);
    expect(game.state("runner").might).toBe(5);
    expect(game.state("list").isExhausted).toBe(false); // nothing was activated
  });

  test("it works normally on an unprotected enemy Poro: -2 [Might] this turn and The List exhausts", async () => {
    const game = await listNamingPoro(true);
    await game.p1.activate("list", 1, { targets: "plain" });
    expect(game.state("list").isExhausted).toBe(true);
    await game.settle();
    expect(game.state("plain").might).toBe(2);
    expect(game.state("runner").might).toBe(5);
  });

  test("the protection is against ENEMY choosers only: Ruin Runner's own controller could List it", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P2, "base", await taggedRuinRunner(), "runner")
      .hand(P2, THE_LIST, "list")
      .build();
    await game.p2.play("list");
    await game.settle();
    await game.p2.name("Poro");
    await game.settle();
    const offered = ((game.p2.option("activate", "list")?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][]).flat();
    expect(offered).toEqual(["runner"]);
    await game.p2.activate("list", 1, { targets: "runner" });
    await game.settle();
    expect(game.state("runner").might).toBe(3);
  });
});
