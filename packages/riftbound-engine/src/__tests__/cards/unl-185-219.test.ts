/**
 * Bloodharbor Ripper — unl-185-219 · Legend (Pyke) · Fury/Chaos
 *
 *   [1], [Exhaust]: Return a friendly unit at a battlefield to its owner's hand. Play a Gold gear token
 *   exhausted. (It has "[Reaction][>] Kill this, [Exhaust]: [Add] [rainbow].")
 *
 * Rules: 377.3 (activated ability → chain → P2 may respond), 355.5/818-style targeting (the unit is a
 * TARGET chosen on activation: friendly + unit + AT A BATTLEFIELD), 419.2.a (no legal target → cannot be
 * activated at all, so no Gold either), 359.3.e.5 (if the target became illegal only ITS instruction is
 * skipped — the Gold token is still played), 108/"owner's hand" (a unit I control but do not own goes to
 * its OWNER's hand), 186.1 (a token unit "returned to hand" ceases to exist), 187.5 (Gold = gear token
 * with the Reaction Add ability; enters exhausted here), 716 (attached Equipment detaches and is recalled
 * to base), 190.4.c (emptied battlefield → control lost at cleanup), 316.5.b (no Reaction on the legend
 * ability itself: own turn, open state only).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. controller ≠ owner: bouncing a stolen unit hands it back to the opponent — I still get the Gold.
 *  2. Target legality: my unit in BASE and enemy units at battlefields are never offered; with no friendly
 *     unit at any battlefield the whole ability (Gold included) is unavailable.
 *  3. Response window: P2 kills the target in response → nothing returns, but the Gold still arrives.
 *  4. What comes home: damage is gone (it is a hand card now), its Equipment drops to base, the now-empty
 *     battlefield is no longer mine; a token target simply vanishes.
 *  5. The Gold is real: exhausted now, ready after my next Awaken, then cashes for [rainbow] at Reaction speed.
 *  6. Costs: exactly [1] + exhaust → once per turn; 0 energy or an exhausted legend → illegal.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-185-219";
const HEXDRINKER = "sfd-102-221"; // Equipment +1
const CULL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Cull",
  timing: "reaction",
};

const golds = (game: Game, seat: "p1" | "p2" = "p1") => game[seat].gear().filter((g) => game.state(g).name === "Gold" && game.state(g).isToken);
const targetsOf = (game: Game) =>
  ((game.p1.option("activate", "rip")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][]).map((t) => t[0]).sort();

/** P1's turn, 2 energy; Diver (2, damaged 1) + Anchor (3) at P1's bf1, Home (1) in base; enemy Foe at bf2. */
function board(energy = 2) {
  return scenario()
    .resources(P1, { energy })
    .legend(P1, CARD, "rip")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Diver" }, "diver", { damage: 1 })
    .unit(P1, "bf1", { might: 3, name: "Anchor" }, "anchor")
    .unit(P1, "base", { might: 1, name: "Home" }, "home")
    .unit(P2, "bf2", { might: 3, name: "Foe" }, "foe");
}

