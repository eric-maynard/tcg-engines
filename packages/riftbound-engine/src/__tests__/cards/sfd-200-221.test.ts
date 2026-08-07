/**
 * Arcane Shift — sfd-200-221 · Spell · Mind/Chaos · 3 energy + [rainbow] · [Action]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Banish a friendly unit, then its owner plays it, ignoring its cost. Deal 3 to an enemy unit at
 *   a battlefield. Banish this.
 *
 * Rules: Action timing (Neutral Open on your turn, or with Focus in a Showdown — not as a mere
 * Reaction on the opponent's chain); 355.5/355.8 two independent targets (a FRIENDLY unit anywhere
 * on the board + an ENEMY unit AT A BATTLEFIELD), both chosen at finalization; 356.1.b.1 "ignoring
 * its cost" zeroes energy AND power; 355.2.a the OWNER plays it → to that owner's base or a
 * battlefield they control, entering exhausted (359.2.c) as a brand-new object (359.3.e.4: damage,
 * buffs, this-turn modifiers gone) and re-firing its own "When you play me" (383.4.a);
 * 359.3.e.5/.14.a if the friendly target is illegal on resolution the banish→play pair is skipped
 * but the independent "Deal 3" still happens; "Banish this" → the spell ends in banishment, not trash.
 *
 * Head-judge corner cases for THIS card:
 *   1. Controller ≠ owner: P1 shifts a P2-owned unit it controls → P2 (the owner) chooses where to
 *      play it and gets it back under P2's control.
 *   2. Fresh object: a damaged, buffed unit at bf2 comes back clean, exhausted — and may come back to
 *      bf2 itself because its owner controls that battlefield.
 *   3. Exactly-lethal: 3 to a 3-Might kills; a 4-Might keeps 3 damage until end of turn.
 *   4. Response: P2 Gusts the friendly target back to hand → no banish/replay, but the enemy STILL
 *      takes 3 and the spell is still banished.
 *   5. Timing: legal for the attacker inside a showdown (yanking your own attacker home ends the
 *      fight without combat while still dealing 3); illegal as a reaction during P2's turn.
 *   6. Targeting envelope: enemy units in a base are never offered; with no friendly unit OR no enemy
 *      at a battlefield the spell cannot be put on the chain at all (355.8).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-200-221";
const SANDSHIFTER = "sfd-158-221"; // when played: kill an enemy unit with 3 might or less
const GUST = "ogn-169-298"; // Reaction 1: return a unit at a bf with 3 might or less to hand
const CLEAVE = "ogn-004-298"; // Action 1: give a unit Assault 3

const COST = { energy: 3, power: { rainbow: 1 } };

function board() {
  return scenario()
    .resources(P1, COST)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Three" }, "three")
    .unit(P2, "bf1", { might: 4, name: "Four" }, "four")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
    .hand(P1, CARD, "shift");
}

/** Settle, answering any destination prompt for `seat` with `dest`. */
async function resolveWith(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>, dest = "base") {
  for (let i = 0; i < 4; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d?.kind !== "pick") {
      return;
    }
    const opt = d.options.find((o) => o.key === dest || o.key === `battlefield-${dest}`) ?? d.options[0];
    await game.seat(d.seat).pick(opt?.key as string);
  }
}

