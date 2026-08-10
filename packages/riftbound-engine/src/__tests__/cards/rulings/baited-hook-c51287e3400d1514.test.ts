/**
 * Ruling c51287e3400d1514 — Baited Hook (OGN-242 → ogn-242-298, Gear) "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards
 *     of your Main Deck. You may banish a unit from among them that has Might up to 1 more than the killed unit and play it, ignoring its
 *     cost. Then recycle the rest."
 *   × Trifarian War Camp (OGN-294 → ogn-294-298, Battlefield) "Units here have +1 [Might]. (This includes attackers.)"
 *
 * Q: Does Baited Hook count the War Camp's +1 when a Recruit (or any unit) standing on the War Camp is the killed unit?
 * A: Yes. Baited Hook uses the Might the unit had at the moment it was killed (its last known Might on the board), not its base Might —
 *    so the War Camp's +1 is included.
 * Rules: 359.3.e.13–14 (last known information), 522 (statics apply continuously while on the board).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const TRIFARIAN_WAR_CAMP = "ogn-294-298";
const RECRUIT = "ogn-272-298"; // 1-Might Recruit unit token

type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * P1's turn with exactly [1][order]; Baited Hook ready. A Recruit token (printed 1) stands at `where`; the War Camp is live and P1's.
 * Deck top →: Three (3), Two (2), Four (4), Junk (spell), One (1).
 */
function board(where: "camp" | "base") {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("camp", { controller: P1, def: TRIFARIAN_WAR_CAMP, inert: false, owner: P1 })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, where, RECRUIT, "recruit")
    .unit(P1, "camp", { might: 6, name: "Camp Holder" }, "holder") // keeps the Camp either way; too big to matter for the ceiling tests
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .deck(
      P1,
      [
        { cardType: "unit", energyCost: 3, might: 3, name: "Three" },
        { cardType: "unit", energyCost: 2, might: 2, name: "Two" },
        { cardType: "unit", energyCost: 4, might: 4, name: "Four" },
        { cardType: "spell", energyCost: 1, name: "Junk" },
        { cardType: "unit", energyCost: 1, might: 1, name: "One" },
      ],
      ["three", "two", "four", "junk", "one"],
    )
    .script(P1, [(d) => (d.kind === "pick" && /target/i.test(d.prompt) && d.options.some((o) => o.key === "recruit") ? "recruit" : undefined)]);
}

/** Activate the Hook killing the Recruit and drive to the look-at-5 offer. */
async function hookRecruit(game: Game): Promise<Pick> {
  const field = game.p1.option("activate", "hook")?.fields.find((f) => f.name === "targets");
  if (field) {
    await game.p1.activate("hook", 0, { targets: "recruit" });
  } else {
    await game.p1.activate("hook");
  }
  await game.settle();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  return d as Pick;
}

const offered = (d: Pick) => d.options.map((o) => o.card ?? o.key).toSorted();

describe("Ruling c51287e3400d1514 — Baited Hook's ceiling uses the killed unit's Might at death, War Camp +1 included", () => {
  test("premise: on Trifarian War Camp the printed-1 Recruit is a 2-Might unit", async () => {
    const game = await board("camp").build();
    expect(game.state("recruit")).toMatchObject({ baseMight: 1, isToken: true, location: "camp", might: 2 });
  });

  test("Recruit killed ON the War Camp: Might at death 2 → ceiling 3 → the look offers Three, Two and One (not Four, not the spell); picking Three plays it for free", async () => {
    const game = await board("camp").build();
    const d = await hookRecruit(game);
    expect(game.has("recruit") && game.zoneOf("recruit") !== "gone").toBe(false); // the token was killed and ceased to exist
    expect(offered(d)).toEqual(["one", "three", "two"]);
    await game.p1.pick("three");
    await game.settle({ policy: "first" });
    await game.settle({ policy: "first" });
    expect(["base", "battlefield-camp"]).toContain(game.zoneOf("three"));
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // "ignoring its cost"
    expect(game.state("hook").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: the same Recruit killed in BASE (no +1): Might at death 1 → ceiling 2 → Three is NOT offered (only Two and One)", async () => {
    const game = await board("base").build();
    expect(game.state("recruit").might).toBe(1);
    const d = await hookRecruit(game);
    expect(offered(d)).toEqual(["one", "two"]);
  });
});
