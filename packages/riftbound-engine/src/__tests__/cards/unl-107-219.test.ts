/**
 * Stare Down — unl-107-219 · Spell · Body · 2 energy (no power) · no [Action]/[Reaction] → standard timing
 *
 *   Choose a friendly unit and a battlefield. Move all enemy units at that battlefield with less
 *   Might than the chosen unit to their base. Gain 1 XP.
 *
 * Rules: 155 (a spell without [Action]/[Reaction] is played only on your turn, Open state, no showdown),
 * 355.8 / 355.10 (choices — the friendly unit AND the battlefield — are made as the spell is played),
 * 359.3 (Might is compared on RESOLUTION: responses that shrink/kill the chosen unit change the outcome;
 * 359.3.e.2 a chosen unit that left play is no referent → nothing moves), 446 (a "move to base" is a
 * Move between board zones — damage/exhaustion ride along, 124.1 only clears on NON-board moves),
 * 190.4.c (a player with no units left at a battlefield loses control of it in the next Cleanup),
 * 730.1 (Gain XP), "less Might" is strict.
 *
 * Head-judge notes — the tricky spots this file covers:
 *  1. STRICTLY less: reference 4 → a 3 leaves, a 4 stays; reference 1 vs a 1 → nothing moves (XP still gained).
 *  2. Scope: only ENEMY units, only at THAT battlefield — friendly units there, enemies at the other
 *     battlefield and enemies in base are untouched; moved units land in their OWNER's base keeping
 *     damage and exhaustion (board → board move).
 *  3. Resolution-time Might: P2 reacts with a -2 on the chosen unit → fewer units move; P2 kills the
 *     chosen unit in response → nothing moves but the independent "Gain 1 XP" still happens.
 *  4. Emptying a battlefield strips P2's control at Cleanup (190.4.c) → P1 walks in and conquers it
 *     unopposed the same turn (the natural play pattern).
 *  5. Partners: Grim Resolve (unl-095, +3 this turn) raises the threshold first; the 1 XP flips
 *     Gemhand Hunter's [Level 6] +1 Might on at once (unl-094).
 *  6. Timing: not in a showdown, not on the opponent's turn; 2 energy flat; no friendly unit → uncastable.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-107-219";
const GRIM_RESOLVE = "unl-095-219"; // [Action] Give a friendly unit +3 [Might] this turn. …
const GEMHAND_HUNTER = "unl-094-219"; // 2-might [Hunt]; [Level 6] I have +1 [Might].
const SHRINK = {
  abilities: [{ effect: { amount: -2, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  name: "Shrink",
  timing: "reaction",
} as const;
const SNUFF = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  name: "Snuff",
  timing: "reaction",
} as const;

/** P1: Big(4) + Tiny(1) in base, 2 energy, Stare Down. P2: E3(3, exhausted, 1 dmg) + E4(4) at bf1, F1(1) at bf2, Home(1) in base. */
function board(energy = 2) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 4, name: "Big" }, "big")
    .unit(P1, "base", { might: 1, name: "Tiny" }, "tiny")
    .unit(P2, "bf1", { might: 3, name: "E3" }, "e3", { damage: 1, exhausted: true })
    .unit(P2, "bf1", { might: 4, name: "E4" }, "e4")
    .unit(P2, "bf2", { might: 1, name: "F1" }, "f1")
    .unit(P2, "base", { might: 1, name: "Home" }, "home")
    .hand(P2, SHRINK, "shrink")
    .hand(P2, SNUFF, "snuff")
    .hand(P1, CARD, "sd");
}

