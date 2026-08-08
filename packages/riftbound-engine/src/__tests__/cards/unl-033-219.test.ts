/**
 * Frisky Hunter — unl-033-219 · Unit · Calm · 4 energy · 3 might
 *
 *   When you play me, play a 1 [Might] Bird unit token with [Deflect] here.
 *   (Opponents must pay [rainbow] to choose it with a spell or ability.)
 *
 * Rules: 187.7 (a 1 [M] Bird token = domainless unit token, Bird tag, Deflect), 809.1.c/.c.1
 * (Deflect = opponents' spells/abilities that choose it cost 1 more power of ANY domain; the
 * controller's own effects are untaxed), 184–186 (tokens are real units while on the board and
 * cease to exist when they leave it — they never reach the trash), 359.2.d / 421 (played units,
 * tokens included, enter exhausted unless told "ready"), 383.4.a ("When you play me" is a play
 * trigger that goes on the chain — a unit that merely arrives/moves does not "play").
 *
 * Head-judge corner cases for THIS card:
 *   1. "here" follows where Frisky Hunter was played: base → Bird in base; a controlled battlefield
 *      → Bird at THAT battlefield (and nowhere else).
 *   2. The Bird is a separate exhausted 1-Might unit token: it counts among your units there, has
 *      no cost/domain, and when it dies it ceases to exist (not in any trash).
 *   3. Deflect taxes only OPPONENTS: P2's 0-cost spell cannot pick the Bird with an empty power
 *      pool, can with 1 power of an unrelated domain (and pays it); P1's own spell picks it free;
 *      Frisky Hunter itself carries no Deflect.
 *   4. Play trigger only: a Frisky Hunter placed on the board, or moved to a battlefield, makes no
 *      Bird. The trigger is a chain item P2 may respond to before the Bird exists.
 *   5. Cost edge: exactly 4 energy, no power; 3 energy is not enough.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-033-219";
/** 0-cost Reaction "deal 1 to a unit" — isolates the Deflect tax from any printed cost. */
const PING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Ping",
  timing: "reaction",
} as const;

const birds = (game: Game, seat: "p1" | "p2" = "p1", at?: "base" | "bf1") =>
  game[seat].units(at).filter((id) => game.state(id).name === "Bird");

