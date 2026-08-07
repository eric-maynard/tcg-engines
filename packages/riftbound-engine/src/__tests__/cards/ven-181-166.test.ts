/**
 * Gangplank, Naval — ven-181-166 · Unit · Body · 6 energy · 6 Might
 *
 *   [Empower] [body][body]
 *   [Empowered][>] If a spell or ability that chooses me would stun me, give me
 *   -[Might], or return me to hand, give me +3 [Might] instead.
 *
 * "[Empower] [cost]" is an ACTIVATED ability (rule 151.2): paying [body][body]
 * empowers Gangplank, and it may only be paid while he is not already empowered.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const GANGPLANK = "ven-181-166";
const RUNE_PRISON = "ogn-050-298"; // [Action] Stun a unit.
const RETREAT = "ogn-104-298"; // [Reaction] Return a friendly unit to its owner's hand.

function board(body = 4) {
  return scenario()
    .resources(P1, { energy: 0, power: { body } })
    .unit(P1, "base", GANGPLANK, "gp");
}

describe("Gangplank, Naval (ven-181-166)", () => {
  test("[Empower] [body][body] is an activated ability that empowers him for 2 body power", async () => {
    const game = await board().build();
    expect(game.state("gp").isEmpowered).toBeFalsy();
    await game.p1.activate("gp", 0);
    await game.settle();
    expect(game.state("gp").isEmpowered).toBe(true);
    expect(game.p1.power("body")).toBe(2);
  });

  test("not activatable without 2 body power", async () => {
    const game = await board(1).build();
    expect(game.p1.can("activate", "gp")).toBe(false);
  });

  test("already empowered: the ability is no longer offered (restriction not-empowered)", async () => {
    const game = await board().build();
    await game.p1.activate("gp", 0);
    await game.settle();
    expect(game.p1.can("activate", "gp")).toBe(false);
  });

  // rule 366-372 — "[Empowered] If a spell or ability that chooses me would stun me,
  // give me -[Might], or return me to hand, give me +3 [Might] instead."
  test("Empowered — a targeted stun is replaced by +3 Might", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { calm: 1 } })
      .unit(P2, "base", GANGPLANK, "gp", { empowered: true })
      .hand(P1, RUNE_PRISON, "prison")
      .build();
    await game.p1.cast("prison", { targets: "gp" });
    await game.settle();
    expect(game.state("gp").isStunned).toBeFalsy();
    expect(game.state("gp").might).toBe(9);
  });

  test(
    "Empowered — a spell returning me to hand gives +3 Might instead",
    async () => {
      const game = await scenario()
        .resources(P1, { energy: 1 })
        .unit(P1, "base", GANGPLANK, "gp", { empowered: true })
        .hand(P1, RETREAT, "retreat")
        .build();
      await game.p1.cast("retreat", { targets: "gp" });
      await game.settle();
      expect(game.zoneOf("gp")).toBe("base");
      expect(game.state("gp").might).toBe(9);
    },
  );

  test("NOT empowered: a targeted stun still stuns normally", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { calm: 1 } })
      .unit(P2, "base", GANGPLANK, "gp")
      .hand(P1, RUNE_PRISON, "prison")
      .build();
    await game.p1.cast("prison", { targets: "gp" });
    await game.settle();
    expect(game.state("gp").isStunned).toBe(true);
    expect(game.state("gp").might).toBe(6);
  });

  test("an opponent's Gangplank is not activatable by me", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0, power: { body: 4 } })
      .unit(P2, "base", GANGPLANK, "gp")
      .build();
    expect(game.p1.can("activate", "gp")).toBe(false);
  });
});
