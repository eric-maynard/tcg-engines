/**
 * Plundering Poro — sfd-069-221 · Unit · Mind · 2 energy (no power) · 2 Might · Poro
 *
 *   When I conquer, play a Gold gear token exhausted.
 *
 * Rules: 469.1 / 383.4.c (Conquer = gain control of a battlefield you have not scored this turn;
 * Conquer Effects trigger only for units PRESENT at that battlefield), 383.4.c.2.c (if the conquer
 * point is replaced the effect still triggers), 471.1.b (at Victory−1 a conquer draws instead of
 * scoring unless every battlefield was scored this turn), 466.3 (winning a combat as the defender is
 * not conquering), 187.5 (Gold = domainless gear token with "[Reaction] Kill this, [Exhaust]: [Add]
 * [rainbow]"), 184.1 (token may be created exhausted).
 *
 * Judge's corner — trickiest situations for this card:
 *  - "When I conquer" needs the Poro itself at the conquered battlefield: an ally conquering
 *    elsewhere gives nothing; Poro + ally together give exactly ONE token; two Poros give two.
 *  - Win ≠ conquer: defending successfully, a No-Result combat (attacker recalled) or dying in the
 *    attack all give nothing. Holding next turn is not conquering either.
 *  - Final-point replacement (7/8, two battlefields): the point becomes a draw, the Gold still comes.
 *  - The token is a real Gold gear: enters EXHAUSTED, and once ready can be cashed for [rainbow].
 *  - The printed Poro tag matters to partners (Poro Herder).
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-069-221";
const PORO_HERDER = "ogn-061-298"; // When you play me, if you control a Poro, buff me and draw 1.

const goldOf = (game: Game, seat: "p1" | "p2") => game[seat].base().filter((id) => game.state(id).name === "Gold");

function attackInto(defender?: { might: number; stunned?: boolean }) {
  const b = scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "poro");
  if (defender) {
    b.unit(P2, "bf1", { might: defender.might, name: "Defender" }, "def", defender.stunned ? { stunned: true } : undefined);
  }
  return b;
}

describe("Plundering Poro (sfd-069-221)", () => {
  test("cost: 2 energy, no power; a 2-Might unit that enters exhausted; unaffordable at 1 energy", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "poro").build();
    await game.p1.play("poro");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.state("poro")).toMatchObject({ baseMight: 2, isExhausted: true, might: 2 });
    const poor = await scenario().resources(P1, { energy: 1, power: { mind: 2 } }).hand(P1, CARD, "poro").build();
    expect(poor.p1.can("play", "poro")).toBe(false);
  });

  test("conquering an empty enemy battlefield: 1 point and ONE Gold gear token in base, exhausted, owned by P1", async () => {
    const game = await attackInto().build();
    expect(goldOf(game, "p1")).toHaveLength(0);
    await game.p1.move("poro", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.locationOf("poro")).toBe("bf1");
    const gold = goldOf(game, "p1");
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string)).toMatchObject({ cardType: "gear", isExhausted: true, isToken: true, name: "Gold", owner: P1 });
    expect(goldOf(game, "p2")).toHaveLength(0);
    expect(game.chain()).toEqual([]);
  });

  test("conquering through combat (2 into a 1-Might defender) also pays out", async () => {
    const game = await attackInto({ might: 1 }).build();
    await game.p1.move("poro", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(goldOf(game, "p1")).toHaveLength(1);
  });

  test("dying in the attack (2 into 3) conquers nothing: no token, no point", async () => {
    const game = await attackInto({ might: 3 }).build();
    await game.p1.move("poro", "bf1");
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(goldOf(game, "p1")).toHaveLength(0);
  });

  test("No Result (stunned 3-Might defender survives, Poro survives and is recalled): no conquer, no token", async () => {
    const game = await attackInto({ might: 3, stunned: true }).build();
    await game.p1.move("poro", "bf1");
    await game.settle();
    expect(game.locationOf("poro")).toBe("base");
    expect(game.locationOf("def")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(goldOf(game, "p1")).toHaveLength(0);
  });

  test("'When I conquer' — an ally conquering while the Poro stays home gives the point but no Gold (383.4.c.2)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "poro")
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .build();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(goldOf(game, "p1")).toHaveLength(0);
  });

  test("Poro + ally conquer together → exactly one token; two Poros together → two tokens", async () => {
    const one = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "poro")
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .build();
    await one.p1.move(["poro", "ally"], "bf1");
    await one.settle();
    expect(one.p1.points()).toBe(1);
    expect(goldOf(one, "p1")).toHaveLength(1);

    const two = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "poroA")
      .unit(P1, "base", CARD, "poroB")
      .build();
    await two.p1.move(["poroA", "poroB"], "bf1");
    await two.settle();
    expect(two.p1.points()).toBe(1); // one conquer
    expect(goldOf(two, "p1")).toHaveLength(2); // two conquer effects
  });

  test("winning as the DEFENDER is not conquering: the attacker dies, the Poro's side keeps bf1, no token", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "poro")
      .unit(P1, "bf1", { might: 3, name: "Wall" }, "wall")
      .unit(P2, "base", { might: 1, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(goldOf(game, "p1")).toHaveLength(0);
    expect(goldOf(game, "p2")).toHaveLength(0);
  });

  test("holding is not conquering: Poro holding bf1 at the start of your turn scores 1 but plays no token", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "poro").build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(goldOf(game, "p1")).toHaveLength(0);
  });

  test("final-point rule (471.1.b): at 7/8 with an unscored second battlefield the conquer draws instead — but the Gold still comes (383.4.c.2.c)", async () => {
    const game = await scenario()
      .points(P1, 7)
      .victoryScore(8)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", CARD, "poro")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("poro", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(goldOf(game, "p1")).toHaveLength(1);
  });

  test("the token is a real Gold gear (187.5): exhausted now, ready after your next Awaken, then 'Kill this, [Exhaust]: [Add] [rainbow]'", async () => {
    const game = await attackInto().build();
    await game.p1.move("poro", "bf1");
    await game.settle();
    const gold = goldOf(game, "p1")[0] as string;
    expect(game.state(gold).isExhausted).toBe(true);
    expect(game.p1.can("activate", gold)).toBe(false); // [Exhaust] cost unpayable while exhausted
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state(gold).isReady).toBe(true);
    expect(game.p1.power("rainbow")).toBe(0);
    await game.p1.activate(gold);
    await game.settle();
    expect(game.has(gold) && game.zoneOf(gold) === "base").toBe(false); // killed (a token ceases to exist off-board)
    expect(game.p1.power("rainbow")).toBe(1);
  });

  test("printed Poro tag: Poro Herder played beside Plundering Poro gets its buff and draw", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .unit(P1, "base", CARD, "poro")
      .hand(P1, PORO_HERDER, "herder")
      .build();
    await game.p1.play("herder");
    await game.settle();
    expect(game.state("herder").isBuffed).toBe(true);
    expect(game.state("herder").might).toBe(4);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.state("poro").isBuffed).toBe(false);
  });

  test("parsed ability shape: one self-conquer trigger creating an exhausted Gold gear token; Poro tag present", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 2, might: 2, tags: ["Poro"] });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" },
      trigger: { event: "conquer", on: "self" },
      type: "triggered",
    });
    expect((def?.abilities?.[0] as { optional?: boolean }).optional).not.toBe(true);
  });
});
