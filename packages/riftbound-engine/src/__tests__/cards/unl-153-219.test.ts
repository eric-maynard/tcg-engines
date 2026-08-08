/**
 * Carrion Dredger — unl-153-219 · Unit · Order · 2 energy · 1 Might
 *
 *   [Deathknell][>] Play a 1 [Might] Bird unit token with [Deflect] to your base.
 *   (When I die, get the effect. Opponents must pay [rainbow] to choose a [Deflect] unit with a
 *   spell or ability.)
 *
 * Rules: 808 (Deathknell = "When I die, [Effect]"; the trigger is being killed AND sent to the
 * trash — noted before the move, 808.1.d.2/3; a replaced death removes it, 808.1.d.1; each printed
 * instance triggers once, 808.2), 323.4 / 428.1 (combat deaths and kill instructions are both
 * deaths; a kill paid as a COST is a kill), 383.3.c/d (triggers fire on any player's turn; several
 * simultaneous ones are ordered turn-player first), 187.7 (1 [M] Bird = domainless token, Bird tag,
 * Deflect), 185/186 (tokens are units on the board, enter exhausted, cease to exist off-board),
 * 809 (Deflect: opponents pay 1 power of ANY domain more to choose it), 182 + "your" = the
 * ability's controller (a stolen Dredger feeds its controller's base, the card goes to its owner).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. "to your BASE", not "here": dying in combat at a battlefield still puts the Bird in base.
 *  2. Exactly ONE Bird per death, although the registry carries the effect twice (keyword + trigger).
 *  3. Not a death → no Bird: Zhonya's Hourglass replacing the kill; Retreat bouncing it in response
 *     to a kill spell (the spell loses its target). Killing the Bird makes no further Bird.
 *  4. Every kind of death counts: enemy spell, own spell, combat as attacker OR defender (on the
 *     opponent's turn), Cruel Patron's additional-cost sacrifice, The Ruination wiping the board
 *     (two Dredgers → two Birds; the enemy's Dredger feeds THEIR base).
 *  5. The Bird's Deflect: P2's free Ping cannot choose it with an empty power pool, can with one
 *     power of an unrelated domain (spent); P1's own Ping is untaxed.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-153-219";
const ZHONYA = "ogn-077-298"; // Gear: if a friendly unit would die, kill this instead; heal/exhaust/recall it.
const RETREAT = "ogn-104-298"; // Reaction, 1: return a friendly unit to its owner's hand; channel 1 rune exhausted.
const PATRON = "ogn-208-298"; // Order unit, 4: as an additional cost to play me, kill a friendly unit.
const RUINATION = "unl-180-219"; // Order spell, 9 + [order]x3: kill all units.
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Bolt",
  timing: "action",
} as const;
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

describe("Carrion Dredger (unl-153-219)", () => {
  test("registry payload: a Deathknell keyword ability whose effect creates a 1-Might 'Bird' unit token with Deflect at location BASE (the trigger mirror, if present, says die/self with the same effect)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 2, might: 1, name: "Carrion Dredger" });
    expect(def?.powerCost ?? []).toEqual([]);
    const effect = { location: "base", token: { keywords: ["Deflect"], might: 1, name: "Bird", type: "unit" }, type: "create-token" };
    const abilities = (def?.abilities ?? []) as { type: string; keyword?: string; effect?: unknown; trigger?: unknown }[];
    expect(abilities[0]).toEqual({ effect, keyword: "Deathknell", type: "keyword" });
    for (const extra of abilities.slice(1)) {
      expect(extra).toEqual({ effect, trigger: { event: "die", on: "self" }, type: "triggered" });
    }
    expect(abilities.length).toBeLessThanOrEqual(2);
  });

  test("cost: 2 energy, no power; enters the base exhausted as a 1-Might unit carrying Deathknell (and no Deflect itself); playing it triggers nothing; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "dredger").build();
    await game.p1.play("dredger");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("dredger")).toMatchObject({ baseMight: 1, isExhausted: true, might: 1, zone: "base" });
    expect(game.state("dredger").keywords).toContain("Deathknell");
    expect(game.state("dredger").keywords).not.toContain("Deflect");
    expect(birds(game)).toHaveLength(0);
    expect((await scenario().resources(P1, { energy: 1, power: { order: 2 } }).hand(P1, CARD, "d").build()).p1.can("play", "d")).toBe(false);
  });

  test("killed by a spell in base: Dredger hits the trash, ONE Deathknell item goes on the chain (P2 gets priority), then exactly one exhausted 1-Might Deflect Bird token appears in P1's base", async () => {
    const game = await scenario().unit(P1, "base", CARD, "dredger").hand(P1, BOLT, "bolt").build();
    await game.p1.cast("bolt", { targets: "dredger" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Bolt resolves
    expect(game.zoneOf("dredger")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dredger", controller: P1, triggered: true })]);
    expect(birds(game)).toHaveLength(0);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // a real chain item
    await game.settle();
    expect(birds(game, "p1", "base")).toHaveLength(1);
    const [bird] = birds(game);
    expect(game.state(bird!)).toMatchObject({ baseMight: 1, cardType: "unit", controller: P1, energyCost: 0, isExhausted: true, isToken: true, might: 1, owner: P1 });
    expect(game.state(bird!).keywords).toContain("Deflect");
    expect(game.state(bird!).keywords).not.toContain("Deathknell");
    expect(game.state(bird!).domains).toEqual([]);
    expect(birds(game, "p2")).toHaveLength(0);
    expect(game.violations()).toEqual([]);
  });

  test("'to your BASE', not here: attacking into a 3-Might wall at bf1 it dies in combat (323.4) and the Bird is played to P1's base — nothing is left at bf1", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 3, name: "Wall" }, "wall").unit(P1, "base", CARD, "dredger").build();
    await game.p1.move("dredger", "bf1");
    await game.settle();
    expect(game.zoneOf("dredger")).toBe("trash");
    expect(birds(game, "p1", "base")).toHaveLength(1);
    expect(birds(game, "p1", "bf1")).toHaveLength(0);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.state("wall").damage).toBe(0); // 1 damage healed in the combat cleanup
  });

  test("dies DEFENDING on the opponent's turn (383.3.c): a 3-Might raider kills it at P1's battlefield and conquers; the Bird still lands in P1's base", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "dredger")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("dredger")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(birds(game, "p1", "base")).toHaveLength(1);
    expect(birds(game, "p2")).toHaveLength(0);
  });

  test("replaced death (808.1.d.1): with Zhonya's Hourglass out, lethal Bolt kills the Hourglass instead — Dredger stays in base healed and exhausted, and NO Bird is made", async () => {
    const game = await scenario().gear(P1, ZHONYA, "hourglass").unit(P1, "base", CARD, "dredger", { exhausted: false }).hand(P1, BOLT, "bolt").build();
    await game.p1.cast("bolt", { targets: "dredger" });
    await game.settle();
    expect(game.zoneOf("hourglass")).toBe("trash");
    expect(game.zoneOf("dredger")).toBe("base");
    expect(game.state("dredger")).toMatchObject({ damage: 0, isExhausted: true });
    expect(birds(game)).toHaveLength(0);
    expect(game.chain()).toEqual([]);
  });

  test("bounced, not killed: P2 Bolts the Dredger, P1 answers with Retreat → Dredger returns to hand, the Bolt finds nothing, no Bird (leaving the board is not dying)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1 })
      .unit(P1, "base", CARD, "dredger")
      .hand(P2, BOLT, "bolt")
      .hand(P1, RETREAT, "retreat")
      .build();
    await game.p2.cast("bolt", { targets: "dredger" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("retreat", { targets: "dredger" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["bolt", "retreat"]);
    await game.settle();
    expect(game.zoneOf("dredger")).toBe("hand");
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(birds(game)).toHaveLength(0);
    expect(game.p1.trash()).toEqual(["retreat"]);
  });

  test("a kill paid as a COST is a death (428.1): sacrificing the Dredger to Cruel Patron yields the Patron AND a Bird", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).unit(P1, "base", CARD, "dredger").hand(P1, PATRON, "patron").build();
    await game.p1.play("patron", { sacrifice: "dredger" });
    expect(game.zoneOf("dredger")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dredger", triggered: true })]);
    await game.settle();
    expect(game.zoneOf("patron")).toBe("base");
    expect(birds(game, "p1", "base")).toHaveLength(1);
    expect(game.p1.energy()).toBe(0);
  });

  test("simultaneous deaths (The Ruination): P1's two Dredgers and P2's one all trigger — turn player's items first — and each Bird goes to ITS controller's base (2 for P1, 1 for P2)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { order: 3 } })
      .unit(P1, "base", CARD, "d1")
      .unit(P1, "base", CARD, "d2")
      .unit(P2, "base", CARD, "theirs")
      .hand(P1, RUINATION, "ruin")
      .build();
    await game.p1.cast("ruin");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(["d1", "d2", "theirs"].map((id) => game.zoneOf(id))).toEqual(["trash", "trash", "trash"]);
    const items = game.chain().filter((i) => i.triggered);
    expect(items).toHaveLength(3);
    expect(items.slice(0, 2).every((i) => i.controller === P1)).toBe(true); // 383.3.d.1
    expect(items[2]).toMatchObject({ cardId: "theirs", controller: P2 });
    await game.settle();
    expect(birds(game, "p1", "base")).toHaveLength(2);
    expect(birds(game, "p2", "base")).toHaveLength(1);
    expect(game.violations()).toEqual([]);
  });

  test("controller ≠ owner (182): a Dredger P1 owns but P2 controls dies → the Bird is P2's (in P2's base) while the card goes to its OWNER's trash", async () => {
    const game = await scenario().card("dredger", { controller: P2, def: CARD, owner: P1, zone: "base" }).hand(P1, BOLT, "bolt").build();
    expect(game.state("dredger")).toMatchObject({ controller: P2, owner: P1 });
    await game.p1.cast("bolt", { targets: "dredger" });
    await game.settle();
    expect(game.zoneOf("dredger")).toBe("trash");
    expect(game.p1.trash()).toContain("dredger");
    expect(birds(game, "p2", "base")).toHaveLength(1);
    expect(birds(game, "p1")).toHaveLength(0);
  });

  test("the Bird's [Deflect] taxes OPPONENTS only: P2's free Ping cannot choose it with no power, can with 1 power of any domain (spent); the dead token ceases to exist (no trash) and makes no further Bird", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "dredger")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P2, PING, "ping")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    const [bird] = birds(game, "p1", "base");
    expect(bird).toBeDefined();
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    const offered = game.p2.option("cast", "ping")?.fields.find((f) => f.arg === "targets")?.options;
    expect(offered).toEqual([["raider"]]); // the Bird is not choosable for free
    expect((await game.p2.try((p) => p.cast("ping", { targets: bird! }))).ok).toBe(false);
    await game.p2.do("addResources", { power: { chaos: 1 } }); // 809.1.c.1: any domain pays Deflect
    await game.p2.cast("ping", { targets: bird! });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.has(bird!)).toBe(false);
    expect(game.p1.trash()).toEqual(["dredger"]); // no token in any trash
    expect(birds(game)).toHaveLength(0); // a dying Bird has no Deathknell
    expect(game.chain()).toEqual([]);
  });

  test("Deflect never taxes the controller: P1's own free Ping may choose (and kill) its Bird with an empty power pool", async () => {
    const game = await scenario().unit(P1, "base", CARD, "dredger").hand(P1, BOLT, "bolt").hand(P1, PING, "ping").build();
    await game.p1.cast("bolt", { targets: "dredger" });
    await game.settle();
    const [bird] = birds(game);
    expect(bird).toBeDefined();
    await game.p1.cast("ping", { targets: bird! });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.has(bird!)).toBe(false);
    expect(game.p1.trash().sort()).toEqual(["bolt", "dredger", "ping"]);
  });

  test("the Bird is a real (if small) body next turn: it readies in P1's Awaken step and can walk onto an open battlefield to conquer", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", CARD, "dredger")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    const [bird] = birds(game, "p1", "base");
    expect(game.state(bird!).isExhausted).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state(bird!).isReady).toBe(true);
    await game.p1.move(bird!, "bf2");
    await game.settle();
    expect(game.locationOf(bird!)).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
