/**
 * Eclipse — unl-063-219 · Spell · Mind · 3 energy (no power)
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Give a unit -4 [Might] this turn.
 *   [Predict]. (Look at the top card of your Main Deck. You may recycle it.)
 *
 * Rules: 813 (Reaction: with priority on any chain / any player's turn / showdowns), 355.6 ("a unit" —
 * any unit anywhere on the board), 143.2.a (non-zero damage ≥ Might kills, checked continuously — the
 * Frigid Touch example in 142.4.b), 143.2.b/.b.1 (Might below 0 is treated as 0 for combat/abilities
 * but is NOT 0: later increases add to the real negative value), 142.4.b (a 0-Might unit needs ≥1
 * damage to die), 436 (Predict: look at the top card, may recycle it; too few cards → no Burn Out),
 * 517.2 ("this turn" expires in the Ending Step).
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. -4 on a DAMAGED unit is a kill: 5 Might carrying 2 damage → 1 Might with 2 damage → dies now.
 *   2. -4 below zero: a 3-Might unit is really -1 (a later +2 makes it 1, not 2), contributes 0 combat
 *      damage, does not die on its own with 0 damage, but dies to a single point of damage.
 *   3. Reaction in the opponent's combat showdown: shrinking a 5-Might attacker to 1 flips the fight for
 *      a 3-Might defender.
 *   4. Two-item chain: Eclipse cast on top of a pending "deal 2" resolves FIRST (LIFO), so the 2 damage
 *      then lands on a 1-Might unit and kills it.
 *   5. Predict is the caster's own deck, after the Might change, optional (decline keeps the top card;
 *      accept sends it to the bottom); with an empty deck nothing breaks and nobody scores a Burn Out.
 *   6. "this turn" wears off at the next turn; no unit on the board → not castable; 2 energy → no.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-063-219";

const TOP_A = { cardType: "spell", energyCost: 9, name: "Top Card A" };
const TOP_B = { cardType: "spell", energyCost: 9, name: "Top Card B" };
const ZAP2 = { abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, type: "spell" }], cardType: "spell", energyCost: 0, name: "Zap Two" };
const PING1 = { abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, type: "spell" }], cardType: "spell", energyCost: 0, name: "Ping One" };
const PLUS2 = {
  abilities: [{ effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" }, type: "spell" }],
  cardType: "spell",
  energyCost: 0,
  name: "Plus Two",
};

/** P1 to act with Eclipse in hand, 3 energy, units of both sides in bases and at battlefields, known top cards a, b. */
function board(energy = 3) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
    .unit(P1, "bf2", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "bf1", { might: 6, name: "Giant" }, "giant")
    .unit(P2, "base", { might: 5, name: "Homebody" }, "home")
    .deckTop(P1, TOP_A, "a")
    .deckTop(P1, TOP_B, "b")
    .hand(P1, CARD, "eclipse");
}

