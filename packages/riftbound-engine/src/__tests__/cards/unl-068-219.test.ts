/**
 * Spectral Centaur — unl-068-219 · Unit · Mind · 6 energy · 5 Might
 *
 *   When another friendly unit dies, give me +2 [Might] this turn.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  - "another": the Centaur's own death never triggers it; "friendly": enemy deaths never do;
 *    "unit": tokens count (they die, then cease to exist — 186.1), gear does not.
 *  - One trigger PER death: two allies dying simultaneously in one combat damage step put two
 *    separate items on the chain → +4.
 *  - No "here": the Centaur in base is pumped by an ally dying at a battlefield (and vice versa).
 *  - "dies" = killed / lethal damage → trash. Returning to hand (Gust) or recalling is NOT dying.
 *  - Works on the opponent's turn (an ally killed by their spell) and "+2 this turn" then expires
 *    at the end of THAT turn; a pump on your own turn is gone by the opponent's turn.
 *  - "friendly" follows CONTROL (rule 108): a unit P1 controls but P2 owns dying pumps P1's Centaur.
 *  - Board wipe (The Ruination): Centaur dies alongside everyone; it must end in the trash as a
 *    plain 5-Might card (124.1 clears temporary modifications), no dangling chain items.
 * Partner/counter cards: Vengeance ogn-229-298 ("Kill a unit."), Gust ogn-169-298 (Reaction bounce),
 * The Ruination unl-180-219 ("Kill all units.").
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-068-219";
const VENGEANCE = "ogn-229-298";
const GUST = "ogn-169-298";
const RUINATION = "unl-180-219";

function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { order: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", CARD, "cent")
    .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .hand(P1, VENGEANCE, "veng");
}

describe("Spectral Centaur (unl-068-219)", () => {
  test("a friendly unit killed by a spell (at a battlefield, Centaur in base) → trigger on the chain → Centaur 5 → 7 this turn", async () => {
    const game = await board().build();
    await game.p1.cast("veng", { targets: "ally" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Vengeance resolves, ally dies
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cent", controller: P1, triggered: true })]);
    expect(game.state("cent").might).toBe(5); // not yet resolved
    await game.settle();
    expect(game.state("cent").might).toBe(7);
    expect(game.state("cent").baseMight).toBe(5);
    expect(game.violations()).toEqual([]);
  });

  test("'+2 this turn' expires at end of turn", async () => {
    const game = await board().build();
    await game.p1.cast("veng", { targets: "ally" });
    await game.settle();
    expect(game.state("cent").might).toBe(7);
    await game.advanceTurn();
    expect(game.state("cent").might).toBe(5);
  });

  test("an ENEMY unit dying does nothing", async () => {
    const game = await board().build();
    await game.p1.cast("veng", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.state("cent").might).toBe(5);
  });

  test("'another': the Centaur's own death puts nothing on the chain; it rests in the trash as a 5-Might card", async () => {
    const game = await board().build();
    await game.p1.cast("veng", { targets: "cent" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("cent")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("cent").might).toBe(5);
  });

  test("two allies dying simultaneously in combat → two triggers → +4 (Centaur never left base)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "cent")
      .unit(P1, "base", { might: 1, name: "A1" }, "a1")
      .unit(P1, "base", { might: 1, name: "A2" }, "a2")
      .build();
    await game.p1.move(["a1", "a2"], "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus(); // combat damage: both 1-Might attackers die
    expect(game.zoneOf("a1")).toBe("trash");
    expect(game.zoneOf("a2")).toBe("trash");
    expect(game.chain().filter((c) => c.cardId === "cent" && c.triggered)).toHaveLength(2);
    await game.settle();
    expect(game.state("cent").might).toBe(9);
    expect(game.locationOf("cent")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("a friendly unit TOKEN dying counts (then ceases to exist, 186.1)", async () => {
    const game = await board().unit(P1, "base", { might: 1, name: "Recruit" }, "token-recruit-1").build();
    expect(game.state("token-recruit-1").isToken).toBe(true);
    await game.p1.cast("veng", { targets: "token-recruit-1" });
    await game.settle();
    expect(game.has("token-recruit-1")).toBe(false);
    expect(game.state("cent").might).toBe(7);
  });

  test("'friendly' follows control (740.1.a) — a unit P1 controls but P2 owns dying should pump P1's Centaur", async () => {
    // Expected: the stolen unit shares a controller with the Centaur when it dies → trigger → 7.
    // Actual: it dies to P2's trash (correct) but the die-trigger matcher keys on OWNER, so no trigger (stays 5).
    const game = await board()
      .card("stolen", { controller: P1, def: { cardType: "unit", might: 2, name: "Stolen" }, owner: P2, zone: "base" })
      .build();
    expect(game.p1.units()).toContain("stolen");
    await game.p1.cast("veng", { targets: "stolen" });
    await game.settle();
    expect(game.zoneOf("stolen")).toBe("trash");
    expect(game.state("stolen").owner).toBe(P2);
    expect(game.state("cent").might).toBe(7);
  });

  test("returning a friendly unit to hand is not dying — Gust on Ally leaves the Centaur at 5", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", CARD, "cent")
      .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
      .hand(P1, GUST, "gust")
      .build();
    await game.p1.cast("gust", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.chain()).toEqual([]);
    expect(game.state("cent").might).toBe(5);
  });

  test("a standard move / leaving a battlefield is not dying either", async () => {
    const game = await board().build();
    await game.p1.move("ally", "base");
    expect(game.chain()).toEqual([]);
    expect(game.state("cent").might).toBe(5);
  });

  test("triggers on the OPPONENT's turn; the pump lasts until the end of that turn only", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 4, power: { order: 2 } })
      .unit(P1, "base", CARD, "cent")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P2, VENGEANCE, "veng")
      .build();
    await game.p2.cast("veng", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.state("cent").might).toBe(7);
    await game.advanceTurn(); // P2 ends → P1's turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("cent").might).toBe(5);
  });

  test("board wipe: The Ruination kills Centaur together with the ally — everything ends in the trash, chain drains, Centaur is a plain 5", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { order: 3 } })
      .unit(P1, "base", CARD, "cent")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .hand(P1, RUINATION, "ruin")
      .build();
    await game.p1.cast("ruin");
    await game.settle();
    expect(game.zoneOf("cent")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("cent").might).toBe(5);
    expect(game.violations()).toEqual([]);
  });

  test("cost: 6 energy, no power; enters base exhausted at 5 Might; 5 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "cent").build();
    await game.p1.play("cent");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("cent")).toBe("base");
    expect(game.state("cent")).toMatchObject({ baseMight: 5, isExhausted: true, might: 5 });
    expect(game.chain()).toEqual([]); // no play trigger
    expect((await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "cent").build()).p1.can("play", "cent")).toBe(false);
  });

  test("parsed abilities: one 'die' trigger on OTHER friendly units → modify-might +2 to self, duration turn", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 6, might: 5 });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { amount: 2, duration: "turn", target: "self", type: "modify-might" },
      trigger: { event: "die", on: { controller: "friendly", excludeSelf: true, type: "unit" } },
      type: "triggered",
    });
  });
});