describe("Bloodharbor Ripper (unl-185-219)", () => {
  test("registry payload: one activated ability {[1], exhaust} → sequence[return-to-hand(friendly unit at a battlefield), create Gold gear token (not ready)]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Pyke", domain: ["fury", "chaos"], name: "Bloodharbor Ripper" });
    expect(def?.abilities).toEqual([
      {
        cost: { energy: 1, exhaust: true },
        effect: {
          effects: [
            { target: { controller: "friendly", location: "battlefield", type: "unit" }, type: "return-to-hand" },
            { ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" },
          ],
          type: "sequence",
        },
        type: "activated",
      },
    ]);
  });

  test("targets: exactly my units AT A BATTLEFIELD (Diver | Anchor) — Home (base) and the enemy Foe are not offered and are rejected", async () => {
    const game = await board().build();
    expect(targetsOf(game)).toEqual(["anchor", "diver"]);
    expect((await game.p1.try((p) => p.activate("rip", undefined, { targets: "home" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.activate("rip", undefined, { targets: "foe" }))).ok).toBe(false);
    expect(game.state("rip").isReady).toBe(true);
    expect(game.p1.energy()).toBe(2);
  });

  test("full line: pay [1] + exhaust, ability (targeting Diver) waits on the chain with P2's priority, then Diver returns to MY hand undamaged and an EXHAUSTED Gold gear token appears in my base", async () => {
    const game = await board().build();
    await game.p1.activate("rip", undefined, { targets: "diver" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.state("rip").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rip", controller: P1, targets: ["diver"], triggered: false })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.zoneOf("diver")).toBe("battlefield-bf1");
    expect(golds(game)).toEqual([]);
    await game.p2.passPriority();
    expect(game.zoneOf("diver")).toBe("hand");
    expect(game.p1.hand()).toContain("diver");
    expect(game.state("diver").damage).toBe(0);
    const gold = golds(game);
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string)).toMatchObject({ cardType: "gear", controller: P1, isExhausted: true, isToken: true, name: "Gold", owner: P1, zone: "base" });
    expect(golds(game, "p2")).toEqual([]);
    expect(game.zoneOf("anchor")).toBe("battlefield-bf1"); // only the chosen one
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // Anchor still holds it
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("'its OWNER's hand' — bouncing a unit I control but P2 owns puts it in P2's hand; the Gold is still mine", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .legend(P1, CARD, "rip")
      .battlefield("bf1", { controller: P1 })
      .card("stolen", { controller: P1, def: { cardType: "unit", might: 3, name: "Stolen" }, owner: P2, zone: "bf1" })
      .build();
    expect(game.state("stolen")).toMatchObject({ controller: P1, owner: P2 });
    expect(targetsOf(game)).toEqual(["stolen"]);
    await game.p1.activate("rip", undefined, { targets: "stolen" });
    await game.settle();
    expect(game.zoneOf("stolen")).toBe("hand");
    expect(game.p2.hand()).toContain("stolen");
    expect(game.p1.hand()).not.toContain("stolen");
    expect(golds(game)).toHaveLength(1);
    expect(golds(game, "p2")).toEqual([]);
  });

  test("419.2.a — no friendly unit at any battlefield (only Home in base, Foe at bf1): the ability is not activatable, so no Gold can be farmed either", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .legend(P1, CARD, "rip")
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 1, name: "Home" }, "home")
      .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
      .build();
    expect(game.p1.can("activate", "rip")).toBe(false);
    expect((await game.p1.try((p) => p.activate("rip"))).ok).toBe(false);
    await game.settle();
    expect(game.p1.energy()).toBe(2);
    expect(game.state("rip").isReady).toBe(true);
    expect(golds(game)).toEqual([]);
  });

  test("359.3.e.5 — P2 kills the target in response: nothing returns to hand, but the Gold token is still played exhausted", async () => {
    const game = await board().resources(P2, { energy: 1 }).hand(P2, CULL, "cull").build();
    await game.p1.activate("rip", undefined, { targets: "diver" });
    await game.p1.passPriority();
    await game.p2.cast("cull", { targets: "diver" });
    await game.settle();
    expect(game.zoneOf("diver")).toBe("trash");
    expect(game.p1.hand()).not.toContain("diver");
    const gold = golds(game);
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string).isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
  });

  test("what comes home: an equipped lone holder — its Hexdrinker detaches to base unattached (716) and the emptied battlefield is no longer controlled (190.4.c)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .legend(P1, CARD, "rip")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Diver" }, "diver", { equippedWith: ["hex"] })
      .card("hex", { def: HEXDRINKER, meta: { attachedTo: "diver" }, owner: P1, zone: "bf1" })
      .build();
    expect(game.state("diver").might).toBe(3);
    await game.p1.activate("rip", undefined, { targets: "diver" });
    await game.settle();
    expect(game.zoneOf("diver")).toBe("hand");
    expect(game.state("hex")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(golds(game)).toHaveLength(1);
  });

  test("186.1 — targeting a TOKEN unit: it ceases to exist instead of reaching a hand; the Gold is still made", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .legend(P1, CARD, "rip")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { isToken: true, might: 2, name: "Sand Soldier", tags: ["Sand Soldier"] }, "tok")
      .build();
    await game.p1.activate("rip", undefined, { targets: "tok" });
    await game.settle();
    expect(game.zoneOf("tok")).toBe("gone");
    expect(game.p1.hand()).not.toContain("tok");
    expect(golds(game)).toHaveLength(1);
  });

  test("costs & limits: 0 energy → illegal; after one use the exhausted legend cannot go again this turn even with energy and targets left", async () => {
    expect((await board(0).build()).p1.can("activate", "rip")).toBe(false);
    const game = await board(3).build();
    await game.p1.activate("rip", undefined, { targets: "diver" });
    await game.settle();
    expect(game.p1.energy()).toBe(2);
    expect(targetsOf(game)).toEqual([]); // no option at all
    expect(game.p1.can("activate", "rip")).toBe(false);
    expect((await game.p1.try((p) => p.activate("rip", undefined, { targets: "anchor" }))).ok).toBe(false);
    expect(game.zoneOf("anchor")).toBe("battlefield-bf1");
    expect(golds(game)).toHaveLength(1);
  });

  test("timing: not on the opponent's turn (open or in response to their spell), not while I hold Focus in my own showdown", async () => {
    const opp = await board().active(P2).resources(P2, { energy: 1 }).hand(P2, CULL, "cull").build();
    expect(opp.p1.can("activate", "rip")).toBe(false);
    await opp.p2.cast("cull", { targets: "home" });
    await opp.p2.passPriority();
    expect(opp.actingSeat()).toBe(P1);
    expect(opp.p1.can("activate", "rip")).toBe(false);

    const mine = await board().build();
    await mine.p1.move("home", "bf2"); // 1 into 3 → showdown, P1 has Focus
    expect(mine.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(mine.p1.can("activate", "rip")).toBe(false);
  });

  test("the Gold is a real Gold (187.5): exhausted this turn, ready after my next Awaken, then 'Kill this, [Exhaust]: [Add] [rainbow]' cashes it in; the legend is ready again too", async () => {
    const game = await board().build();
    await game.p1.activate("rip", undefined, { targets: "diver" });
    await game.settle();
    const gold = golds(game)[0] as string;
    expect(game.p1.can("activate", gold)).toBe(false); // exhausted → cannot pay [Exhaust]
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("rip").isReady).toBe(true);
    expect(game.state(gold).isReady).toBe(true);
    await game.p1.activate(gold);
    await game.settle();
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.zoneOf(gold)).toBe("gone");
    // and the readied legend can bounce again this turn (Anchor is still out there)
    await game.p1.tapRune();
    expect(targetsOf(game)).toEqual(["anchor"]);
  });
});