describe("Eclipse (unl-063-219)", () => {
  test("parsed abilities match the printed text: a Reaction spell = sequence[-4 Might this turn on a unit, Predict 1]; 3 energy, no power", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "mind", energyCost: 3, name: "Eclipse", timing: "reaction" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      {
        effect: {
          effects: [
            { amount: -4, duration: "turn", target: { type: "unit" }, type: "modify-might" },
            { amount: 1, type: "predict" },
          ],
          type: "sequence",
        },
        timing: "reaction",
        type: "spell",
      },
    ]);
  });

  test("cost + clause 1: 3 energy; any unit on the board is a legal target; the 6-Might Giant becomes 2 this turn and is 6 again next turn", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "eclipse")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(4);
    expect(targets).toEqual(expect.arrayContaining([["ally"], ["scout"], ["giant"], ["home"]]));
    await game.p1.cast("eclipse", { targets: "giant" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.decline(); // Predict: keep the top card
      await game.settle();
    }
    expect(game.state("giant")).toMatchObject({ baseMight: 6, might: 2, zone: "battlefield-bf1" });
    expect(game.zoneOf("eclipse")).toBe("trash");
    await game.advanceTurn();
    expect(game.state("giant").might).toBe(6);
    expect((await board(2).build()).p1.can("cast", "eclipse")).toBe(false);
  });

  test("no unit anywhere → not castable (a targeted spell needs a legal target)", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "eclipse").build();
    expect(game.p1.can("cast", "eclipse")).toBe(false);
  });

  test("clause 2 — Predict looks at the CASTER's top card after the Might change: declining leaves 'a' on top, P2's deck is never touched", async () => {
    const game = await board().build();
    expect(game.p1.deck().slice(0, 2)).toEqual(["a", "b"]);
    const p2Top = game.p2.deck()[0];
    await game.p1.cast("eclipse", { targets: "home" });
    await game.settle();
    expect(game.state("home").might).toBe(1); // the Might change already happened
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.decline();
    await game.settle();
    expect(game.p1.deck().slice(0, 2)).toEqual(["a", "b"]);
    expect(game.p2.deck()[0]).toBe(p2Top);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("clause 2 — accepting the recycle sends 'a' to the bottom: 'b' is the new top card and 'a' is last", async () => {
    const game = await board().build();
    await game.p1.cast("eclipse", { targets: "home" });
    await game.settle();
    expect(game.decision()?.kind).toBe("pick");
    await game.p1.pick("a");
    await game.settle();
    const deck = game.p1.deck();
    expect(deck[0]).toBe("b");
    expect(deck.at(-1)).toBe("a");
    expect(game.p1.hand()).toEqual([]); // Predict never draws
  });

  test("Predict with an EMPTY deck: the -4 still applies, nothing throws, no Burn Out point for anyone (436.4.a)", async () => {
    const game = await scenario()
      .fillDecks(false)
      .resources(P1, { energy: 3 })
      .unit(P2, "base", { might: 5, name: "Homebody" }, "home")
      .hand(P1, CARD, "eclipse")
      .build();
    expect(game.p1.deck()).toEqual([]);
    await game.p1.cast("eclipse", { targets: "home" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.decline();
      await game.settle();
    }
    expect(game.state("home").might).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("eclipse")).toBe("trash");
  });

  test("-4 on a damaged unit is lethal right away: 5 Might carrying 2 damage → 1 Might, 2 ≥ 1 → killed (143.2.a)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P2, "base", { might: 5, name: "Bruised" }, "bruised", { damage: 2 })
      .hand(P1, CARD, "eclipse")
      .build();
    expect(game.state("bruised")).toMatchObject({ damage: 2, might: 5 });
    await game.p1.cast("eclipse", { targets: "bruised" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("bruised")).toBe("trash");
  });

  test("below zero (143.2.b/.b.1): a 3-Might unit reads as 0 but is really -1 — it does not die undamaged, and a later +2 this turn makes it 1, not 2", async () => {
    const game = await board().hand(P1, PLUS2, "plus").build();
    await game.p1.cast("eclipse", { targets: "ally" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.decline();
      await game.settle();
    }
    expect(game.zoneOf("ally")).toBe("base"); // 0 damage is never lethal (142.4.b)
    expect(game.state("ally")).toMatchObject({ baseMight: 3, might: 0, mightModifier: -4 }); // treated as 0, real 3-4 = -1
    await game.p1.cast("plus", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(1);
  });

  test("below zero: one point of damage kills the shrunken 3-Might unit (non-zero damage ≥ a Might treated as 0)", async () => {
    const game = await board().hand(P1, PING1, "ping").build();
    await game.p1.cast("eclipse", { targets: "ally" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.decline();
      await game.settle();
    }
    await game.p1.cast("ping", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
  });

  test("two-item chain (LIFO): Zap Two on the 5-Might Homebody, Eclipse on top → Eclipse resolves first (5 → 1), then the 2 damage kills it", async () => {
    const game = await board().hand(P1, ZAP2, "zap").build();
    await game.p1.cast("zap", { targets: "home" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["zap"]);
    await game.p1.cast("eclipse", { targets: "home" }); // holding priority, react to my own spell
    expect(game.chain().map((c) => c.cardId)).toEqual(["zap", "eclipse"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Eclipse resolves
    if (game.decision()?.kind === "pick") {
      await game.p1.decline();
    }
    expect(game.zoneOf("eclipse")).toBe("trash");
    expect(game.state("home")).toMatchObject({ damage: 0, might: 1, zone: "base" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["zap"]);
    await game.settle();
    expect(game.zoneOf("home")).toBe("trash");
  });

  test("[Reaction] on the opponent's turn: P2 casts a spell, P1 answers with Eclipse on P2's unit; it sits on top and resolves first", async () => {
    const game = await board().active(P2).hand(P2, ZAP2, "zap").build();
    expect(game.p1.can("cast", "eclipse")).toBe(false); // P2's open main phase: no priority for P1 yet
    await game.p2.cast("zap", { targets: "scout" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "eclipse")).toBe(true);
    await game.p1.cast("eclipse", { targets: "giant" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["zap", "eclipse"]);
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.decline();
      await game.settle();
    }
    expect(game.state("giant").might).toBe(2);
    expect(game.zoneOf("scout")).toBe("trash"); // Zap still resolved afterwards
  });

  test("[Reaction] in the opponent's combat showdown: a 5-Might attacker shrunk to 1 dies to my 3-Might defender, who survives and keeps the battlefield", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Defender" }, "def")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .hand(P1, CARD, "eclipse")
      .build();
    await game.p2.move("raider", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "eclipse")).toBe(false); // attacker holds Focus first
    await game.p2.passFocus();
    expect(game.p1.can("cast", "eclipse")).toBe(true);
    await game.p1.cast("eclipse", { targets: "raider" });
    expect(game.state("raider").combatRole).toBe("attacker");
    await game.settle({ policy: "first" }); // resolve Eclipse (recycle or not is irrelevant), then combat
    expect(game.zoneOf("raider")).toBe("trash"); // 3 damage ≥ 1 Might
    expect(game.zoneOf("def")).toBe("battlefield-bf1"); // took only 1 (0 would also do) < 3
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("control for the showdown line: without Eclipse the same 5-Might attacker kills the 3-Might defender and conquers", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Defender" }, "def")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
