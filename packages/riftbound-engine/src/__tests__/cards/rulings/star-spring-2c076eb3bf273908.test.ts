/**
 * Ruling 2c076eb3bf273908 — Star Spring (UNL-215 → unl-215-219) · Battlefield
 *   "The first time a player plays a non-token unit here each turn, they may move another unit they control
 *    here to its base."
 *
 * Q: Can I choose NOT to trigger Star Spring when I play a non-token unit there?
 * A: Yes — "they may" leads the effect, so the controller is asked at finalization and may simply decline.
 * Rules: 383.3.a / 383.3.a.2 (a leading "you may / they may" is decided at finalization; declining removes the
 *        item and it is considered not to have triggered), 190.6.c (the player who played it makes the choice).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const STAR_SPRING = "unl-215-219";
const SKULKER = "ogn-175-298"; // 3-Might vanilla unit, [3]

/** P1's turn. P1 controls the live Star Spring with an old 2-Might Sentry standing there, and holds a Skulker. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("spring", { controller: P1, def: STAR_SPRING, inert: false })
    .unit(P1, "spring", { might: 2, name: "Sentry" }, "sentry")
    .hand(P1, SKULKER, "skulker");
}

/** Play the Skulker at the Spring; the battlefield's "they may" is now P1's to answer. */
async function playThere(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("skulker", { to: "spring" });
  expect(game.zoneOf("skulker")).toBe("battlefield-spring");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "spring" } });
  return game;
}

describe("Ruling 2c076eb3bf273908 — Star Spring's trigger is a 'they may' the player can decline", () => {
  test("playing a non-token unit there asks P1 a yes/no — it is not forced", async () => {
    const game = await playThere();
    expect(game.decision()?.kind).toBe("yes-no");
  });

  test("ruling: P1 says no — nothing moves, the Sentry stays at the Spring and the chain empties", async () => {
    const game = await playThere();
    await game.p1.no();
    await game.settle();
    expect(game.locationOf("sentry")).toBe("spring");
    expect(game.locationOf("skulker")).toBe("spring");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("saying yes does move a unit home — and never the unit just played ('another')", async () => {
    const game = await playThere();
    await game.p1.yes();
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["sentry"]); // not the Skulker itself
      await game.p1.pick("sentry");
    }
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("base");
    expect(game.locationOf("skulker")).toBe("spring");
  });

  test("it is once per turn: a second non-token unit played there the same turn asks nothing", async () => {
    const game = await board().hand(P1, SKULKER, "skulker2").resources(P1, { energy: 6 }).build();
    await game.p1.play("skulker", { to: "spring" });
    await game.p1.no();
    await game.settle();
    await game.p1.play("skulker2", { to: "spring" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.locationOf("sentry")).toBe("spring");
  });
});
