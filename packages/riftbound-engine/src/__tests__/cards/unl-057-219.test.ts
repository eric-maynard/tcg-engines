/**
 * Alpha Wildclaw — unl-057-219 · Unit · Calm · 6 energy + [calm][calm] · 7 might
 *
 *   [Tank] (I must be assigned combat damage first.)
 *   Your units here with less Might than me can't be chosen by enemy spells and abilities.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. "less Might than me" is STRICT and LIVE: a friendly 7 beside a 7-Might Alpha is fair game, a 6
 *     is protected; pump the 6 to 8 (Discipline) and it becomes targetable again; buff Alpha and the
 *     7 slips under the umbrella. Alpha never protects itself.
 *  2. "here" = Alpha's own location only. A small friendly at another battlefield (or in base while
 *     Alpha is afield) gets nothing; once Alpha dies or walks away the protection at the old spot ends.
 *  3. "can't be chosen" is absolute (not a Deflect tax): no amount of power helps; if the protected
 *     unit is the only candidate the enemy spell is simply not playable (355.8).
 *  4. "enemy spells AND abilities": an enemy gear activation (Iron Ballista) and an enemy play
 *     trigger (Solari Shieldbearer) may not pick a protected unit either; friendly spells may.
 *  5. Non-choosing effects ("deal 1 to ALL units at battlefields") and combat damage are untouched.
 *  6. Tank (815): enemy combat damage must make Alpha lethal (7) before any goes to a non-Tank
 *     friend — 5 incoming leaves the 2-Might cub untouched; 9 incoming kills Alpha and then the cub.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-057-219";
const HEXTECH_RAY = "ogn-009-298"; // Action · 1 + [fury] · Deal 3 to a unit at a battlefield.
const FLURRY_OF_BLADES = "ogn-133-298"; // Reaction · 1 · Deal 1 to all units at battlefields.
const IRON_BALLISTA = "ogn-017-298"; // Gear · [Exhaust]: Deal 2 to a unit at a battlefield.
const SOLARI = "ogn-051-298"; // Unit · 3 · When you play me, stun a unit.
const DISCIPLINE = "ogn-058-298"; // Reaction · 2 · Give a unit +2 Might this turn. Draw 1.
/** Inline enemy spell: "Deal 3 to a unit at a battlefield with 3 or less Might" — only small units qualify. */
const CULL_THE_WEAK = {
  abilities: [
    {
      effect: { amount: 3, target: { filter: { might: { lte: 3 } }, location: "battlefield", type: "unit" }, type: "damage" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Cull the Weak",
  timing: "action",
};
/** Inline enemy [Action] bolt: 1 energy, "Deal 2 to a unit." */
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Bolt",
  timing: "action",
};

/** P2 to act. P1 holds bf1 with Alpha (7), Cub (2) and Rival (7); Stray (2) sits alone at bf2. */
function pack(p2: { energy?: number; power?: Record<string, number> } = { energy: 2, power: { fury: 1, rainbow: 3 } }) {
  return scenario()
    .active(P2)
    .resources(P2, p2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", CARD, "alpha")
    .unit(P1, "bf1", { might: 2, name: "Cub" }, "cub")
    .unit(P1, "bf1", { might: 7, name: "Rival" }, "rival")
    .unit(P1, "bf2", { might: 2, name: "Stray" }, "stray");
}

function rayTargets(game: { p2: { option: (v: string, c: string) => { fields: readonly { arg: string; options?: readonly unknown[] }[] } | undefined } }) {
  return (game.p2.option("cast", "ray")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
}

describe("Alpha Wildclaw (unl-057-219)", () => {
  test("cost: 6 energy + 2 calm for a 7-Might Tank that enters the base exhausted; one calm short or 5 energy → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { calm: 2 } }).hand(P1, CARD, "alpha").build();
    await game.p1.play("alpha");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("alpha")).toBe("base");
    expect(game.state("alpha")).toMatchObject({ isExhausted: true, might: 7 });
    expect(game.state("alpha").keywords).toContain("Tank");
    const oneCalm = await scenario().resources(P1, { energy: 6, power: { calm: 1, fury: 5 } }).hand(P1, CARD, "alpha").build();
    expect(oneCalm.p1.can("play", "alpha")).toBe(false);
    const fiveEnergy = await scenario().resources(P1, { energy: 5, power: { calm: 2 } }).hand(P1, CARD, "alpha").build();
    expect(fiveEnergy.p1.can("play", "alpha")).toBe(false);
  });

  test("enemy spell: Hextech Ray may choose Alpha itself, the equal-Might Rival and the far-away Stray — but NOT the 2-Might Cub beside Alpha, even with power to burn", async () => {
    const game = await pack().hand(P2, HEXTECH_RAY, "ray").build();
    const offered = rayTargets(game);
    expect(offered).toEqual(expect.arrayContaining([["alpha"], ["rival"], ["stray"]]));
    expect(offered).not.toContainEqual(["cub"]);
    expect(offered).toHaveLength(3);
    const r = await game.p2.try((p) => p.cast("ray", { targets: "cub" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("ray")).toBe("hand");
    await game.p2.cast("ray", { targets: "stray" }); // "here" only: bf2 is unprotected
    await game.settle();
    expect(game.zoneOf("stray")).toBe("trash");
    expect(game.state("cub").damage).toBe(0);
  });

  test("sole candidate protected → the enemy spell cannot be played at all (355.8)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1, rainbow: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "alpha")
      .unit(P1, "bf1", { might: 2, name: "Cub" }, "cub")
      .hand(P2, CULL_THE_WEAK, "cull")
      .build();
    // An enemy "deal 3 to a unit at a battlefield with 3 or less Might" has only the Cub — refused.
    expect(game.p2.can("cast", "cull")).toBe(false);
    // Control: without Alpha next to it the same spell happily shoots the Cub.
    const alone = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Cub" }, "cub")
      .hand(P2, CULL_THE_WEAK, "cull")
      .build();
    expect(alone.p2.option("cast", "cull")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["cub"]]);
  });

  test("LIVE and STRICT comparison: an enemy Discipline may only pick Alpha; P1's own Discipline pumps the 6-Might Packmate to 8, making it targetable until the pump expires; a buffed Alpha (8) covers the 7-Might Rival", async () => {
    const enemyDisc = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "alpha")
      .unit(P1, "bf1", { might: 6, name: "Packmate" }, "mate")
      .hand(P2, DISCIPLINE, "disc")
      .hand(P2, HEXTECH_RAY, "ray")
      .build();
    expect(rayTargets(enemyDisc)).toEqual([["alpha"]]);
    expect(enemyDisc.p2.option("cast", "disc")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["alpha"]]);

    const selfPump = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "alpha")
      .unit(P1, "bf1", { might: 6, name: "Packmate" }, "mate")
      .hand(P1, DISCIPLINE, "disc")
      .hand(P2, HEXTECH_RAY, "ray")
      .build();
    await selfPump.p1.cast("disc", { targets: "mate" }); // friendly spells choose freely, no extra cost
    expect(selfPump.p1.energy()).toBe(0);
    await selfPump.settle();
    expect(selfPump.state("mate").might).toBe(8); // 8 ≥ 7: no longer "less Might than me"
    await selfPump.p2.do("addResources", { energy: 1, power: { fury: 1 } });
    // Hextech Ray is an [Action] — P2 cannot cast it on P1's turn, so check across the turn boundary:
    await selfPump.advanceTurn(); // pump expires at P1's Ending Step → 6 again → protected again
    expect(selfPump.turnPlayer()).toBe(P2);
    expect(selfPump.state("mate").might).toBe(6);
    await selfPump.p2.do("addResources", { energy: 1, power: { fury: 1 } });
    expect(rayTargets(selfPump)).toEqual([["alpha"]]);

    const buffedAlpha = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "alpha", { buffed: true })
      .unit(P1, "bf1", { might: 7, name: "Rival" }, "rival")
      .hand(P2, HEXTECH_RAY, "ray")
      .build();
    expect(buffedAlpha.state("alpha").might).toBe(8);
    expect(rayTargets(buffedAlpha)).toEqual([["alpha"]]);
  });

  test("a pumped-past-Alpha friend is targetable the same turn: P1 Disciplines Packmate to 8 in response to P2's bolt (Reaction on their chain), and P2's next Ray may shoot it", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "alpha")
      .unit(P1, "bf1", { might: 6, name: "Packmate" }, "mate")
      .hand(P1, DISCIPLINE, "disc")
      .hand(P2, BOLT, "bolt")
      .hand(P2, HEXTECH_RAY, "ray")
      .build();
    expect(rayTargets(game)).toEqual([["alpha"]]);
    expect(game.p1.can("cast", "disc")).toBe(false); // Neutral Open on P2's turn: even a Reaction waits for a chain (316.5.b)
    await game.p2.cast("bolt", { targets: "alpha" });
    await game.p2.passPriority();
    await game.p1.cast("disc", { targets: "mate" }); // Reaction onto P2's chain
    await game.settle(); // Discipline (+2 → 8) then the bolt (2 into Alpha) resolve
    expect(game.state("mate").might).toBe(8);
    expect(game.state("alpha").damage).toBe(2);
    expect(rayTargets(game).sort()).toEqual([["alpha"], ["mate"]]);
    await game.p2.cast("ray", { targets: "mate" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // no Deflect-style surcharge either
    await game.settle();
    expect(game.state("mate").damage).toBe(3);
  });

  test("protection ends when Alpha leaves: an 8-Might Hunter kills Tank Alpha in combat (Cub survives the 1 overflow), after which the Cub is a legal Ray target", async () => {
    const fight = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "alpha")
      .unit(P1, "bf1", { might: 2, name: "Cub" }, "cub")
      .unit(P2, "base", { might: 8, name: "Hunter" }, "hunter")
      .hand(P2, HEXTECH_RAY, "ray")
      .build();
    expect(rayTargets(fight)).toEqual([["alpha"]]);
    await fight.p2.move("hunter", "bf1");
    await fight.settle(); // 8 into Tank Alpha (lethal 7) then 1 into Cub (survives); defenders deal 9 → Hunter dies
    expect(fight.zoneOf("alpha")).toBe("trash");
    expect(fight.zoneOf("hunter")).toBe("trash");
    expect(fight.zoneOf("cub")).toBe("battlefield-bf1");
    expect(rayTargets(fight)).toEqual([["cub"]]); // umbrella gone with Alpha
  });

  test("'chosen' only: the non-targeting Flurry of Blades still deals 1 to the protected Cub (and everyone else at battlefields)", async () => {
    const game = await pack({ energy: 1 }).hand(P2, FLURRY_OF_BLADES, "fob").build();
    await game.p2.cast("fob");
    await game.settle();
    expect(game.state("cub").damage).toBe(1);
    expect(game.state("alpha").damage).toBe(1);
    expect(game.state("stray").damage).toBe(1);
  });

  test("enemy activated ABILITY: Iron Ballista is offered Alpha / Rival / Stray but never the Cub", async () => {
    const game = await pack({ energy: 0 }).gear(P2, IRON_BALLISTA, "bal").build();
    const refused = await game.p2.try((p) => p.activate("bal", undefined, { targets: "cub" }));
    expect(refused.ok).toBe(false);
    expect(game.state("bal").isExhausted).toBe(false); // nothing was paid for the refused activation
    expect(!refused.ok && refused.error.code).toBe("ILLEGAL_ARGS");
    const offered = game.p2.option("activate", "bal")?.fields.find((f) => f.arg === "targets")?.options ?? [];
    expect(offered).toEqual(expect.arrayContaining([["alpha"], ["rival"], ["stray"]]));
    expect(offered).not.toContainEqual(["cub"]);
    await game.p2.activate("bal", undefined, { targets: "rival" });
    await game.settle();
    expect(game.state("bal").isExhausted).toBe(true);
    expect(game.state("rival").damage).toBe(2);
    expect(game.state("cub").damage).toBe(0);
  });

  test("enemy triggered ABILITY: Solari Shieldbearer's 'stun a unit' cannot pick the Cub", async () => {
    const game = await pack({ energy: 3 }).hand(P2, SOLARI, "sol").build();
    await game.p2.play("sol");
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    const cards = d?.kind === "pick" ? d.options.map((o) => o.card) : [];
    expect(cards).not.toContain("cub");
    expect(cards).toEqual(expect.arrayContaining(["alpha", "rival", "stray", "sol"]));
    await game.p2.pick("stray");
    await game.settle();
    expect(game.state("stray").isStunned).toBe(true);
    expect(game.state("cub").isStunned).toBe(false);
  });

  test("Tank (815): a 5-Might attacker must pour all 5 into Alpha (not lethal) — the 2-Might Cub takes nothing; the attacker dies to 9", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "alpha")
      .unit(P1, "bf1", { might: 2, name: "Cub" }, "cub")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("alpha")).toBe("battlefield-bf1");
    expect(game.zoneOf("cub")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("Tank with overflow: a 9-Might attacker assigns 7 to Alpha first, then 2 kills the Cub; the defenders' 9 back is lethal too — everyone dies, bf1 becomes uncontrolled (466.5.b), nobody scores", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "alpha")
      .unit(P1, "bf1", { might: 2, name: "Cub" }, "cub")
      .unit(P2, "base", { might: 9, name: "Behemoth" }, "behemoth")
      .build();
    await game.p2.move("behemoth", "bf1");
    await game.settle();
    expect(game.zoneOf("alpha")).toBe("trash");
    expect(game.zoneOf("cub")).toBe("trash");
    expect(game.zoneOf("behemoth")).toBe("trash"); // 7 + 2 = 9 lethal
    expect(game.gameState.battlefields.bf1?.controller).toBeNull(); // no surviving attacker → no conquer
    expect(game.p2.points()).toBe(0);
    expect(game.p1.points()).toBe(0);
  });

  test("in the base: 'here' covers P1's base too — an enemy 'stun a unit' cannot pick the small unit sharing Alpha's base, but can pick one at a battlefield", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", CARD, "alpha")
      .unit(P1, "base", { might: 2, name: "Cub" }, "cub")
      .unit(P1, "bf1", { might: 2, name: "Stray" }, "stray")
      .unit(P2, "base", { might: 1, name: "Theirs" }, "theirs") // an ENEMY small unit in P2's base is not "your unit"
      .hand(P2, SOLARI, "sol")
      .build();
    await game.p2.play("sol");
    await game.settle();
    const d = game.decision();
    const cards = d?.kind === "pick" ? d.options.map((o) => o.card) : [];
    expect(cards).not.toContain("cub");
    expect(cards).toEqual(expect.arrayContaining(["alpha", "stray", "theirs", "sol"]));
  });

  test("registry payload matches the printed text: Tank keyword + a static 'untargetable-by-enemy-spells-abilities' restriction over friendly units here with mightLessThanSelf", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 6, might: 7, name: "Alpha Wildclaw", powerCost: ["calm", "calm"] });
    expect(def?.abilities).toEqual([
      { keyword: "Tank", type: "keyword" },
      {
        effect: {
          restriction: "untargetable-by-enemy-spells-abilities",
          target: { controller: "friendly", filter: { mightLessThanSelf: true }, location: "here", type: "unit" },
          type: "restriction",
        },
        type: "static",
      },
    ]);
  });
});