describe("Stare Down (unl-107-219)", () => {
  test("cost & main line: 2 energy; Big(4) + bf1 → E3 (3 < 4) goes to P2's base, E4 (4 = 4) stays; bf2/base enemies untouched; +1 XP; spell to trash", async () => {
    const game = await board().build();
    await game.p1.cast("sd", { targets: ["big", "bf1"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sd", controller: P1, triggered: false })]);
    expect(game.p1.xp()).toBe(0); // nothing before resolution
    await game.settle();
    expect(game.zoneOf("e3")).toBe("base");
    expect(game.state("e3")).toMatchObject({ controller: P2, owner: P2 });
    expect(game.p2.units("base")).toEqual(expect.arrayContaining(["e3", "home"]));
    expect(game.p1.units("base")).not.toContain("e3");
    expect(game.zoneOf("e4")).toBe("battlefield-bf1");
    expect(game.zoneOf("f1")).toBe("battlefield-bf2");
    expect(game.zoneOf("home")).toBe("base");
    expect(game.zoneOf("big")).toBe("base"); // the chosen unit itself never moves
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.xp()).toBe(0);
    expect(game.zoneOf("sd")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // E4 still holds it
    expect(game.violations()).toEqual([]);
  });

  test("board → board move: the bounced E3 keeps its 1 damage and stays exhausted (124.1 clears only on non-board moves)", async () => {
    const game = await board().build();
    await game.p1.cast("sd", { targets: ["big", "bf1"] });
    await game.settle();
    expect(game.state("e3")).toMatchObject({ damage: 1, isExhausted: true, zone: "base" });
  });

  test("strictly LESS: Tiny(1) as the reference at bf2 moves nothing (F1 is 1 = 1) — but the XP is still gained", async () => {
    const game = await board().build();
    await game.p1.cast("sd", { targets: ["tiny", "bf2"] });
    await game.settle();
    expect(game.zoneOf("f1")).toBe("battlefield-bf2");
    expect(game.zoneOf("e3")).toBe("battlefield-bf1");
    expect(game.p1.xp()).toBe(1);
    expect(game.zoneOf("sd")).toBe("trash");
  });

  test("the chosen unit must be FRIENDLY: only Big/Tiny are offered, an enemy is refused; with no friendly unit the spell cannot be cast; 1 energy is short", async () => {
    const game = await board().build();
    const offered = game.p1.option("cast", "sd")?.fields.find((f) => f.arg === "targets")?.options;
    // rule 355.8/355.10: unit AND battlefield are both play-time choices → one
    // option per (friendly unit × battlefield) pair; no enemy unit is offered.
    expect(offered).toHaveLength(4);
    expect(offered).toEqual(
      expect.arrayContaining([
        ["big", "bf1"],
        ["big", "bf2"],
        ["tiny", "bf1"],
        ["tiny", "bf2"],
      ]),
    );
    expect((await game.p1.try((p) => p.cast("sd", { targets: "e4" }))).ok).toBe(false);
    const lonely = await scenario().resources(P1, { energy: 2 }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 1 }, "e").hand(P1, CARD, "sd").build();
    expect(lonely.p1.can("cast", "sd")).toBe(false);
    expect((await board(1).build()).p1.can("cast", "sd")).toBe(false);
  });

  test("Might is read on RESOLUTION: P2 reacts with Shrink (-2) on Big → reference is 2 → E3 (3) and E2 (2) both stay, yet P1 still gains the XP", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 4, name: "Big" }, "big")
      .unit(P2, "bf1", { might: 3, name: "E3" }, "e3")
      .unit(P2, "bf1", { might: 2, name: "E2" }, "e2")
      .unit(P2, "bf1", { might: 1, name: "E1" }, "e1")
      .hand(P2, SHRINK, "shrink")
      .hand(P1, CARD, "sd")
      .build();
    await game.p1.cast("sd", { targets: ["big", "bf1"] });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("shrink", { targets: "big" });
    expect(game.chain().map((i) => i.name)).toEqual(["Stare Down", "Shrink"]); // Shrink resolves first (LIFO)
    await game.settle();
    expect(game.state("big").might).toBe(2);
    expect(game.zoneOf("e3")).toBe("battlefield-bf1");
    expect(game.zoneOf("e2")).toBe("battlefield-bf1");
    expect(game.zoneOf("e1")).toBe("base"); // 1 < 2 still goes
    expect(game.p1.xp()).toBe(1);
  });

  test("chosen unit KILLED in response (359.3.e.2): no referent → nobody moves, no re-choose prompt, but 'Gain 1 XP' is independent and still happens", async () => {
    const game = await board().build();
    await game.p1.cast("sd", { targets: ["big", "bf1"] });
    await game.p1.passPriority();
    await game.p2.cast("snuff", { targets: "big" });
    await game.settle();
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.zoneOf("e3")).toBe("battlefield-bf1");
    expect(game.zoneOf("e4")).toBe("battlefield-bf1");
    expect(game.p1.xp()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("emptying a battlefield: every enemy there is smaller → all bounce, P2 loses control at Cleanup (190.4.c), and Big walks in to conquer it unopposed (+1 point)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 4, name: "Big" }, "big")
      .unit(P2, "bf1", { might: 3, name: "E3" }, "e3")
      .unit(P2, "bf1", { might: 2, name: "E2" }, "e2")
      .hand(P1, CARD, "sd")
      .build();
    await game.p1.cast("sd", { targets: ["big", "bf1"] });
    await game.settle();
    expect(game.p2.units("base").sort()).toEqual(["e2", "e3"]);
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(0); // bouncing is not conquering
    await game.p1.move("big", "bf1");
    await game.settle();
    await game.settle(); // close the handed-back non-combat showdown, if any
    expect(game.locationOf("big")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("e3")).toBe("base"); // no fight happened
    expect(game.violations()).toEqual([]);
  });

  test("partner — Grim Resolve first (+3 this turn: Big 4 → 7), then Stare Down clears E4 (4), E3 (3) AND a 6 off bf1; a 7 stays", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 4, name: "Big" }, "big")
      .unit(P2, "bf1", { might: 3, name: "E3" }, "e3")
      .unit(P2, "bf1", { might: 4, name: "E4" }, "e4")
      .unit(P2, "bf1", { might: 6, name: "E6" }, "e6")
      .unit(P2, "bf1", { might: 7, name: "E7" }, "e7")
      .hand(P1, GRIM_RESOLVE, "grim")
      .hand(P1, CARD, "sd")
      .build();
    await game.p1.cast("grim", { targets: "big" });
    await game.settle();
    expect(game.state("big").might).toBe(7);
    await game.p1.cast("sd", { targets: ["big", "bf1"] });
    await game.settle();
    expect(game.p2.units("base").sort()).toEqual(["e3", "e4", "e6"]);
    expect(game.zoneOf("e7")).toBe("battlefield-bf1");
    expect(game.p1.xp()).toBe(1);
  });

  test("partner — the 1 XP is banked on resolution and flips Gemhand Hunter's [Level 6] on at once: 5 XP (2 might) → 6 XP (3 might)", async () => {
    const game = await scenario()
      .xp(P1, 5)
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", GEMHAND_HUNTER, "hunter")
      .unit(P2, "bf1", { might: 1, name: "E1" }, "e1")
      .hand(P1, CARD, "sd")
      .build();
    expect(game.state("hunter").might).toBe(2);
    await game.p1.cast("sd", { targets: ["hunter", "bf1"] });
    expect(game.state("hunter").might).toBe(2); // still on the chain
    await game.settle();
    expect(game.p1.xp()).toBe(6);
    expect(game.state("hunter").might).toBe(3);
    expect(game.zoneOf("e1")).toBe("base"); // 1 < 2 (compared before the level-up? either way 1 < 2 ≤ 3)
  });

  test("XP persists: the gained XP is still there on the opponent's turn and on P1's next turn", async () => {
    const game = await board().build();
    await game.p1.cast("sd", { targets: ["big", "bf1"] });
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.xp()).toBe(1);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.xp()).toBe(1);
  });

  test("standard timing (155): not castable with Focus in a showdown, nor on the opponent's turn — even while holding priority on their spell", async () => {
    const game = await board(4).build();
    await game.p1.move("tiny", "bf2");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "sd")).toBe(false);
    expect((await game.p1.try((p) => p.cast("sd", { targets: "big" }))).ok).toBe(false);

    const opp = await board().active(P2).resources(P2, { energy: 0 }).build();
    expect(opp.p1.can("cast", "sd")).toBe(false);
    await opp.p2.cast("shrink", { targets: "big" });
    await opp.p2.passPriority();
    expect(opp.actingSeat()).toBe(P1);
    expect(opp.p1.can("cast", "sd")).toBe(false);
  });

  test("the battlefield is a play-time choice (355.8/355.10) — cast(sd, {targets:[unit, battlefield]}) binds both so P2 responds knowing the battlefield", async () => {
    const game = await board().build();
    const fields = game.p1.option("cast", "sd")?.fields ?? [];
    expect(fields.some((f) => (f.options ?? []).some((o) => JSON.stringify(o).includes("bf1")))).toBe(true);
    await game.p1.cast("sd", { targets: ["big", "bf1"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action" }); // nothing left to ask
    expect(game.zoneOf("e3")).toBe("base");
  });

  test("registry payload matches the print: a 2-cost Body spell, no power, standard timing; ONE spell ability = sequence[move enemy units (all) from the chosen battlefield vs a friendly reference → base, gain-xp 1]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "body", energyCost: 2, name: "Stare Down", timing: "standard" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: {
        effects: [
          {
            from: "chosen-battlefield",
            reference: { controller: "friendly", type: "unit" },
            target: { controller: "enemy", quantity: "all", type: "unit" },
            to: "base",
            type: "move",
          },
          { amount: 1, type: "gain-xp" },
        ],
        type: "sequence",
      },
      type: "spell",
    });
  });
});
