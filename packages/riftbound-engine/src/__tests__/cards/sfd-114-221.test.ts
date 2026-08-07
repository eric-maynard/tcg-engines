/**
 * Marching Orders — sfd-114-221 · Spell · Body · 3 energy (no power)
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   [Repeat] [3] (You may pay the additional cost to repeat this spell's effect.)
 *   Choose a friendly unit anywhere and an enemy unit at a battlefield. They deal damage equal to
 *   their Mights to each other.
 *
 * Head-judge notes (the tricky spots this file covers):
 *  1. Asymmetric targeting: the FRIENDLY unit may be anywhere (base or any battlefield, not
 *     necessarily the enemy's); the ENEMY unit must be at a battlefield — enemies in a base are never
 *     legal. Both choices are mandatory (355.8): no enemy at a battlefield → not castable at all.
 *  2. The units are the damage sources (417.6.b.3) and use CURRENT Might (buffs, Assault while the
 *     friendly unit is an attacker in the ongoing combat).
 *  3. Deaths wait for the Cleanup after the spell leaves the chain (142.4.a, 319.5, 323.5). So with
 *     [Repeat] on the SAME pair both exchanges happen while both units still stand: a friendly 4 into
 *     an enemy 3 survives a single cast (3 dmg) but dies to the repeated one (6 ≥ 4).
 *  4. [Repeat] [3] is an optional additional cost (820): 6 energy total, one chain item, refused when
 *     unaffordable while the plain cast stays legal.
 *  5. [Action] timing: own turn in Neutral Open, or with Focus in a showdown (incl. the opponent's
 *     combat) — never on the opponent's turn outside a showdown, never onto a Closed chain.
 *  6. Parser status: the friendly side came out with a bogus `filter: { tag: "Unit Anywhere" }`, so no
 *     friendly unit ever qualifies and the spell is uncastable today → most clauses are BUG tests.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-114-221";
const LUCIAN = "sfd-028-221"; // 2-Might Fury champion with [Assault] (+1 while attacking)

function board(energy = 3) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "base", { might: 4, name: "Brawler" }, "brawler")
    .unit(P1, "bf2", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "bf1", { might: 3, name: "Raider" }, "raider")
    .unit(P2, "bf1", { might: 4, name: "Twin" }, "twin")
    .unit(P2, "base", { might: 6, name: "Giant" }, "giant")
    .hand(P1, CARD, "mo");
}

const targetPairs = (game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>) =>
  (game.p1.option("cast", "mo")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];

describe("Marching Orders (sfd-114-221)", () => {
  test("parsed (the parts that came out right): an [Action]-timed fight spell with Repeat [3] whose enemy side is 'enemy unit at a battlefield'", async () => {
    const card = (await import("../../../../riftbound-cards/src/data/all-cards")).getAllCards().find((c) => c.id === CARD) as unknown as { timing: string; abilities: Record<string, unknown>[] };
    expect(card.timing).toBe("action");
    expect(card.abilities).toHaveLength(1);
    expect(card.abilities[0]).toMatchObject({
      effect: { defender: { controller: "enemy", location: "battlefield", type: "unit" }, type: "fight" },
      repeat: { energy: 3 },
      timing: "action",
      type: "spell",
    });
  });

  test("parsed friendly side should be a plain friendly unit with no location limit — not a `tag: \"Unit Anywhere\"` filter", async () => {
    const card = (await import("../../../../riftbound-cards/src/data/all-cards")).getAllCards().find((c) => c.id === CARD) as unknown as { abilities: { effect: { attacker: Record<string, unknown> } }[] };
    const attacker = card.abilities[0]!.effect.attacker;
    expect(attacker).toMatchObject({ controller: "friendly", type: "unit" });
    expect(attacker.filter).toBeUndefined();
    expect(attacker.location ?? "anywhere").not.toBe("battlefield");
  });

  test("cost — castable for 3 energy (no power), all 3 deducted, one chain item; with 2 energy it is not castable", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "mo")).toBe(true);
    await game.p1.cast("mo", { targets: ["brawler", "raider"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mo", controller: P1, triggered: false })]);
    expect((await board(2).build()).p1.can("cast", "mo")).toBe(false);
  });

  test("a friendly 4 in BASE and an enemy 3 at bf1 hit each other — Raider dies, Brawler keeps 3 damage, spell to trash", async () => {
    const game = await board().build();
    await game.p1.cast("mo", { targets: ["brawler", "raider"] });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("brawler")).toBe("base");
    expect(game.state("brawler").damage).toBe(3);
    expect(game.state("twin").damage).toBe(0);
    expect(game.zoneOf("mo")).toBe("trash");
  });

  test("'friendly unit ANYWHERE' — a friendly unit at a DIFFERENT battlefield (bf2) may fight an enemy at bf1; the smaller friendly dies, the enemy keeps 2", async () => {
    const game = await board().build();
    await game.p1.cast("mo", { targets: ["scout", "twin"] });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.locationOf("twin")).toBe("bf1");
    expect(game.state("twin").damage).toBe(2);
  });

  test("legal pairs = {brawler, scout} × {raider, twin}; the enemy Giant in its base is never offered and choosing it is refused", async () => {
    const game = await board().build();
    const pairs = targetPairs(game);
    expect(pairs).toHaveLength(4);
    expect(pairs).toEqual(expect.arrayContaining([["brawler", "raider"], ["brawler", "twin"], ["scout", "raider"], ["scout", "twin"]]));
    expect(pairs.some((p) => p.includes("giant"))).toBe(false);
    const t = await game.p1.try((p) => p.cast("mo", { targets: ["brawler", "giant"] }));
    expect(t.ok).toBe(false);
    const ff = await game.p1.try((p) => p.cast("mo", { targets: ["brawler", "scout"] }));
    expect(ff.ok).toBe(false);
    expect(game.zoneOf("mo")).toBe("hand");
  });

  test("both choices are mandatory (355.8): with every enemy unit sitting in a base — or with no friendly unit — the spell is not castable", async () => {
    const noEnemyAtBf = await scenario().resources(P1, { energy: 6 }).battlefield("bf1", { controller: P2 }).unit(P1, "bf1", { might: 4 }, "mine").unit(P2, "base", { might: 1 }, "home").hand(P1, CARD, "mo").build();
    expect(noEnemyAtBf.p1.can("cast", "mo")).toBe(false);
    const noFriendly = await scenario().resources(P1, { energy: 6 }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 1 }, "foe").hand(P1, CARD, "mo").build();
    expect(noFriendly.p1.can("cast", "mo")).toBe(false);
  });

  test("equal Mights trade — Brawler (4) and Twin (4) both die", async () => {
    const game = await board().build();
    await game.p1.cast("mo", { targets: ["brawler", "twin"] });
    await game.settle();
    expect(game.zoneOf("brawler")).toBe("trash");
    expect(game.zoneOf("twin")).toBe("trash");
  });

  test("current Might counts — a buffed Brawler (5) deals 5: Twin (4) dies and Brawler survives with 4", async () => {
    const game = await board().unit(P1, "base", { might: 4, name: "Pumped" }, "pumped", { buffed: true }).build();
    expect(game.state("pumped").might).toBe(5);
    await game.p1.cast("mo", { targets: ["pumped", "twin"] });
    await game.settle();
    expect(game.zoneOf("twin")).toBe("trash");
    expect(game.zoneOf("pumped")).toBe("base");
    expect(game.state("pumped").damage).toBe(4);
  });

  test("[Repeat] [3] on the SAME pair — 6 energy, one chain item, two exchanges before any death check: Raider takes 8, Brawler takes 6 ≥ 4 and dies too (142.4.a / 319.5)", async () => {
    const game = await board(6).build();
    await game.p1.cast("mo", { repeat: 1, targets: ["brawler", "raider"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("brawler")).toBe("trash");
    expect(game.zoneOf("mo")).toBe("trash");
  });

  test("[Repeat] must be affordable — with 5 energy the repeated cast is refused (nothing spent) while the plain cast goes through", async () => {
    const game = await board(5).build();
    const r = await game.p1.try((p) => p.cast("mo", { repeat: 1, targets: ["brawler", "raider"] }));
    expect(r.ok).toBe(false);
    expect(game.p1.energy()).toBe(5);
    expect(game.zoneOf("mo")).toBe("hand");
    await game.p1.cast("mo", { targets: ["brawler", "raider"] });
    expect(game.p1.energy()).toBe(2);
    expect(game.zoneOf("mo")).toBe("chain");
  });

  test("[Action] timing — legal with Focus in your own combat showdown; there an attacking Lucian (2 + Assault = 3) deals 3, killing Raider before combat damage", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Raider" }, "raider")
      .unit(P1, "base", LUCIAN, "lucian")
      .hand(P1, CARD, "mo")
      .build();
    await game.p1.move("lucian", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Lucian's own trigger: 1 to Raider
    if (game.decision()?.kind === "pick") await game.p1.pick("raider");
    expect(game.state("raider").damage).toBe(1);
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "mo")).toBe(true);
    await game.p1.cast("mo", { targets: ["lucian", "raider"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("raider")).toBe("trash"); // 1 + 3 ≥ 3
    expect(game.zoneOf("lucian")).toBe("trash"); // took 3 ≥ 3 (Assault Might is his lethal bar too)
  });

  test("[Action] timing — castable on your own turn in the open main phase, NOT on the opponent's turn outside a showdown", async () => {
    const mine = await board().build();
    expect(mine.p1.can("cast", "mo")).toBe(true);
    const theirs = await board().active(P2).build();
    expect(theirs.p1.can("cast", "mo")).toBe(false);
    const t = await theirs.p1.try((p) => p.cast("mo", { targets: ["brawler", "raider"] }));
    expect(t.ok).toBe(false);
  });

  test("[Action] in the OPPONENT's showdown — when P2 attacks bf2, P1 (defender) gains Focus after P2 passes and may cast it: Scout (2) and the 2-Might attacker trade before combat", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 2, name: "Scout" }, "scout")
      .unit(P2, "base", { might: 2, name: "Prowler" }, "prowler")
      .hand(P1, CARD, "mo")
      .build();
    await game.p2.move("prowler", "bf2");
    expect(game.p1.can("cast", "mo")).toBe(false); // attacker holds Focus first
    await game.p2.passFocus();
    expect(game.p1.can("cast", "mo")).toBe(true);
    await game.p1.cast("mo", { targets: ["scout", "prowler"] }); // Prowler is "at a battlefield" now
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("prowler")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBeNull();
  });
});
