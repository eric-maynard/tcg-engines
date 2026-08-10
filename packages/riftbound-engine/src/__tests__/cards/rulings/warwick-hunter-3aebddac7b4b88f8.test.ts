/**
 * Ruling 3aebddac7b4b88f8 — Warwick, Hunter (OGN-159 → ogn-159-298) 6+[body], 5 Might "I enter ready. When I attack,
 *   kill all damaged enemy units here."
 *   × Flurry of Blades (OGN-133 → ogn-133-298) [Reaction] · 1 "Deal 1 to all units at battlefields."
 *
 * Q: Warwick attacks (trigger on the chain), Flurry of Blades is played, then Warwick is removed from play (bounced or
 *    killed) before his trigger resolves. Does the ability still trigger?
 * A: It has triggered and it still resolves — but it does nothing, because "here" can no longer be found once Warwick
 *    is off the board.
 * Rules: 376/377 (a triggered ability on the chain is independent of its source), 359.3.e.12 (information about a
 *        source that left the board is null → "here" is nowhere), 359.3.e.6 (impossible instruction ignored).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WARWICK = "ogn-159-298";
const FLURRY_OF_BLADES = "ogn-133-298";

/** Inline P2 [Reaction] "Deal 6 to a unit" — the removal (kills a 5-Might Warwick). */
const BIG_BOLT = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Big Bolt",
  timing: "reaction",
} as const;

/** P1's turn. Ready Warwick in P1's base; P2 holds bf1 with two undamaged 3-Might units. P1: Flurry + 1 energy. P2: Big Bolt + 1 energy. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", WARWICK, "ww")
    .unit(P2, "bf1", { might: 3, name: "Enemy One" }, "e1")
    .unit(P2, "bf1", { might: 3, name: "Enemy Two" }, "e2")
    .hand(P1, FLURRY_OF_BLADES, "flurry")
    .hand(P2, BIG_BOLT, "bolt");
}

const ids = (game: Game) => game.chain().map((c) => `${c.cardId}${c.triggered ? "*" : ""}`);

/** Warwick attacks bf1 (trigger on the chain); P1 answers with Flurry, which resolves: everything at battlefields has 1 damage. */
async function attackAndFlurry(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("ww", "bf1");
  expect(ids(game)).toEqual(["ww*"]); // "When I attack" triggered
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.cast("flurry");
  expect(ids(game)).toEqual(["ww*", "flurry"]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Flurry resolves (LIFO) — Warwick's trigger still waiting
  expect(game.zoneOf("flurry")).toBe("trash");
  expect(game.state("e1").damage).toBe(1);
  expect(game.state("e2").damage).toBe(1);
  expect(game.state("ww").damage).toBe(1);
  expect(ids(game)).toEqual(["ww*"]);
  return game;
}

describe("Ruling 3aebddac7b4b88f8 — Warwick's attack trigger resolves to nothing once Warwick has left the board", () => {
  test("control: nobody removes Warwick → his trigger resolves and kills BOTH damaged enemy units here", async () => {
    const game = await attackAndFlurry();
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves
    expect(game.zoneOf("e1")).toBe("trash");
    expect(game.zoneOf("e2")).toBe("trash");
    await game.settle();
    expect(game.state("ww").zone).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("P2 kills Warwick in response (Big Bolt): the trigger STAYS on the chain and still gets its resolution window …", async () => {
    const game = await attackAndFlurry();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.cast("bolt", { targets: "ww" });
    expect(ids(game)).toEqual(["ww*", "bolt"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Bolt resolves: 1 + 6 on a 5-Might Warwick
    expect(game.zoneOf("ww")).toBe("trash");
    expect(ids(game)).toEqual(["ww*"]); // not removed — abilities on the chain are independent of their source
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("… but on resolution it does nothing: with Warwick gone there is no 'here', so the damaged enemy units survive; the attack fizzles out and P2 keeps bf1", async () => {
    const game = await attackAndFlurry();
    await game.p1.passPriority();
    await game.p2.cast("bolt", { targets: "ww" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Warwick's trigger resolves → no effect
    expect(game.chain()).toEqual([]);
    expect(game.state("e1")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    expect(game.state("e2")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    await game.settle(); // showdown closes with no attacker left
    expect(game.zoneOf("e1")).toBe("battlefield-bf1");
    expect(game.zoneOf("e2")).toBe("battlefield-bf1");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
