/**
 * Wizened Elder — ogn-065-298 · Unit · Calm · 4 energy · 4 Might
 *
 *   While I'm buffed, I have an additional +1 [Might].
 *
 * A buff is itself +1 Might, so a buffed Elder is 4 + 1 + 1 = 6.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-065-298";
const SHAMAN = "ogn-147-298"; // When you play me, you may spend a buff to buff me and ready me. (4 energy)

/** Inline "Buff a unit." action spell (1 energy) — keeps the test about the Elder, not the enabler. */
const BUFF_SPELL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "buff" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  name: "Test Blessing",
  timing: "action",
};

function withElder(energy: number) {
  return scenario().resources(P1, { energy }).battlefield("bf1", { controller: P1 }).hand(P1, BUFF_SPELL, "bless");
}

describe("Wizened Elder (ogn-065-298)", () => {
  test("costs 4 energy and enters the base as an unbuffed 4-Might unit; 3 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "elder").build();
    await game.p1.play("elder");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("elder")).toBe("base");
    expect(game.state("elder").isBuffed).toBe(false);
    expect(game.state("elder").might).toBe(4);
    const poor = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "elder").build();
    expect(poor.p1.can("play", "elder")).toBe(false);
  });

  test("gaining a buff takes it from 4 to 6 (4 base + 1 buff + 1 additional)", async () => {
    const game = await withElder(1).unit(P1, "base", CARD, "elder").build();
    expect(game.state("elder").might).toBe(4);
    await game.p1.cast("bless", { targets: "elder" });
    await game.settle();
    expect(game.state("elder").isBuffed).toBe(true);
    expect(game.state("elder").might).toBe(6);
  });

  test("only the Elder's own buff matters — buffing another ally leaves an unbuffed Elder at 4", async () => {
    const game = await withElder(1).unit(P1, "base", CARD, "elder").unit(P1, "base", { might: 2 }, "ally").build();
    await game.p1.cast("bless", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(3);
    expect(game.state("elder").might).toBe(4);
  });

  test("losing the buff (spent by Wildclaw Shaman) drops it straight back to 4", async () => {
    const game = await withElder(5).unit(P1, "base", CARD, "elder").hand(P1, SHAMAN, "shaman").build();
    await game.p1.cast("bless", { targets: "elder" });
    await game.settle();
    expect(game.state("elder").might).toBe(6);
    await game.p1.play("shaman");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
      await game.settle();
    }
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("elder");
      await game.settle();
    }
    expect(game.state("shaman").isBuffed).toBe(true);
    expect(game.state("elder").isBuffed).toBe(false);
    expect(game.state("elder").might).toBe(4);
  });

  test("the extra Might is real in combat: a buffed Elder (6) defending kills a 5-Might attacker and survives", async () => {
    const game = await withElder(1).unit(P1, "bf1", CARD, "elder").unit(P2, "base", { might: 5 }, "raider").build();
    await game.p1.cast("bless", { targets: "elder" });
    await game.settle();
    expect(game.state("elder").might).toBe(6);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // took 6
    expect(game.zoneOf("elder")).toBe("battlefield-bf1"); // took 5 < 6
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  // Expected: a buffed Elder already on the board is 6 Might and survives a 5-Might attacker.
  // Actual: the static +1 is only (re)computed when an effect resolves; the cleanup after a
  // move / before combat damage doesn't evaluate "while" statics, so it fights at 5 and dies.
  test.failing("BUG: 'while buffed' +1 must apply from board state alone (buffed Elder placed in play is 6 Might; rules 364, 519–522)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "elder", { buffed: true })
      .unit(P2, "base", { might: 5 }, "raider")
      .build();
    expect(game.state("elder").isBuffed).toBe(true);
    await game.p2.move("raider", "bf1");
    expect(game.state("elder").might).toBe(6);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("elder")).toBe("battlefield-bf1");
  });
});
