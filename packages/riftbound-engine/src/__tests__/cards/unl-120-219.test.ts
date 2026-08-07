/**
 * Rengar, Trophy Hunter — unl-120-219 · Unit · Body · 5 energy · 6 might
 *
 *   [Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *   I can be played to a battlefield where there are enemy units (even if you
 *   don't have units there).
 *
 * Rules: 355.2.a (base or a battlefield you control are the default play
 * locations), 355.2 (a card may print extra legal locations — here, any
 * battlefield holding enemy units, whoever controls it), 577.3.c (Ambush),
 * 450 / 190.3.a (a unit arriving at a battlefield its controller does not
 * control makes it Contested).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "unl-120-219";

function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { body: 5 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .hand(P1, CARD, "rengar");
}

const playLocations = (game: { p1: { option: (m: string, c: string) => { fields: { arg?: string; name?: string; options?: unknown }[] } | undefined } }) =>
  (game.p1.option("play", "rengar")?.fields.find((f) => f.arg === "to" || f.name === "to")
    ?.options as string[] | undefined) ?? [];

describe("Rengar, Trophy Hunter (unl-120-219)", () => {
  test("may be played to an enemy battlefield holding enemy units even with no friendly units there", async () => {
    const game = await board().build();
    expect(playLocations(game)).toContain("battlefield-bf1");
    await game.p1.play("rengar", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
  });

  test("a battlefield with no enemy units is not opened up by the permission", async () => {
    const game = await board().build();
    expect(playLocations(game)).not.toContain("battlefield-bf2");
    expect((await game.p1.try((p) => p.play("rengar", { to: "bf2" }))).ok).toBe(false);
  });

  test("base is still a legal destination", async () => {
    const game = await board().build();
    await game.p1.play("rengar", { to: "base" });
    await game.settle();
    expect(game.zoneOf("rengar")).toBe("base");
    expect(game.state("rengar").might).toBe(6);
  });
});
