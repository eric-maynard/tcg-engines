/**
 * Ruling 22c85f55f94dc185 — Pack of Wonders (OGN-181 → ogn-181-298) · Gear · [2]
 *     "[Exhaust]: Return another friendly gear, unit, or facedown card to its owner's hand."
 *
 * Q: Does it bounce cards that have the [Hidden] KEYWORD, or cards that are currently face-down?
 * A: Face-down cards. The keyword-style formatting on the card is a printing error: a face-up permanent is
 *    already covered by "gear"/"unit", so the third option has to mean cards hidden at a battlefield — and
 *    that includes a hidden SPELL, which is neither a unit nor gear.
 * Rules: 811 ([Hidden] / facedown cards), 355.10 (choices made on resolution), 323.7.
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const PACK_OF_WONDERS = "ogn-181-298";
const FIGHT_OR_FLIGHT = "ogn-168-298"; // a SPELL with [Hidden] — hidden face-down at bf1
const TIDETURNER = "ogn-199-298"; // a face-up UNIT that prints the [Hidden] keyword

/**
 * P1's main phase. P1 holds bf1 with an Anchor unit (so the facedown card is not swept by control
 * cleanup), a face-down Fight or Flight there, a face-up Tideturner in base, and Pack of Wonders.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor")
    .facedown(P1, "bf1", FIGHT_OR_FLIGHT, "hiddenspell")
    .unit(P1, "base", TIDETURNER, "tideturner")
    .gear(P1, PACK_OF_WONDERS, "pack");
}

describe("Ruling 22c85f55f94dc185 — Pack of Wonders bounces FACE-DOWN cards, not '[Hidden] keyword' cards", () => {
  test("premise: the face-down card is a spell hidden at bf1; the face-up Tideturner merely prints [Hidden]", async () => {
    const game = await board().build();
    expect(game.zoneOf("hiddenspell")).toBe("facedown-bf1");
    expect(game.p1.facedown("bf1")).toContain("hiddenspell");
    expect(game.state("tideturner").keywords).toContain("Hidden");
    expect(game.state("tideturner").isHidden).toBe(false);
  });

  test("ruling: the face-down card is an offered choice for the ability", async () => {
    const game = await board().build();
    const field = game.p1.option("activate", "pack")?.fields.find((f) => f.arg === "targets");
    const options = (field?.options ?? []).map((o) => String(o));
    expect(options).toContain("hiddenspell");
    expect(options).not.toContain("pack"); // "another" excludes itself
  });

  test("…and picking it returns that face-down SPELL to its owner's hand", async () => {
    const game = await board().build();
    await game.p1.activate("pack", 0, { targets: "hiddenspell" });
    await game.settle();
    expect(game.zoneOf("hiddenspell")).toBe("hand");
    expect(game.p1.hand()).toContain("hiddenspell");
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(game.state("pack").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("the face-up Tideturner is a legal choice too — as a UNIT, not because it prints [Hidden]", async () => {
    const game = await board().build();
    await game.p1.activate("pack", 0, { targets: "tideturner" });
    await game.settle();
    expect(game.zoneOf("tideturner")).toBe("hand");
    expect(game.zoneOf("hiddenspell")).toBe("facedown-bf1"); // untouched
  });
});
