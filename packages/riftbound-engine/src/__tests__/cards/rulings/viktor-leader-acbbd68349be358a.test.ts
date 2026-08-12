/**
 * Ruling acbbd68349be358a — Viktor, Leader (OGN-246 → ogn-246-298) · Unit · [4][order] · 4 Might
 *   "When another non-Recruit unit you control dies, play a 1 [Might] Recruit unit token into your base."
 *   × The Ruination (UNL-180 → unl-180-219) · Spell · [9][order][order][order] · "Kill all units." (the
 *     "kill 2 units" the question asks about — one effect killing Viktor and his neighbour at once).
 *
 * Q: Viktor and another non-token unit are killed simultaneously by one effect — does Viktor's death trigger fire?
 * A: No. Units killed simultaneously do not see each other die: the trigger would look for a death while Viktor
 *    is on the board, and Viktor is already dead at that moment. No Recruit token is made.
 * Rules: 411 / 383 (triggers look at the board after the event), 370–373 + Cleanup (a single kill batch is one event).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VIKTOR_LEADER = "ogn-246-298";
const THE_RUINATION = "unl-180-219";
const VENGEANCE = "ogn-229-298"; // Spell [4][order][order] "Kill a unit."

/** P2 fields Viktor plus one vanilla ally at bf1; P1 holds the sweeper. */
function viktorAndFriend(spell: string) {
  return scenario()
    .resources(P1, { energy: 9, power: { order: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", VIKTOR_LEADER, "viktor")
    .unit(P2, "bf1", { might: 2, name: "Loyalist" }, "friend")
    .hand(P1, spell, "spell");
}

const recruitsInBase = (game: Awaited<ReturnType<ReturnType<typeof viktorAndFriend>["build"]>>) =>
  game.p2.units("base").filter((id) => game.state(id).name === "Recruit");

describe("Ruling acbbd68349be358a — Viktor does not trigger off a death simultaneous with his own", () => {
  test("one effect kills Viktor and his ally together: both hit the trash and NO Recruit token appears", async () => {
    const game = await viktorAndFriend(THE_RUINATION).build();
    expect(game.p2.units("base")).toEqual([]);
    await game.p1.cast("spell");
    await game.settle();
    expect(game.zoneOf("viktor")).toBe("trash");
    expect(game.zoneOf("friend")).toBe("trash");
    expect(recruitsInBase(game)).toEqual([]);
    expect(game.p2.units("base")).toEqual([]);
    expect(game.chain()).toEqual([]); // the trigger never went on the chain either
    expect(game.violations()).toEqual([]);
  });

  test("control — the same ally dying ALONE while Viktor lives does trigger him: one Recruit token in P2's base", async () => {
    const game = await viktorAndFriend(VENGEANCE).build();
    await game.p1.cast("spell", { targets: "friend" });
    await game.settle();
    expect(game.zoneOf("friend")).toBe("trash");
    expect(game.zoneOf("viktor")).toBe("battlefield-bf1"); // still alive to see it
    expect(recruitsInBase(game)).toHaveLength(1);
    expect(game.state(recruitsInBase(game)[0]!).might).toBe(1);
  });

  test("control — Viktor dying alone triggers nothing either (the trigger is about ANOTHER unit)", async () => {
    const game = await viktorAndFriend(VENGEANCE).build();
    await game.p1.cast("spell", { targets: "viktor" });
    await game.settle();
    expect(game.zoneOf("viktor")).toBe("trash");
    expect(game.zoneOf("friend")).toBe("battlefield-bf1");
    expect(recruitsInBase(game)).toEqual([]);
  });
});
