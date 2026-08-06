/**
 * Fiora, Victorious — ogn-232-298 · Champion Unit (Fiora) · Order · 4 energy · 4 Might
 *
 *   While I'm [Mighty], I have [Deflect], [Ganking], and [Shield].
 *   (I'm Mighty while I have 5+ [Might].)
 *
 * Rules: 708 (Mighty = Might ≥ 5), 476.3 (uses this very card: a buff makes her 5 Might and
 * turns the three keywords on; losing it turns them off), 809 (Deflect), 810 (Ganking),
 * 814.1.c (Shield = +1 Might while defending).
 *
 * Harness note: the static layer is re-evaluated on engine actions, so Fiora is buffed through
 * a real (inline, free) buff spell rather than the `buffed` placement meta.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-232-298";
const GRANTED = ["Deflect", "Ganking", "Shield"];
const BUFF = {
  abilities: [{ effect: { target: { type: "unit" }, type: "buff" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 0,
  name: "Test Buff",
  timing: "action",
};
const BOLT = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

/** On P1's turn, buff Fiora (→ 5 Might, Mighty) with the free inline spell aliased "buff". */
async function buffFiora(game: Game) {
  await game.p1.cast("buff", { targets: "fiora" });
  await game.settle();
  expect(game.state("fiora").might).toBe(5);
}

describe("Fiora, Victorious (ogn-232-298)", () => {
  test("cost: 4 energy (no power) for a 4-Might unit that is NOT Mighty and has none of the keywords", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "fiora").build();
    await game.p1.play("fiora");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("fiora")).toBe("base");
    expect(game.state("fiora").might).toBe(4);
    for (const k of GRANTED) {
      expect(game.state("fiora").keywords).not.toContain(k);
    }
    const poor = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "fiora").build();
    expect(poor.p1.can("play", "fiora")).toBe(false);
  });

  test("while Mighty (buffed to 5 Might) she has Deflect, Ganking and Shield (476.3)", async () => {
    const game = await scenario().unit(P1, "base", CARD, "fiora").hand(P1, BUFF, "buff").build();
    for (const k of GRANTED) {
      expect(game.state("fiora").keywords).not.toContain(k);
    }
    await buffFiora(game);
    expect(game.state("fiora").isBuffed).toBe(true);
    expect(game.state("fiora").keywords).toEqual(expect.arrayContaining(GRANTED));
    // Still there next turn — the buff (and so Mighty) is permanent.
    await game.advanceTurn();
    expect(game.state("fiora").keywords).toEqual(expect.arrayContaining(GRANTED));
  });

  test("Ganking is live only while Mighty: unbuffed she may not move battlefield → battlefield, buffed she may", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 1 }, "h2")
      .unit(P1, "bf1", CARD, "fiora")
      .hand(P1, BUFF, "buff")
      .build();
    expect(game.p1.can("gank", "fiora")).toBe(false);
    await buffFiora(game);
    expect(game.p1.can("gank", "fiora")).toBe(true);
    await game.p1.gank("fiora", "bf2");
    expect(game.locationOf("fiora")).toBe("bf2");
  });

  test("Deflect is live only while Mighty: an opponent needs a spare power to target buffed Fiora, none for a 4-Might Fiora", async () => {
    const mighty = await scenario().unit(P1, "base", CARD, "fiora").hand(P1, BUFF, "buff").hand(P2, BOLT, "bolt").build();
    await buffFiora(mighty);
    await mighty.advanceTurn();
    await mighty.p2.do("addResources", { energy: 1 });
    const r = await mighty.p2.try((p) => p.cast("bolt", { targets: "fiora" }));
    expect(r.ok).toBe(false);
    await mighty.p2.do("addResources", { power: { fury: 1 } });
    await mighty.p2.cast("bolt", { targets: "fiora" });
    expect(mighty.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });

    const meek = await scenario().active(P2).resources(P2, { energy: 1 }).unit(P1, "base", CARD, "fiora").hand(P2, BOLT, "bolt").build();
    await meek.p2.cast("bolt", { targets: "fiora" });
    expect(meek.p2.energy()).toBe(0);
  });

  test("Shield is live while Mighty: defending, buffed Fiora is 6 Might — a 5-Might attacker dies and she survives holding the battlefield", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "fiora")
      .unit(P2, "base", { might: 5, name: "Bruiser" }, "bruiser")
      .hand(P1, BUFF, "buff")
      .build();
    await buffFiora(game);
    await game.advanceTurn();
    await game.p2.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("trash"); // took 5 ≥ 5
    expect(game.locationOf("fiora")).toBe("bf1"); // took 5 < 4+1+1
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("control: an unbuffed (4-Might) Fiora has no Shield — a 4-Might attacker trades with her", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "fiora")
      .unit(P2, "base", { might: 4, name: "Bruiser" }, "bruiser")
      .build();
    await game.p2.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.zoneOf("fiora")).toBe("trash");
  });
});