function ready() {
  return scenario()
    .resources(P1, { energy: 4 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .hand(P1, CARD, "fh");
}

describe("Frisky Hunter (unl-033-219)", () => {
  test("registry payload: one play-self trigger that creates a 1-Might Bird unit token with Deflect 'here'; 4-cost 3-might Calm unit, no power cost", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 4, might: 3, name: "Frisky Hunter" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      {
        effect: { location: "here", token: { keywords: ["Deflect"], might: 1, name: "Bird", type: "unit" }, type: "create-token" },
        trigger: { event: "play-self" },
        type: "triggered",
      },
    ]);
  });

  test("cost: exactly 4 energy; enters the base exhausted as a 3-Might unit; 3 energy is not enough; not playable on the opponent's turn", async () => {
    const game = await ready().build();
    await game.p1.play("fh", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("fh")).toBe("base");
    expect(game.state("fh")).toMatchObject({ baseMight: 3, isExhausted: true, might: 3 });
    expect(game.state("fh").keywords).not.toContain("Deflect");
    expect((await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "fh").build()).p1.can("play", "fh")).toBe(false);
    expect((await ready().active(P2).build()).p1.can("play", "fh")).toBe(false);
  });

  test("played to base: the play trigger goes on the chain, then exactly one exhausted 1-Might Bird token with Deflect appears in P1's base (none at bf1)", async () => {
    const game = await ready().build();
    await game.p1.play("fh", { to: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fh", controller: P1, triggered: true })]);
    expect(birds(game)).toHaveLength(0); // not before the trigger resolves
    await game.settle();
    expect(game.chain()).toHaveLength(0);
    const [bird] = birds(game, "p1", "base");
    expect(birds(game)).toHaveLength(1);
    expect(bird).toBeDefined();
    expect(game.state(bird!)).toMatchObject({ baseMight: 1, cardType: "unit", controller: P1, energyCost: 0, isExhausted: true, isToken: true, might: 1, owner: P1 });
    expect(game.state(bird!).keywords).toContain("Deflect");
    expect(game.state(bird!).domains).toEqual([]);
    expect(game.state(bird!).powerCost).toEqual([]);
    expect(birds(game, "p1", "bf1")).toHaveLength(0);
    expect(game.violations()).toEqual([]);
  });

  test("'here' — played to a battlefield you control: the Bird is created at THAT battlefield, not in base", async () => {
    const game = await ready().build();
    await game.p1.play("fh", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("fh")).toBe("bf1");
    expect(birds(game, "p1", "bf1")).toHaveLength(1);
    expect(birds(game, "p1", "base")).toHaveLength(0);
    expect(game.p1.units("bf1")).toHaveLength(3); // Holder + Frisky Hunter + Bird
  });

  test("the trigger is a real chain item: P2 gets priority and may respond before the Bird exists", async () => {
    const game = await ready().resources(P2, { energy: 0 }).hand(P2, PING, "ping").build();
    await game.p1.play("fh", { to: "base" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(birds(game)).toHaveLength(0);
    await game.p2.cast("ping", { targets: "fh" }); // Frisky Hunter itself has no Deflect → free
    expect(game.chain().map((i) => i.cardId)).toEqual(["fh", "ping"]);
    await game.settle();
    expect(game.state("fh").damage).toBe(1);
    expect(birds(game)).toHaveLength(1);
  });

  test("Deflect on the Bird taxes OPPONENTS: on P2's turn a 0-cost spell cannot choose it with an empty power pool; with 1 power of any domain it can, and that power is spent", async () => {
    const game = await ready().hand(P2, PING, "ping").hand(P2, PING, "ping2").build();
    await game.p1.play("fh", { to: "base" });
    await game.settle();
    const [bird] = birds(game);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    const denied = await game.p2.try((p) => p.cast("ping", { targets: bird! }));
    expect(denied.ok).toBe(false);
    expect(game.zoneOf("ping")).toBe("hand");
    // Frisky Hunter itself is untaxed.
    await game.p2.cast("ping2", { targets: "fh" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    // 809.1.c.1: any domain pays the Deflect cost — a mind power for a fury spell on a domainless Bird.
    await game.p2.do("addResources", { power: { mind: 1 } });
    await game.p2.cast("ping", { targets: bird! });
    expect(game.p2.power("mind")).toBe(0);
    await game.settle();
    expect(game.has(bird!)).toBe(false); // 1 damage kills the 1-Might Bird
  });

  test("Deflect does not tax the controller: P1's own 0-cost spell picks the Bird for free; the dead token ceases to exist (no trash entry)", async () => {
    const game = await ready().hand(P1, PING, "ping").build();
    await game.p1.play("fh", { to: "base" });
    await game.settle();
    const [bird] = birds(game);
    await game.p1.cast("ping", { targets: bird! });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.has(bird!)).toBe(false);
    expect(game.p1.trash()).toEqual(["ping"]);
    expect(game.zoneOf("fh")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("negative space: a Frisky Hunter that is merely on the board, or that MOVES to a battlefield, creates no Bird (play trigger only)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "fh", { exhausted: false })
      .build();
    expect(birds(game)).toHaveLength(0);
    await game.p1.move("fh", "bf1");
    await game.settle();
    expect(game.locationOf("fh")).toBe("bf1");
    expect(birds(game)).toHaveLength(0);
    expect(game.chain()).toHaveLength(0);
  });

  test("two Frisky Hunters → two separate Bird tokens, each where its Hunter was played", async () => {
    const game = await ready().resources(P1, { energy: 8 }).hand(P1, CARD, "fh2").build();
    await game.p1.play("fh", { to: "base" });
    await game.settle();
    await game.p1.play("fh2", { to: "bf1" });
    await game.settle();
    expect(birds(game, "p1", "base")).toHaveLength(1);
    expect(birds(game, "p1", "bf1")).toHaveLength(1);
    expect(game.p1.energy()).toBe(0);
  });

  test("the Bird is a real defender: next turn a 4-Might Raider into Frisky Hunter(3)+Bird(1) takes 4 and dies (no conquer) — whereas against Frisky Hunter alone it survives and conquers", async () => {
    const withBird = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P1 })
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .hand(P1, CARD, "fh")
      .build();
    await withBird.p1.play("fh", { to: "bf1" });
    await withBird.settle();
    expect(withBird.p1.units("bf1")).toHaveLength(2);
    await withBird.advanceTurn();
    await withBird.p2.move("raider", "bf1");
    await withBird.settle();
    expect(withBird.zoneOf("raider")).toBe("trash"); // 3 + 1 = 4 damage back
    expect(withBird.zoneOf("fh")).toBe("trash"); // Raider's 4 covers FH(3) + Bird(1)
    expect(birds(withBird, "p1", "bf1")).toHaveLength(0);
    expect(withBird.p2.points()).toBe(0);
    expect(withBird.gameState.battlefields.bf1?.controller).not.toBe(P2);

    const alone = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "fh")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await alone.p2.move("raider", "bf1");
    await alone.settle();
    expect(alone.zoneOf("fh")).toBe("trash");
    expect(alone.locationOf("raider")).toBe("bf1");
    expect(alone.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(alone.p2.points()).toBe(1);
  });
});
