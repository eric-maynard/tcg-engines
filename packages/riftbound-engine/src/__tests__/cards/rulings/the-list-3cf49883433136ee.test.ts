/**
 * Ruling 3cf49883433136ee — The List (UNL-138 → unl-138-219) · Gear · Chaos · 1
 *   "As you play this, name a tag. [Exhaust]: Give a unit with the named tag -2 [Might] this turn."
 *   × Ruin Runner (SFD-105 → sfd-105-221) · 5 Might "I can't be chosen by enemy spells and abilities."
 *
 * Q: Can an enemy use The List's activated ability on Ruin Runner?
 * A: No. Picking "a unit with the named tag" is choosing/targeting that unit; Ruin Runner can't be chosen by enemy
 *    abilities, so it is not a legal recipient (it is not a programmatic "all units with the tag" effect).
 * Rules: 355.5 (selecting a specific object = choosing), "can't be chosen" statics, 762 (naming a tag).
 *
 * Note: printed Ruin Runner carries no tag, so the scenario gives the real Ruin Runner definition a "Poro" tag
 * (everything else — abilities, Might, text — is the printed card) to make the question askable.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../../harness";

const THE_LIST = "unl-138-219";
const RUIN_RUNNER = "sfd-105-221";

async function ruinRunnerWithTag(tag: string) {
  const def = (await loadDefaultCardPool()).get(RUIN_RUNNER);
  expect(def).toMatchObject({ name: "Ruin Runner", rulesText: "I can't be chosen by enemy spells and abilities." });
  return { ...(def as object), cardType: "unit", id: `${RUIN_RUNNER}#${tag.toLowerCase()}`, tags: [tag] };
}

/** P1 plays The List naming "Poro". P2 has Ruin Runner (tagged Poro) and optionally a plain Poro. */
async function listNamingPoro(withPlainPoro: boolean): Promise<Game> {
  let b = scenario()
    .resources(P1, { energy: 1 })
    .unit(P2, "base", await ruinRunnerWithTag("Poro"), "runner")
    .hand(P1, THE_LIST, "list");
  if (withPlainPoro) {
    b = b.unit(P2, "base", { might: 4, name: "Fluffy Poro", tags: ["Poro"] }, "fluffy");
  }
  const game = await b.build();
  await game.p1.play("list");
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "name", seat: P1 });
  await game.p1.name("Poro");
  await game.settle();
  expect(game.state("list").meta.namedTag).toBe("Poro");
  expect(game.state("list").isReady).toBe(true);
  return game;
}

describe("Ruling 3cf49883433136ee — The List's [Exhaust] chooses a unit, so an enemy Ruin Runner is off-limits", () => {
  test("premise: the enemy Ruin Runner carries the named tag and 'can't be chosen by enemy spells and abilities'", async () => {
    const game = await listNamingPoro(true);
    expect(game.state("runner")).toMatchObject({ controller: P2, might: 5, name: "Ruin Runner" });
    expect(game.state("runner").keywords).toContain("Untargetable");
  });

  test("with another enemy Poro available: The List's legal recipients are ONLY that Poro — Ruin Runner is never offered, and forcing it fails", async () => {
    const game = await listNamingPoro(true);
    const targets = (game.p1.option("activate", "list")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).toEqual(["fluffy"]);
    const forced = await game.p1.try((p) => p.activate("list", 1, { targets: "runner" }));
    expect(forced.ok).toBe(false);
    expect(game.state("runner").might).toBe(5);
    // The legal use works as printed on the other Poro (-2 this turn).
    await game.p1.activate("list", 1, { targets: "fluffy" });
    await game.settle();
    expect(game.state("list").isExhausted).toBe(true);
    expect(game.state("fluffy").might).toBe(2);
    expect(game.state("runner").might).toBe(5);
    expect(game.violations()).toEqual([]);
  });

  test("Ruin Runner is the ONLY unit with the named tag: the enemy can't use The List on it at all (no legal activation / no effect)", async () => {
    const game = await listNamingPoro(false);
    const opt = game.p1.option("activate", "list");
    const targets = (opt?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).not.toContain("runner");
    const r = await game.p1.try((p) => p.activate("list", 1, { targets: "runner" }));
    if (r.ok) {
      await game.settle();
      if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
        const d = game.decision();
        expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).not.toContain("runner");
      }
    }
    expect(game.state("runner").might).toBe(5);
    expect(game.state("runner").mightModifier).toBe(0);
  });

  test("contrast — Ruin Runner's OWN controller may choose it: P2's The List naming Poro can give its own Ruin Runner -2", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P2, "base", await ruinRunnerWithTag("Poro"), "runner")
      .unit(P1, "base", { might: 2, name: "Onlooker" }, "onlooker")
      .hand(P2, THE_LIST, "list")
      .build();
    await game.p2.play("list");
    await game.settle();
    await game.p2.name("Poro");
    await game.settle();
    const targets = (game.p2.option("activate", "list")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).toEqual(["runner"]);
    await game.p2.activate("list", 1, { targets: "runner" });
    await game.settle();
    expect(game.state("runner").might).toBe(3);
  });
});
