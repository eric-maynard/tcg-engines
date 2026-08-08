/**
 * Irelia, Fervent — ven-174-166 · Champion Unit · Calm · 5 energy · 4 Might · Irelia
 *
 *   [Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *   When you choose or ready me, give me +1 [Might] this turn.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. 383.4.b — "When you choose me" is a Targeting Effect: it lands on the chain right after YOUR spell
 *     OR ABILITY that targets her is finalized, above it, so it resolves first (+1 before the spell acts).
 *     Abilities count too (Heart of Dark Ice), and so does being chosen for the HARMFUL half of a spell
 *     (Defiant Dance's −2 on her is still "you choose me": +1 −2 = 3).
 *  2. 158.3 ordering inside ONE spell — Last Breath ("Ready a friendly unit. It deals damage equal to its
 *     Might…") on an exhausted Irelia: choose-trigger resolves first (5), the ready happens mid-resolution
 *     but its trigger must wait until Last Breath finishes, so she hits for exactly 5 (a 6-Might enemy
 *     survives on 5 damage, a 5-Might one dies) and only then goes to 6.
 *  3. "you" = her controller. An opponent choosing her pays Deflect — 1 extra power of ANY domain
 *     (809.1.c.1), for spells AND abilities — and grants no +1: enemy Void Seeker's 4 is exactly lethal.
 *     Her controller answering with Discipline in the same chain gives +1 +2 first and she lives.
 *  4. Awaken readying is "you ready me" (an exhausted Irelia starts your turn at 5); entering play from
 *     hand or from the champion zone, moving, and being attacked are none of "choose"/"ready".
 *  5. "this turn" expires at end of turn; marked damage heals at end of turn too.
 *  6. Cost 5, no power; 4 energy is short.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-174-166";
const DISCIPLINE = "ogn-058-298"; // Calm Reaction · 2 · Give a unit +2 Might this turn. Draw 1.
const HEART = "sfd-052-221"; // Calm gear · [Exhaust]: Give a unit +3 Might this turn.
const DANCE = "sfd-196-221"; // Calm/Chaos Reaction · 1+[rainbow] · +2 to a unit and −2 to another unit this turn.
const LAST_BREATH = "ogn-260-298"; // Calm Action · 3+[rainbow][rainbow] · Ready a friendly unit. It deals damage equal to its Might to an enemy unit at a battlefield.
const VOID_SEEKER = "ogn-024-298"; // Fury Action · 3+[fury] · Deal 4 to a unit at a battlefield. Draw 1.

/** Pass priority / take forced picks until the open main phase (answers single-target picks itself). */
async function drain(game: Game): Promise<void> {
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      return;
    }
    if ((await game.settle()).reason === "unanswered") {
      return;
    }
  }
}

