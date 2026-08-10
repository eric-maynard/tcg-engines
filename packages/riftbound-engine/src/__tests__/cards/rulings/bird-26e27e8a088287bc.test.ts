/**
 * Ruling 26e27e8a088287bc — Bird token (UNL-T02 → unl-t02) / Friendship (UNL-046 → unl-046-219) · Reaction spell · Calm · [1]
 *     "Choose a unit. Give it +1 [Might] this turn for each of the following tags among your units — Bird, Cat, Dog, and Poro."
 *
 * Q: With zero Poro/Dog/Cat/Bird units, does Friendship give +0 Might?
 * A: Yes — with none of those tags among your units it provides +0.
 * Rules: 359.2 (counted on resolution), "for each" with a count of zero = 0.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FRIENDSHIP = "unl-046-219";
const BIRD_TOKEN = "unl-t02";
const POUTY_PORO = "ogn-013-298"; // Poro tag

describe("Ruling 26e27e8a088287bc — Friendship with no Bird/Cat/Dog/Poro among your units gives +0", () => {
  test("zero matching tags: Friendship is castable, resolves, goes to trash, and the chosen unit's Might is unchanged (+0)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", { might: 3, name: "Plain Recruit" }, "plain")
      .unit(P2, "base", BIRD_TOKEN, "enemyBird") // an OPPONENT's Bird doesn't count ("among your units")
      .hand(P1, FRIENDSHIP, "friend")
      .build();
    expect(game.p1.can("cast", "friend")).toBe(true);
    await game.p1.cast("friend", { targets: "plain" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("friend")).toBe("trash");
    expect(game.state("plain")).toMatchObject({ baseMight: 3, might: 3, mightModifier: 0 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: with a Bird token and a Poro among your units it gives +2 (one per distinct tag present)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", { might: 3, name: "Plain Recruit" }, "plain")
      .unit(P1, "base", BIRD_TOKEN, "bird")
      .unit(P1, "base", BIRD_TOKEN, "bird2") // a second Bird adds nothing — tags are counted once each
      .unit(P1, "base", POUTY_PORO, "poro")
      .hand(P1, FRIENDSHIP, "friend")
      .build();
    await game.p1.cast("friend", { targets: "plain" });
    await game.settle();
    expect(game.state("plain").might).toBe(5);
  });
});
