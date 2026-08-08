/**
 * Vault Breaker — unl-010-219 · Spell · Fury · 1 energy + [fury]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Give a unit [Assault 2] and [Ganking] this turn. (+2 [Might] while it's an attacker. It can move
 *   from battlefield to battlefield.)
 *
 * Head-judge notes — the tricky spots for this card:
 *  1. Assault pays out ONLY under the Attacker designation (807.1.c/d): cast on a resting unit its
 *     Might does not change; cast mid-showdown on an attacker it is +2 at once; cast on a DEFENDER it
 *     does nothing for that fight (the classic misplay).
 *  2. Ganking (810) adds a battlefield→battlefield option to the STANDARD move: it still exhausts the
 *     unit, still needs it ready, and is still a main-phase action (144.1) — an exhausted unit gains
 *     the keyword but goes nowhere this turn.
 *  3. "this turn": both grants expire at end of turn (across game.advanceTurn) — the ganking option
 *     and the granted keywords are gone on the next turn.
 *  4. 807.2 summing: on Jinx, Demolitionist (printed Assault 2) it is Assault 4; two Vault Breakers
 *     on one unit make Assault 4 as well (Ganking twice is redundant, 810.2).
 *  5. Any unit is a legal target, including an enemy one; [Action] timing — own turn / showdown with
 *     Focus, never on the opponent's open turn, never onto an open chain. Cost 1 + [fury].
 *  6. The natural line: gank from your held battlefield into the enemy's and win the combat by
 *     exactly the +2 (3-Might ganker into a 4-Might defender: 5 ≥ 4, and 4 back < 5 survives).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-010-219";
const JINX = "ogn-030-298"; // Jinx, Demolitionist — 4 Might, printed [Assault 2]

/** P1 holds bf1 with a READY 3-Might unit; P2 holds bf2 with a 4-Might defender; P1 has 1 + fury and the spell. */
function board(energy = 1, fury = 1) {
  return scenario()
    .resources(P1, { energy, power: { fury } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Ganker" }, "ganker")
    .unit(P2, "bf2", { might: 4, name: "Defender" }, "def")
    .unit(P2, "base", { might: 2, name: "Homebody" }, "home")
    .hand(P1, CARD, "vb");
}

describe("Vault Breaker (unl-010-219)", () => {
  test("cost 1 energy + 1 fury; resolves granting Assault 2 and Ganking (duration: turn); Might at rest is unchanged; spell to trash", async () => {
    const game = await board().build();
    await game.p1.cast("vb", { targets: "ganker" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.zoneOf("vb")).toBe("trash");
    expect(game.state("ganker").grantedKeywords).toEqual(
      expect.arrayContaining([
        { duration: "turn", keyword: "Assault", value: 2 },
        expect.objectContaining({ duration: "turn", keyword: "Ganking" }),
      ]),
    );
    expect(game.state("ganker").grantedKeywords).toHaveLength(2);
    expect(game.state("ganker").might).toBe(3); // not an attacker → no bonus yet
  });

  test("unaffordable with 1 energy and no fury, or fury and 0 energy; a rainbow power covers the pip", async () => {
    expect((await board(1, 0).build()).p1.can("cast", "vb")).toBe(false);
    expect((await board(0, 1).build()).p1.can("cast", "vb")).toBe(false);
    const rainbow = await board(1, 0).resources(P1, { power: { rainbow: 1 } }).build();
    expect(rainbow.p1.can("cast", "vb")).toBe(true);
  });

  test("Ganking: before the spell the bf1 unit may only walk home; afterwards a battlefield→battlefield move to bf2 is legal, exhausts it, and opens combat", async () => {
    const game = await board().build();
    expect(game.p1.can("gank", "ganker")).toBe(false);
    expect(game.p1.legal().filter((o) => o.verb === "move").map((o) => o.key)).toEqual(["standardMove:to:base"]);
    await game.p1.cast("vb", { targets: "ganker" });
    await game.settle();
    expect(game.p1.can("gank", "ganker")).toBe(true);
    await game.p1.gank("ganker", "bf2");
    expect(game.locationOf("ganker")).toBe("bf2");
    expect(game.state("ganker").isExhausted).toBe(true); // still a Standard Move: exhaust is the cost (144.2)
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.state("ganker").combatRole).toBe("attacker");
  });

  test("the full line: gank into the 4-Might defender — Assault 2 makes it 5: the defender dies, 4 back is not lethal on 5, P1 conquers bf2 and loses bf1", async () => {
    const game = await board().build();
    await game.p1.cast("vb", { targets: "ganker" });
    await game.settle();
    await game.p1.gank("ganker", "bf2");
    expect(game.state("ganker").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("ganker")).toBe("battlefield-bf2");
    expect(game.state("ganker").damage).toBe(0); // healed at combat cleanup
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull(); // 190.4.c — nobody left at bf1
    expect(game.violations()).toEqual([]);
  });

  test("control case without the spell: the same 3-Might unit walking in from base loses to the 4-Might defender", async () => {
    const game = await scenario()
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Walker" }, "walker")
      .unit(P2, "bf2", { might: 4, name: "Defender" }, "def")
      .build();
    await game.p1.move("walker", "bf2");
    expect(game.state("walker").might).toBe(3);
    await game.settle();
    expect(game.zoneOf("walker")).toBe("trash");
    expect(game.zoneOf("def")).toBe("battlefield-bf2");
  });

  test("cast mid-showdown on your ATTACKER: +2 immediately (2-Might attacker → 4) and it now trades with the 4-Might defender instead of bouncing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Small" }, "small")
      .unit(P2, "bf2", { might: 4, name: "Defender" }, "def")
      .hand(P1, CARD, "vb")
      .build();
    await game.p1.move("small", "bf2");
    expect(game.state("small").might).toBe(2);
    await game.p1.cast("vb", { targets: "small" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("small")).toMatchObject({ combatRole: "attacker", might: 4 });
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash"); // 4 ≥ 4
    expect(game.zoneOf("small")).toBe("trash"); // 4 back ≥ 4
  });

  test("negative space: cast on your DEFENDER during the opponent's attack — Assault does nothing for a defender, it still dies 3 vs 4", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .hand(P1, CARD, "vb")
      .build();
    expect(game.p1.can("cast", "vb")).toBe(false); // opponent's open turn: an Action cannot be played
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("vb", { targets: "holder" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("holder")).toMatchObject({ combatRole: "defender", might: 3 });
    expect(game.state("holder").keywords).toEqual(expect.arrayContaining(["Assault", "Ganking"]));
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-bf1"); // 3 < 4
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("'this turn' expiry: after the turn passes the keywords are gone and, back on P1's turn, the (readied) unit can no longer gank", async () => {
    const game = await board().build();
    await game.p1.cast("vb", { targets: "ganker" });
    await game.settle();
    expect(game.state("ganker").keywords).toEqual(expect.arrayContaining(["Assault", "Ganking"]));
    await game.advanceTurn(); // → P2
    expect(game.state("ganker").grantedKeywords).toEqual([]);
    expect(game.state("ganker").keywords).not.toContain("Ganking");
    await game.advanceTurn(); // → P1 again; the unit is ready
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("ganker").isReady).toBe(true);
    expect(game.p1.can("gank", "ganker")).toBe(false);
    expect(game.p1.legal().some((o) => o.key === "standardMove:to:bf2")).toBe(false);
  });

  test("Ganking does not waive the exhaust cost: an EXHAUSTED unit gets the keywords but has no move at all this turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Tired" }, "tired", { exhausted: true })
      .unit(P2, "bf2", { might: 1, name: "Defender" }, "def")
      .hand(P1, CARD, "vb")
      .build();
    await game.p1.cast("vb", { targets: "tired" });
    await game.settle();
    expect(game.state("tired").keywords).toContain("Ganking");
    expect(game.p1.can("gank", "tired")).toBe(false);
    expect(game.p1.legal().filter((o) => o.verb === "move" || o.verb === "gank")).toEqual([]);
  });

  test("807.2 summing with printed Assault: Jinx, Demolitionist (4, Assault 2) + Vault Breaker attacks as 4 + 2 + 2 = 8", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", JINX, "jinx")
      .unit(P2, "bf2", { might: 7, name: "Wall" }, "wall")
      .hand(P1, CARD, "vb")
      .build();
    await game.p1.cast("vb", { targets: "jinx" });
    await game.settle();
    expect(game.state("jinx").might).toBe(4);
    await game.p1.move("jinx", "bf2");
    expect(game.state("jinx").might).toBe(8);
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash"); // 8 ≥ 7
    expect(game.zoneOf("jinx")).toBe("battlefield-bf2"); // 7 < 8
  });

  test("two Vault Breakers on one unit: Assault 2 + 2 = 4 (a 1-Might attacker swings for 5); Ganking twice is merely redundant", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 1, name: "Tiny" }, "tiny")
      .unit(P2, "bf2", { might: 5, name: "Wall" }, "wall")
      .hand(P1, CARD, "vb1")
      .hand(P1, CARD, "vb2")
      .build();
    await game.p1.cast("vb1", { targets: "tiny" });
    await game.settle();
    await game.p1.cast("vb2", { targets: "tiny" });
    await game.settle();
    expect(game.state("tiny").grantedKeywords.filter((g) => g.keyword === "Assault").reduce((s, g) => s + (g.value ?? 1), 0)).toBe(4);
    await game.p1.gank("tiny", "bf2");
    expect(game.state("tiny").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash"); // 5 ≥ 5
    expect(game.zoneOf("tiny")).toBe("trash"); // 5 back ≥ 5
  });

  test("any unit is a legal target — even an enemy one (they get the keywords, you get nothing); base and battlefield units alike are offered", async () => {
    const game = await board().build();
    const offered = game.p1.option("cast", "vb")?.fields.find((f) => f.arg === "targets")?.options;
    expect(offered).toEqual(expect.arrayContaining([["ganker"], ["def"], ["home"]]));
    expect(offered).toHaveLength(3);
    await game.p1.cast("vb", { targets: "def" });
    await game.settle();
    expect(game.state("def").keywords).toEqual(expect.arrayContaining(["Assault", "Ganking"]));
    expect(game.state("ganker").grantedKeywords).toEqual([]);
  });

  test("[Action] timing: fine inside your own showdown with Focus, but never onto an open chain (it is not a Reaction)", async () => {
    const game = await board(2, 2).hand(P1, CARD, "vb2").unit(P1, "base", { might: 1, name: "Scout" }, "scout").build();
    await game.p1.move("scout", "bf2");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.p1.cast("vb", { targets: "scout" });
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("cast", "vb2")).toBe(false);
    await game.p1.passPriority();
    expect(game.p2.legal().map((o) => o.verb)).toEqual(expect.not.arrayContaining(["cast"]));
  });

  test("parsed abilities match the printed text: Action spell; sequence [grant Assault 2 (turn), grant Ganking (turn)] to one chosen unit", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "fury", energyCost: 1, powerCost: ["fury"], timing: "action" });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({
      effect: {
        effects: [
          { duration: "turn", keyword: "Assault", target: { type: "unit" }, type: "grant-keyword", value: 2 },
          { duration: "turn", keyword: "Ganking", target: { type: "unit" }, type: "grant-keyword" },
        ],
        type: "sequence",
      },
      timing: "action",
      type: "spell",
    });
  });
});