describe("Irelia, Fervent (ven-174-166)", () => {
  test("costs 5 energy (no power): enters base exhausted as a 4-Might Deflect champion, choosing/readying nothing (no chain); 4 energy is short", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "ire").build();
    await game.p1.play("ire");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.zoneOf("ire")).toBe("base");
    expect(game.state("ire")).toMatchObject({ isExhausted: true, might: 4 });
    expect(game.state("ire").keywords).toContain("Deflect");
    expect((await scenario().resources(P1, { energy: 4, power: { calm: 3 } }).hand(P1, CARD, "ire").build()).p1.can("play", "ire")).toBe(false);
  });

  test("played from the champion zone for 5: still not a 'choose' or 'ready' — 4 Might, nothing triggered", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).champion(P1, CARD, "ire").build();
    await game.p1.playChampion("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toHaveLength(0);
    await drain(game);
    expect(game.zoneOf("ire")).toBe("base");
    expect(game.state("ire")).toMatchObject({ isExhausted: true, might: 4, mightModifier: 0 });
  });

  test("your spell choosing her: trigger sits ABOVE Discipline and resolves first (5), then the spell (+2 → 7); no Deflect tax for her controller; all gone next turn", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "ire").hand(P1, DISCIPLINE, "disc").build();
    await game.p1.cast("disc", { targets: "ire" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain().map((c) => [c.name, c.triggered])).toEqual([
      ["Discipline", false],
      ["Irelia, Fervent", true],
    ]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain().map((c) => c.name)).toEqual(["Discipline"]);
    expect(game.state("ire").might).toBe(5);
    await game.settle();
    expect(game.state("ire").might).toBe(7);
    await game.advanceTurn();
    expect(game.state("ire").might).toBe(4);
  });

  test("your ACTIVATED ABILITY choosing her also counts (383.4.b.2): Heart of Dark Ice → +1 then +3 = 8", async () => {
    const game = await scenario().unit(P1, "base", CARD, "ire").gear(P1, HEART, "heart").build();
    await game.p1.activate("heart");
    expect(game.chain().map((c) => c.name)).toEqual(["Heart of Dark Ice", "Irelia, Fervent"]);
    expect(game.state("heart").isExhausted).toBe(true);
    await drain(game);
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("ire");
      await drain(game);
    }
    expect(game.state("ire").might).toBe(8);
  });

  test("chosen for the HARMFUL half still triggers: Defiant Dance +2 on a pal / −2 on Irelia → pal 4, Irelia 4 +1 −2 = 3", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { rainbow: 1 } })
      .unit(P1, "base", CARD, "ire")
      .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
      .hand(P1, DANCE, "dance")
      .build();
    await game.p1.cast("dance", { targets: ["pal", "ire"] });
    expect(game.chain().map((c) => c.name)).toEqual(["Defiant Dance", "Irelia, Fervent"]);
    await drain(game);
    expect(game.state("pal").might).toBe(4);
    expect(game.state("ire").might).toBe(3);
  });

  test("158.3 — Last Breath on an EXHAUSTED Irelia: +1 from choose (5) → readied and strikes for exactly 5 (6-Might enemy survives on 5 damage) → ready-trigger afterwards → 6 and ready", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { rainbow: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "ire", { exhausted: true })
      .unit(P2, "bf1", { might: 6, name: "Six" }, "six")
      .hand(P1, LAST_BREATH, "lb")
      .build();
    await game.p1.cast("lb", { targets: ["ire", "six"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain().map((c) => c.name)).toEqual(["Last Breath", "Irelia, Fervent"]);
    await drain(game);
    expect(game.zoneOf("six")).toBe("battlefield-bf1");
    expect(game.state("six").damage).toBe(5); // not 4 (choose bonus counted), not 6 (ready bonus came later)
    expect(game.state("ire")).toMatchObject({ isReady: true, might: 6 });
    expect(game.chain()).toHaveLength(0);
  });

  test("…and the same line into a 5-Might enemy is exactly lethal", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { rainbow: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "ire", { exhausted: true })
      .unit(P2, "bf1", { might: 5, name: "Five" }, "five")
      .hand(P1, LAST_BREATH, "lb")
      .build();
    await game.p1.cast("lb", { targets: ["ire", "five"] });
    await drain(game);
    expect(game.zoneOf("five")).toBe("trash");
    expect(game.state("ire")).toMatchObject({ isReady: true, might: 6 });
  });

  test("Deflect vs an opponent's spell: unpayable without a spare power; payable with ANY domain (809.1.c.1); no 'you choose' trigger for them → Void Seeker's 4 is exactly lethal", async () => {
    const broke = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ire")
      .hand(P2, VOID_SEEKER, "vs")
      .build();
    expect(broke.p2.can("cast", "vs")).toBe(false);
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { chaos: 1, fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ire")
      .hand(P2, VOID_SEEKER, "vs")
      .build();
    await game.p2.cast("vs", { targets: "ire" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 0 } });
    expect(game.chain().map((c) => c.name)).toEqual(["Void Seeker"]);
    await game.settle();
    expect(game.zoneOf("ire")).toBe("trash");
  });

  test("Deflect also taxes an opponent's ABILITY: their Heart of Dark Ice cannot pick her with an empty pool; with 1 power it can, pays it, and she gets +3 only (7, no +1)", async () => {
    const dry = await scenario().active(P2).unit(P1, "base", CARD, "ire").gear(P2, HEART, "heart").build();
    expect(dry.p2.can("activate", "heart")).toBe(false);
    const game = await scenario().active(P2).resources(P2, { power: { mind: 1 } }).unit(P1, "base", CARD, "ire").gear(P2, HEART, "heart").build();
    await game.p2.activate("heart");
    expect(game.chain().map((c) => c.name)).toEqual(["Heart of Dark Ice"]);
    expect(game.p2.power()).toBe(0);
    await drain(game);
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("ire");
      await drain(game);
    }
    expect(game.state("ire").might).toBe(7);
  });

  test("her controller answers the enemy Void Seeker with Discipline: chain [VS, Discipline, trigger] → +1, +2 → 7, then 4 damage — she survives; damage and bonuses are gone after the turn", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { fury: 2 } })
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ire")
      .hand(P2, VOID_SEEKER, "vs")
      .hand(P1, DISCIPLINE, "disc")
      .build();
    await game.p2.cast("vs", { targets: "ire" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("disc", { targets: "ire" });
    expect(game.chain().map((c) => c.name)).toEqual(["Void Seeker", "Discipline", "Irelia, Fervent"]);
    await drain(game);
    expect(game.zoneOf("ire")).toBe("battlefield-bf1");
    expect(game.state("ire")).toMatchObject({ damage: 4, might: 7 });
    await game.advanceTurn(); // P2's turn ends
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("ire")).toMatchObject({ damage: 0, might: 4 });
  });

  test("Awaken readying is 'you ready me': after conquering an empty battlefield (exhausted) she starts your NEXT turn at 5; the turn after that (already ready) she is 4", async () => {
    const game = await scenario().battlefield("bf1", { controller: null }).unit(P1, "base", CARD, "ire").build();
    await game.p1.move("ire", "bf1");
    await drain(game);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("ire")).toMatchObject({ isExhausted: true, might: 4 }); // moving is not choosing
    await game.advanceTurn(); // P2
    expect(game.state("ire").might).toBe(4);
    await game.advanceTurn(); // P1 — Awaken readied her → trigger → 5
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("ire")).toMatchObject({ isReady: true, might: 5 });
    await game.advanceTurn();
    await game.advanceTurn(); // P1 again — she was already ready: no ready event
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("ire").might).toBe(4);
  });

  test("negative space: being ATTACKED is not being chosen — a 4-Might attacker into a lone ready Irelia is an exact 4-vs-4 trade", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ire")
      .unit(P2, "base", { might: 4, name: "Attacker" }, "atk")
      .build();
    await game.p2.move("atk", "bf1");
    expect(game.chain()).toHaveLength(0);
    expect(game.state("ire").might).toBe(4);
    await game.settle();
    expect(game.zoneOf("ire")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("trash");
  });

  test("parsed abilities: Deflect 1 keyword + a self 'choose-or-ready' trigger giving +1 Might for the turn; champion with the Irelia tag", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 5, isChampion: true, might: 4, name: "Irelia, Fervent", tags: ["Irelia"] });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({ keyword: "Deflect", type: "keyword", value: 1 });
    expect(def?.abilities?.[1]).toMatchObject({
      effect: { amount: 1, duration: "turn", target: "self", type: "modify-might" },
      trigger: { event: "choose-or-ready", on: "self" },
      type: "triggered",
    });
  });
});