describe("Arcane Shift (sfd-200-221)", () => {
  test("registry payload: Action spell, 3 + [rainbow]; sequence = banish friendly unit → play it (ignoreCost) → 3 damage to enemy unit at a battlefield → banish self", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: ["mind", "chaos"], energyCost: 3, name: "Arcane Shift", timing: "action" });
    expect(def?.powerCost).toEqual(["rainbow"]);
    expect(def?.abilities).toHaveLength(1);
    const text = JSON.stringify(def?.abilities?.[0]);
    expect(def?.abilities?.[0]).toMatchObject({ timing: "action", type: "spell" });
    expect(text).toContain('"type":"banish"');
    expect(text).toContain('"controller":"friendly"');
    expect(text).toMatch(/"type":"play"/);
    expect(text).toContain('"ignoreCost":true');
    expect(text).toMatch(/"amount":3[^]*"controller":"enemy"[^]*"location":"battlefield"[^]*"type":"damage"/);
    expect(text).toContain('{"target":"self","type":"banish"}');
  });

  test("cost & zones: 3 energy + 1 rainbow deducted on cast; on resolution Mine is replayed to base exhausted for free, Three (exactly lethal) dies, and the spell is BANISHED, not trashed", async () => {
    const game = await board().build();
    await game.p1.cast("shift", { targets: ["mine", "three"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.zoneOf("shift")).toBe("chain");
    await resolveWith(game, "base");
    expect(game.zoneOf("mine")).toBe("base");
    expect(game.state("mine")).toMatchObject({ controller: P1, isExhausted: true, might: 2 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // "ignoring its cost"
    expect(game.zoneOf("three")).toBe("trash");
    expect(game.zoneOf("four")).toBe("battlefield-bf1");
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.p1.trash()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("not affordable with 2 energy or without the rainbow power", async () => {
    expect((await board().resources(P1, { energy: 2, power: { rainbow: 1 } }).build()).p1.can("cast", "shift")).toBe(false);
    expect((await board().resources(P1, { energy: 3, power: { rainbow: 0 } }).build()).p1.can("cast", "shift")).toBe(false);
  });

  test("one short of lethal: Four takes 3, survives at bf1 with 3 damage, and is clean again after the turn ends", async () => {
    const game = await board().build();
    await game.p1.cast("shift", { targets: ["mine", "four"] });
    await resolveWith(game);
    expect(game.zoneOf("four")).toBe("battlefield-bf1");
    expect(game.state("four").damage).toBe(3);
    await game.advanceTurn();
    expect(game.state("four").damage).toBe(0);
  });

  test("targeting envelope: pairs are (friendly unit anywhere) × (enemy unit AT A BATTLEFIELD) — the enemy Homebody in base is never offered; missing either side → not castable (355.8)", async () => {
    const game = await board().unit(P1, "bf1", { might: 5, name: "Forward" }, "fwd").build();
    const pairs = game.p1.option("cast", "shift")?.fields.find((f) => f.arg === "targets")?.options as string[][];
    expect(pairs).toEqual(expect.arrayContaining([["mine", "three"], ["mine", "four"], ["fwd", "three"], ["fwd", "four"]]));
    expect(pairs).toHaveLength(4);
    expect((await game.p1.try((p) => p.cast("shift", { targets: ["mine", "home"] }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("shift", { targets: ["three", "four"] }))).ok).toBe(false); // enemy is not "friendly"
    const noEnemyAtBf = await scenario().resources(P1, COST).battlefield("bf1").unit(P2, "base", { might: 1 }, "home").unit(P1, "base", { might: 2 }, "mine").hand(P1, CARD, "shift").build();
    expect(noEnemyAtBf.p1.can("cast", "shift")).toBe(false);
    const noFriendly = await scenario().resources(P1, COST).battlefield("bf1").unit(P2, "bf1", { might: 1 }, "v").hand(P1, CARD, "shift").build();
    expect(noFriendly.p1.can("cast", "shift")).toBe(false);
  });

  test("controller ≠ owner: shifting a P2-OWNED unit that P1 controls → P2 (its owner) picks the destination and gets it back, exhausted, in P2's base under P2's control", async () => {
    const game = await scenario()
      .resources(P1, COST)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
      .card("stolen", { controller: P1, def: { cardType: "unit", might: 2, name: "Stolen" }, owner: P2, zone: "base" })
      .hand(P1, CARD, "shift")
      .build();
    expect(game.state("stolen")).toMatchObject({ controller: P1, owner: P2 });
    expect(game.p1.units()).toContain("stolen"); // friendly to P1 right now
    await game.p1.cast("shift", { targets: ["stolen", "victim"] });
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 }); // the OWNER decides where it is played
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["base", "battlefield-bf1"]); // P2's base or P2's bf
    await game.p2.pick("base");
    await game.settle();
    expect(game.zoneOf("stolen")).toBe("base");
    expect(game.state("stolen")).toMatchObject({ controller: P2, isExhausted: true, owner: P2 });
    expect(game.p2.units("base")).toContain("stolen");
    expect(game.p1.units()).not.toContain("stolen");
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("shift")).toBe("banishment");
  });

  test("fresh object (359.3.e.4): a damaged, buffed 3-Might unit at bf2 comes back with no damage, no buff, exhausted — and its owner may replay it straight to bf2 (a battlefield they control)", async () => {
    const game = await scenario()
      .resources(P1, COST)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 4, name: "Victim" }, "victim")
      .unit(P1, "bf2", { might: 3, name: "Mine" }, "mine", { buffed: true, damage: 2 })
      .hand(P1, CARD, "shift")
      .build();
    expect(game.state("mine")).toMatchObject({ damage: 2, isBuffed: true, might: 4 });
    await game.p1.cast("shift", { targets: ["mine", "victim"] });
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["base", "battlefield-bf2"]); // never the enemy bf1
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    expect(game.zoneOf("mine")).toBe("battlefield-bf2");
    expect(game.state("mine")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 3 });
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.state("victim").damage).toBe(3);
  });

  test("'plays it' re-fires play effects (383.4.a): shifting Sandshifter kills a second small enemy for free, on top of the 3 damage", async () => {
    const game = await scenario()
      .resources(P1, COST)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Tank" }, "tank")
      .unit(P2, "base", { might: 2, name: "Small" }, "small")
      .unit(P1, "base", SANDSHIFTER, "ss")
      .hand(P1, CARD, "shift")
      .build();
    await game.p1.cast("shift", { targets: ["ss", "tank"] });
    game.script(P1, ["base", "small"]);
    await game.settle({ policy: "first" });
    expect(game.zoneOf("ss")).toBe("base");
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.state("tank").damage).toBe(3);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.zoneOf("shift")).toBe("banishment");
  });

  test("359.3.e.5 — if P2 Gusts the friendly target back to hand in response, the banish→play pair is skipped but the enemy STILL takes 3 at its battlefield and the spell is still banished", async () => {
    // Expected: mine in hand (Gust), victim stays at bf1 with 3 damage, shift in banishment, no prompt.
    // Actual: with the friendly target gone the `pending-value` play step latches onto the ENEMY target —
    // P2 is asked where to "play" Victim and it lands undamaged in P2's base.
    const game = await scenario()
      .resources(P1, COST)
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 4, name: "Victim" }, "victim")
      .unit(P1, "bf2", { might: 3, name: "Mine" }, "mine")
      .hand(P1, CARD, "shift")
      .hand(P2, GUST, "gust")
      .build();
    await game.p1.cast("shift", { targets: ["mine", "victim"] });
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "mine" });
    const stop = await game.settle();
    expect(game.zoneOf("mine")).toBe("hand");
    expect(stop.reason).toBe("open"); // nobody is asked anything
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
    expect(game.state("victim").damage).toBe(3);
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.zoneOf("gust")).toBe("trash");
  });

  test("[Action] in a showdown: P1 attacks with Mine, then (holding Focus) shifts Mine home — it leaves the fight for base (exhausted), the defender still eats 3 and dies, and no combat happens", async () => {
    const game = await scenario()
      .resources(P1, COST)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Defender" }, "def")
      .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
      .hand(P1, CARD, "shift")
      .build();
    await game.p1.move("mine", "bf1");
    expect(game.actingSeat()).toBe(P1); // attacker has Focus
    expect(game.p1.can("cast", "shift")).toBe(true);
    await game.p1.cast("shift", { targets: ["mine", "def"] });
    await resolveWith(game, "base");
    await game.settle();
    expect(game.zoneOf("mine")).toBe("base");
    expect(game.state("mine")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.p1.points()).toBe(0); // nobody left there to conquer with
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull(); // 190.4.c: emptied → uncontrolled at cleanup
  });

  test("[Action] is NOT a Reaction: during P2's turn, with P2's Cleave on the chain and P1 holding priority, Arcane Shift is not legal", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, COST)
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Theirs" }, "theirs")
      .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
      .hand(P1, CARD, "shift")
      .hand(P2, CLEAVE, "cleave")
      .build();
    expect(game.p1.can("cast", "shift")).toBe(false); // not my turn, nothing happening
    await game.p2.cast("cleave", { targets: "theirs" });
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "shift")).toBe(false);
    const r = await game.p1.try((p) => p.cast("shift", { targets: ["mine", "theirs"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("shift")).toBe("hand");
  });
});
