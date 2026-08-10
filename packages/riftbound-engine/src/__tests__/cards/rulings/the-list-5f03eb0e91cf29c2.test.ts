/**
 * Ruling 5f03eb0e91cf29c2 — The List (UNL-138 → unl-138-219) · Gear · Chaos · [1]
 *     "As you play this, name a tag. [Exhaust]: Give a unit with the named tag -2 [Might] this turn."
 *   × Heimerdinger, Inventor (OGN-111 → ogn-111-298) · Champion Unit · Mind · [3][mind] · 3 Might
 *     "I have all [Exhaust] abilities of all friendly legends, units, and gear."
 *   (+ Ravenborn Tome ogn-032-298 "[Exhaust]: The next spell you play this turn deals 1 Bonus Damage." as a control gear.)
 *
 * Q: The List named "Poro". If I activate Heimerdinger using The List's ability, can I shrink a Poro?
 * A: No. The [Exhaust] ability is linked to the "name a tag" text; Heimerdinger copies only the activated part, so for
 *    HIS copy "the named tag" is undefined and there is no legal unit to choose.
 * Rules: 359.3.e.14 / linked abilities, 762 (naming), Heimerdinger copies abilities not card state.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_LIST = "unl-138-219";
const HEIMERDINGER = "ogn-111-298";
const RAVENBORN_TOME = "ogn-032-298";

/** P1: Heimerdinger (ready) + Ravenborn Tome in base, The List in hand with exactly [1]. P2: a 4-Might Poro and a 4-Might non-Poro in base. */
async function listNamedPoro(): Promise<Game> {
  const game = await scenario()
    .resources(P1, { energy: 1 })
    .unit(P1, "base", HEIMERDINGER, "heimer")
    .gear(P1, RAVENBORN_TOME, "tome")
    .unit(P2, "base", { might: 4, name: "Fluffy Poro", tags: ["Poro"] }, "poro")
    .unit(P2, "base", { might: 4, name: "Plain Grunt" }, "grunt")
    .hand(P1, THE_LIST, "list")
    .build();
  await game.p1.play("list");
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "name", seat: P1 });
  await game.p1.name("Poro");
  await game.settle();
  expect(game.state("list").meta.namedTag).toBe("Poro");
  expect(game.state("list").isReady).toBe(true);
  expect(game.state("heimer").isReady).toBe(true);
  return game;
}

/** Source cards behind Heimerdinger's inherited activate options. */
function heimerSources(game: Game): string[] {
  return game.p1
    .legal()
    .filter((o) => o.moveId === "activateAbility" && o.card === "heimer")
    .flatMap((o) => o.variants.map((v) => String(v.params.sourceCardId)));
}

/** Every unit Heimerdinger could aim an inherited List activation at (empty when the option does not exist). */
function heimerListTargets(game: Game): string[] {
  return game.p1
    .legal()
    .filter((o) => o.moveId === "activateAbility" && o.card === "heimer")
    .flatMap((o) => o.variants.filter((v) => v.params.sourceCardId === "list").flatMap((v) => (v.params.targets as string[] | undefined) ?? []));
}

describe("Ruling 5f03eb0e91cf29c2 — Heimerdinger's copy of The List's [Exhaust] has no 'named tag' and so no legal target", () => {
  test("premise: The List itself (which named Poro) CAN be exhausted at the Poro — its own ability offers exactly the Poro and gives it -2", async () => {
    const game = await listNamedPoro();
    const targets = (game.p1.option("activate", "list")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).toEqual(["poro"]);
    await game.p1.activate("list", 1, { targets: "poro" });
    await game.settle();
    expect(game.state("list").isExhausted).toBe(true);
    expect(game.state("poro").might).toBe(2);
    expect(game.state("grunt").might).toBe(4);
  });

  test("control: Heimerdinger does inherit friendly gear [Exhaust] abilities here — the Tome's ability is on his menu", async () => {
    const game = await listNamedPoro();
    expect(heimerSources(game)).toContain("tome");
  });

  test("ruling: activating HEIMERDINGER with The List's ability cannot pick the Poro — no Poro (or any unit) is a legal recipient of his copy, forcing it fails, and the Poro keeps 4 Might with Heimerdinger still ready", async () => {
    const game = await listNamedPoro();
    expect(heimerListTargets(game)).not.toContain("poro");
    expect(heimerListTargets(game)).toEqual([]);
    const forced = await game.p1.try((p) => p.activate("heimer", 0, { source: "list", targets: "poro" }));
    if (forced.ok) {
      // If the engine let the activation through, it must at least not find the Poro on resolution.
      await game.settle();
      const d = game.decision();
      expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).not.toContain("poro");
    } else {
      expect(forced.ok).toBe(false);
    }
    expect(game.state("poro")).toMatchObject({ might: 4, mightModifier: 0 });
    expect(game.state("heimer").isReady).toBe(true);
    expect(game.state("list").isReady).toBe(true); // The List itself was not used either
    expect(game.violations()).toEqual([]);
  });
});
