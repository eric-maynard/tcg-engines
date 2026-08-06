/**
 * Kayn, Unleashed — ogn-189-298 · Champion Unit (Kayn) · Chaos · 6 energy + [chaos] · 6 Might
 *
 *   [Ganking] (I can move from battlefield to battlefield.)
 *   If I have moved twice this turn, I don't take damage.
 *
 * Rules: 810 (Ganking adds battlefield→battlefield to the Standard Move, which still
 * exhausts), 465.2.c.10 (a unit that can't take damage is never dealt lethal damage and is
 * skipped for mandatory assignment — Kayn is the rulebook's own example), 417 (damage).
 * "Moved" counts any move of this unit (Standard Move or by an effect).
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-189-298";
const RIDE_THE_WIND = "ogn-173-298"; // Action — Move a friendly unit and ready it. (2 + [chaos])
const BOLT3 = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt 3",
  timing: "action",
};

function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", CARD, "kayn")
    .hand(P1, RIDE_THE_WIND, "ride1")
    .hand(P1, RIDE_THE_WIND, "ride2")
    .hand(P1, BOLT3, "bolt");
}

/** Cast Ride the Wind on Kayn and send him to `dest` ("base" | "battlefield-bfX"). */
async function ride(game: Game, spell: string, dest: string) {
  await game.p1.cast(spell, { targets: "kayn" });
  const stop = await game.settle();
  if (stop.reason === "unanswered") {
    await game.p1.pick(dest);
    await game.settle();
  }
}

describe("Kayn, Unleashed (ogn-189-298)", () => {
  test("costs 6 energy + 1 chaos; 6 Might; unaffordable without the chaos or at 5 energy", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { chaos: 1 } }).hand(P1, CARD, "kayn").build();
    await game.p1.play("kayn");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("kayn")).toBe("base");
    expect(game.state("kayn").might).toBe(6);
    expect(game.state("kayn").keywords).toContain("Ganking");
    const noChaos = await scenario().resources(P1, { energy: 7 }).hand(P1, CARD, "kayn").build();
    expect(noChaos.p1.can("play", "kayn")).toBe(false);
    const low = await scenario().resources(P1, { energy: 5, power: { chaos: 1 } }).hand(P1, CARD, "kayn").build();
    expect(low.p1.can("play", "kayn")).toBe(false);
  });

  test("Ganking: Kayn may Standard-Move battlefield → battlefield (and is exhausted by it); a vanilla unit may not", async () => {
    const game = await board().unit(P1, "bf1", { might: 2 }, "plain").build();
    expect(game.p1.can("gank", "kayn")).toBe(true);
    expect(game.p1.can("gank", "plain")).toBe(false);
    await game.p1.gank("kayn", "bf2");
    expect(game.locationOf("kayn")).toBe("bf2");
    expect(game.state("kayn").isExhausted).toBe(true);
  });

  test("moved only once this turn: Kayn takes damage normally", async () => {
    const game = await board().build();
    await game.p1.gank("kayn", "bf2");
    await game.p1.cast("bolt", { targets: "kayn" });
    await game.settle();
    expect(game.state("kayn").damage).toBe(3);
  });

  test.failing("BUG: moved twice this turn (gank + Ride the Wind) → Kayn doesn't take spell damage", async () => {
    // Expected: after a Standard Move bf1→bf2 and an effect move bf2→base, the 3-damage bolt deals 0.
    // Actual: the "moved twice → no damage" clause is not implemented; Kayn takes 3.
    const game = await board().build();
    await game.p1.gank("kayn", "bf2");
    await ride(game, "ride1", "base");
    expect(game.locationOf("kayn")).toBe("base");
    await game.p1.cast("bolt", { targets: "kayn" });
    await game.settle();
    expect(game.zoneOf("kayn")).toBe("base");
    expect(game.state("kayn").damage).toBe(0);
  });

  test.failing("BUG: two effect-moves also count — Ride the Wind twice, then the bolt deals nothing", async () => {
    // Expected: "moved" is any move of Kayn, not just Standard Moves. Actual: takes 3.
    const game = await board().build();
    await ride(game, "ride1", "battlefield-bf2");
    await ride(game, "ride2", "battlefield-bf1");
    expect(game.locationOf("kayn")).toBe("bf1");
    await game.p1.cast("bolt", { targets: "kayn" });
    await game.settle();
    expect(game.state("kayn").damage).toBe(0);
  });

  test.failing("BUG: moved twice → immune in combat too: Kayn (6) into a 6-Might defender kills it and survives to conquer (465.2.c.10)", async () => {
    // Expected: second move (Ride the Wind) carries Kayn into enemy bf3; he deals 6, takes none.
    // Actual: both 6-Might units trade and Kayn goes to the trash.
    const game = await board().battlefield("bf3", { controller: P2 }).unit(P2, "bf3", { might: 6 }, "foe").build();
    await game.p1.gank("kayn", "bf2");
    await ride(game, "ride1", "battlefield-bf3");
    if (game.p1.can("startShowdown")) {
      await game.p1.choose("startShowdown:bf3"); // engine surfaces the pending combat as an option
    }
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("kayn")).toBe("bf3");
    expect(game.gameState.battlefields.bf3?.controller).toBe(P1);
  });

  test("'this turn': two moves last turn give no protection now", async () => {
    const game = await board().build();
    await game.p1.gank("kayn", "bf2");
    await ride(game, "ride1", "base");
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.cast("bolt", { targets: "kayn" });
    await game.settle();
    expect(game.state("kayn").damage).toBe(3);
  });
});
