/**
 * Wild Claw — ven-089-166 · Spell · Body · 7 energy + [body] · (no [Action]/[Reaction])
 *
 *   Look at the top 5 cards of your Main Deck. You may banish a unit or gear from among them and
 *   play it, reducing its Energy cost by [5]. Recycle the rest. Then you may do this: Empower it.
 *   (It becomes Empowered if it's not already.)
 *
 * Rules: 356.4/356.6 (a discount touches the ENERGY component only and never below 0 — a Power
 * pip on the revealed card is still owed), 419.2.a (a card "played" by an effect must still have
 * its remaining cost paid; if it cannot be played it cannot be chosen), 143.4 (units enter
 * exhausted), 441 (Empower: binary state; "you may" → a real choice AFTER the play), standard
 * timing (your turn, open state), Recycle = bottom of Main Deck.
 *
 * Head-judge checklist for THIS card:
 *  1. "unit OR gear" — both types are offered, a spell among the five is not, the 6th card is never
 *     seen; the choice is optional (decline → all five recycled, nothing else happens, no Empower ask).
 *  2. The [5] discount is energy-only: Mega-Mech (7) costs 2, Pirate's Haven (3) costs 0, Simian
 *     Ancestor (5+[calm]) costs 0 energy but still its [calm]. With 0 energy left after paying for
 *     Wild Claw itself, a 7-cost card must NOT be a legal pick (it would strand in banishment).
 *  3. "play it" is a real play: the unit enters exhausted, its own "When you play me" trigger fires
 *     (Cloud Drake draws), the opponent gets priority on Wild Claw before any card is revealed.
 *  4. "Then you may do this: Empower it." — "it" is the card just played (unit OR gear), asked after
 *     the play; accepting Empowers it (Ambessa, The Wolf then reads 7 Might via her [Empowered] +3).
 *  5. Fewer than five cards in the deck: look at what is there, no error.
 *  6. Cost/timing: exactly 7+[body]; 6 energy or a non-body pip → not castable; never on the
 *     opponent's turn.
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-089-166";
const MEGA_MECH = "ogn-088-298"; // 7-cost Mind unit, 8 Might, vanilla
const PIRATES_HAVEN = "ogn-143-298"; // 3-cost Body gear
const RUNE_PRISON = "ogn-050-298"; // a spell — never pickable
const PHANTOM = "ogn-049-298"; // 5-cost Calm unit, vanilla
const SIMIAN = "sfd-047-221"; // 5 + [calm] unit
const CLOUD_DRAKE = "ven-048-166"; // 6-cost unit: "When you play me, draw 1."
const AMBESSA_WOLF = "ven-084-166"; // 4-cost Body unit, 4 Might; [Empowered] +3 Might

/** Top five = first five aliases; "sixth" must never be looked at. */
function board(energy: number, top: [string, string] = [MEGA_MECH, "mega"], power: Record<string, number> = { body: 1 }) {
  return scenario()
    .resources(P1, { energy, power })
    .deck(P1, [top[0], PIRATES_HAVEN, RUNE_PRISON, PHANTOM, SIMIAN, MEGA_MECH], [top[1], "haven", "prison", "phantom", "simian", "sixth"])
    .hand(P1, CARD, "wc");
}

describe("Wild Claw (ven-089-166)", () => {
  test("registry payload: 7+[body] standard spell; look 5 from deck, optional banish→play unit/gear at -5 energy, rest recycled, optional follow-up Empower", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "body", energyCost: 7, name: "Wild Claw", powerCost: ["body"] });
    expect(def?.timing ?? "standard").toBe("standard");
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: {
        amount: 5,
        filter: { excludeCardTypes: expect.arrayContaining(["spell"]) },
        from: "deck",
        onPicked: "play",
        optional: true,
        reduceCost: { energy: 5 },
        followUp: { effect: { type: "empower" }, type: "optional" },
        type: "look",
      },
      type: "spell",
    });
  });

  test("cost: 7 energy + 1 body are deducted and it goes on the chain; P2 gets priority before anything is revealed; 6 energy / wrong pip / opponent's turn → not castable", async () => {
    const game = await board(9).build();
    await game.p1.cast("wc");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { body: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "wc", controller: P1, triggered: false })]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()?.kind).toBe("action"); // no reveal yet
    expect((await board(6).build()).p1.can("cast", "wc")).toBe(false);
    expect((await board(7, [MEGA_MECH, "mega"], { calm: 1 }).build()).p1.can("cast", "wc")).toBe(false);
    expect((await board(9).active(P2).build()).p1.can("cast", "wc")).toBe(false);
  });

  test("looks at exactly the top 5 and offers the units AND the gear among them — not the spell, not the 6th card; the pick is optional", async () => {
    // A [calm] in the pool so Simian Ancestor's remaining pip is payable (419.2.a: only PLAYABLE cards are choices).
    const game = await board(9, [MEGA_MECH, "mega"], { body: 1, calm: 1 }).build();
    await game.p1.cast("wc");
    await game.settle();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", max: 1, seat: P1 });
    expect(d.options.map((o) => o.card).sort()).toEqual(["haven", "mega", "phantom", "simian"]);
  });

  test("picking Mega-Mech (7 → 2 energy) pays 2, plays it to base exhausted (143.4); the other four go to the bottom, the 6th card is now on top; Wild Claw → trash", async () => {
    const game = await board(9).build();
    await game.p1.cast("wc");
    await game.settle();
    await game.p1.pick("mega");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("mega")).toBe("base");
    expect(game.state("mega")).toMatchObject({ isEmpowered: false, isExhausted: true, might: 8 });
    const deck = game.p1.deck();
    expect(deck[0]).toBe("sixth");
    expect(deck.slice(-4).sort()).toEqual(["haven", "phantom", "prison", "simian"]);
    expect(game.zoneOf("wc")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("'or gear': picking Pirate's Haven (3 → 0) plays the gear to base for free and recycles the rest", async () => {
    const game = await board(7).build();
    await game.p1.cast("wc");
    await game.settle();
    await game.p1.pick("haven");
    await game.settle();
    expect(game.p1.gear()).toContain("haven");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.p1.deck().slice(-4).sort()).toEqual(["mega", "phantom", "prison", "simian"]);
  });

  test("the discount is energy-only (356.4): Simian Ancestor (5+[calm]) costs 0 energy but its [calm] pip is still paid", async () => {
    const game = await board(7, [MEGA_MECH, "mega"], { body: 1, calm: 1 }).build();
    await game.p1.cast("wc");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, calm: 1 } });
    await game.settle();
    await game.p1.pick("simian");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, calm: 0 } });
    await game.settle();
    expect(game.zoneOf("simian")).toBe("base");
  });

  test("a revealed card whose remaining cost cannot be paid (Mega-Mech at 2 with 0 energy, Simian's [calm] with no calm) must not be a legal pick (419.2.a)", async () => {
    const game = await board(7).build();
    await game.p1.cast("wc");
    await game.settle();
    const d = game.decision() as PickDecision;
    expect(d.options.map((o) => o.card).sort()).toEqual(["haven", "phantom"]);
  });

  test("declining plays nothing: all five looked-at cards go to the bottom, no Empower question, back to an open main phase", async () => {
    const game = await board(9).build();
    await game.p1.cast("wc");
    await game.settle();
    await game.p1.decline();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p1.base()).toEqual([]);
    expect(game.p1.banishment()).toEqual([]);
    const deck = game.p1.deck();
    expect(deck[0]).toBe("sixth");
    expect(deck.slice(-5).sort()).toEqual(["haven", "mega", "phantom", "prison", "simian"]);
    expect(game.p1.energy()).toBe(2); // nothing beyond Wild Claw's own cost was spent
    expect(game.zoneOf("wc")).toBe("trash");
  });

  test("'play it' is a real play: Cloud Drake (6 → 1) played this way fires its own 'When you play me, draw 1' — drawing the 6th card after the recycle", async () => {
    const game = await board(8, [CLOUD_DRAKE, "drake"]).build();
    await game.p1.cast("wc");
    await game.settle();
    await game.p1.pick("drake");
    expect(game.p1.energy()).toBe(0); // 8 - 7 - (6-5)
    await game.settle();
    expect(game.zoneOf("drake")).toBe("base");
    expect(game.p1.hand()).toEqual(["sixth"]);
  });

  test("'Then you may do this: Empower it.' — after the play P1 is asked; accepting Empowers the played Ambessa, The Wolf (4 → 7 Might via her [Empowered] +3)", async () => {
    const game = await board(7, [AMBESSA_WOLF, "wolf"]).build();
    await game.p1.cast("wc");
    await game.settle();
    await game.p1.pick("wolf");
    const r = await game.settle();
    expect(game.zoneOf("wolf")).toBe("base");
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ seat: P1 });
    expect(["yes-no", "pick"]).toContain(game.decision()?.kind);
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
    } else {
      await game.p1.pick((game.decision() as PickDecision).options[0]!.key);
    }
    await game.settle();
    expect(game.state("wolf")).toMatchObject({ isEmpowered: true, might: 7 });
    expect(game.state("wc").isEmpowered).toBe(false); // "it" is the played card, never the spell
  });

  test("fewer than five cards left: looks at what is there (spell + Phantom → only Phantom offered); declining recycles both", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { body: 1 } })
      .fillDecks(false)
      .deck(P1, [RUNE_PRISON, PHANTOM], ["prison", "phantom"])
      .hand(P1, CARD, "wc")
      .build();
    await game.p1.cast("wc");
    await game.settle();
    const d = game.decision() as PickDecision;
    expect(d.options.map((o) => o.card)).toEqual(["phantom"]);
    await game.p1.decline();
    await game.settle();
    expect(game.p1.deck().sort()).toEqual(["phantom", "prison"]);
    expect(game.p1.base()).toEqual([]);
  });
});
