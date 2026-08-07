/**
 * Back Off — unl-042-219 · Spell · Calm · 3 energy (no power) · Action
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   [Action] (Play on your turn or in showdowns.)
 *   [Stun] a unit. (It doesn't deal combat damage this turn.)
 *   If you played this from your hand, draw 1.
 *
 * Head-judge notes — the tricky spots for this card:
 *   1. The draw is gated on WHERE it was played from (hand vs. facedown, 811), not on the stun
 *      landing: an already-stunned target (423.1.a.1) is a legal choice and the hand-cast still draws.
 *   2. Played from facedown it costs 0 (811.1.b), opens a chain (811.1.c.3), may only choose a unit at
 *      THAT battlefield (811.1.d.2) and must NOT draw ("from your hand" is false).
 *   3. Facedown it has [Reaction] (811.6): the defender can flip it inside the opponent's combat
 *      showdown and blank the attacker's damage (423.1.b) — but not in the opponent's neutral open
 *      state (316.5.b), and from hand it is only an [Action].
 *   4. "A unit" is any unit anywhere (base or battlefield, friend or foe) when cast from hand (811.3).
 *   5. The stun wears off in the end-of-turn cleanup (423.1.a.2) — across ONE advanceTurn.
 *   6. Partner: Vex, Mocking (unl-055-219) keys off "when you [Stun] an enemy unit at a battlefield".
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-042-219";
const CANTRIP = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Cantrip",
  timing: "action",
} as const;

/** P1 to act with Back Off in hand; P2 holds bf1 with a 5-Might defender. */
function board(energy = 3) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Defender" }, "def")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .unit(P1, "base", { might: 2, name: "Attacker" }, "atk")
    .deckTop(P1, "ogn-175-298", "top")
    .hand(P1, CARD, "bo");
}

/** P1 holds bf1 with Back Off already facedown there (hidden on an earlier turn); P2 to act. */
function hidden() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 1, name: "MyHome" }, "myhome")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .unit(P2, "bf2", { might: 2, name: "Far" }, "far")
    .facedown(P1, "bf1", CARD, "bo")
    .deckTop(P1, "ogn-175-298", "top");
}

describe("Back Off (unl-042-219)", () => {
  test("from hand: costs 3 energy, stuns the chosen unit, draws 1, goes to trash; 2 energy is not enough", async () => {
    const game = await board().build();
    await game.p1.cast("bo", { targets: "def" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bo", controller: P1, triggered: false })]);
    expect(game.state("def").isStunned).toBe(false); // nothing before resolution
    await game.settle();
    expect(game.state("def").isStunned).toBe(true);
    expect(game.p1.hand()).toEqual(["top"]);
    expect(game.zoneOf("bo")).toBe("trash");
    expect(game.violations()).toEqual([]);
    const poor = await board(2).build();
    expect(poor.p1.can("cast", "bo")).toBe(false);
  });

  test("'a unit': every unit on the board is a legal target — enemy at a battlefield, enemy in base, and your own", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "bo")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(3);
    expect(targets).toEqual(expect.arrayContaining([["def"], ["home"], ["atk"]]));
    await game.p1.cast("bo", { targets: "atk" });
    await game.settle();
    expect(game.state("atk").isStunned).toBe(true);
    expect(game.p1.hand()).toEqual(["top"]); // still "from your hand"
  });

  test("choosing an ALREADY-stunned unit is legal and the hand-cast still draws 1 (the draw is not linked to the stun)", async () => {
    const game = await board().unit(P2, "bf1", { might: 3, name: "Dazed" }, "dazed", { stunned: true }).build();
    await game.p1.cast("bo", { targets: "dazed" });
    await game.settle();
    expect(game.state("dazed").isStunned).toBe(true);
    expect(game.p1.hand()).toEqual(["top"]);
    expect(game.zoneOf("bo")).toBe("trash");
  });

  test("a stunned defender deals no combat damage (423.1.b): the 2-Might attacker walks into the stunned 5 and comes home unhurt", async () => {
    const game = await board().build();
    await game.p1.cast("bo", { targets: "def" });
    await game.settle();
    await game.p1.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("atk")).toBe("base"); // 2 < 5: no conquer, recalled
    expect(game.state("atk").damage).toBe(0);
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("the stun ends in the end-of-turn cleanup (423.1.a.2): gone after one advanceTurn", async () => {
    const game = await board().build();
    await game.p1.cast("bo", { targets: "def" });
    await game.settle();
    expect(game.state("def").isStunned).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("def").isStunned).toBe(false);
  });

  test("[Action] from hand: not in the opponent's open state, not on a closed chain, but yes with Focus in a showdown on the opponent's turn", async () => {
    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("cast", "bo")).toBe(false);

    const chain = await board().hand(P1, CANTRIP, "cantrip").build();
    await chain.p1.cast("cantrip");
    expect(chain.chain()).toHaveLength(1);
    expect(chain.p1.can("cast", "bo")).toBe(false); // Action ≠ Reaction
    await chain.settle();
    expect(chain.p1.can("cast", "bo")).toBe(true);

    const showdown = await scenario()
      .active(P2)
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .deckTop(P1, "ogn-175-298", "top")
      .hand(P1, CARD, "bo")
      .build();
    await showdown.p2.move("raider", "bf1");
    expect(showdown.p1.can("cast", "bo")).toBe(false); // attacker holds Focus first
    await showdown.p2.passFocus();
    expect(showdown.p1.can("cast", "bo")).toBe(true);
    await showdown.p1.cast("bo", { targets: "raider" });
    expect(showdown.p1.energy()).toBe(0);
    await showdown.settle();
    expect(showdown.p1.hand()).toEqual(["top"]); // from hand → draw
    expect(showdown.state("holder").damage).toBe(0); // stunned Raider dealt 0
    expect(showdown.zoneOf("holder")).toBe("battlefield-bf1");
    expect(showdown.zoneOf("raider")).toBe("base"); // took Holder's 3 < 4 → survives, sent home
    expect(showdown.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("[Hidden]: hide for [rainbow] at a battlefield you control — no chain, no energy spent, not playable the same turn; an enemy battlefield is not offered", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2 }, "holder")
      .hand(P1, CARD, "bo")
      .build();
    expect(game.p1.option("hide", "bo")?.fields.find((f) => f.arg === "to")?.options).toEqual(["bf1"]);
    await game.p1.hide("bo", "bf1");
    expect(game.zoneOf("bo")).toBe("facedown-bf1");
    expect(game.state("bo").isHidden).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("reveal", "bo")).toBe(false);
    const noRainbow = await scenario().resources(P1, { energy: 3 }).battlefield("bf1", { controller: P1 }).hand(P1, CARD, "bo").build();
    expect(noRainbow.p1.can("hide", "bo")).toBe(false);
  });

  test("facedown = [Reaction] (811.6): not in the opponent's neutral open state, but flippable for 0 inside their combat showdown; the stunned attacker deals nothing and dies to Holder", async () => {
    const game = await hidden().build();
    expect(game.p1.can("reveal", "bo")).toBe(false); // 316.5.b: P2's open state
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "bo")).toBe(true);
    await game.p1.reveal("bo");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // ignoring its cost
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bo", controller: P1 })]); // 811.1.c.3
    await game.settle(); // both pass → resolves → target asked, restricted to bf1 (811.1.d.2)
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["holder", "raider"]);
    await game.p1.pick("raider");
    await game.settle(); // resolves, then the combat plays out
    expect(game.state("raider").isStunned).toBe(true); // still P2's turn: the stun persists
    expect(game.p2.hand()).toEqual([]); // nobody else draws off my spell
    expect(game.zoneOf("bo")).toBe("trash");
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
    expect(game.state("holder").damage).toBe(0); // stunned Raider dealt 0
    expect(game.zoneOf("raider")).toBe("base"); // took 3 < 4 → survives, recalled
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("from facedown on your own turn the choice is restricted to THAT battlefield (811.1.d.2): only the two bf1 units — never a base unit or bf2's Far; an off-site pick is refused", async () => {
    const game = await hidden().active(P1).unit(P1, "bf1", { might: 2, name: "Holder2" }, "holder2").build();
    expect(game.p1.can("reveal", "bo")).toBe(true);
    await game.p1.reveal("bo");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["holder", "holder2"]);
    for (const offsite of ["raider", "far", "myhome"]) {
      expect((await game.p1.try((p) => p.pick(offsite))).ok).toBe(false);
    }
    await game.p1.pick("holder2");
    await game.settle();
    expect(game.state("holder2").isStunned).toBe(true);
    expect(game.state("holder").isStunned).toBe(false);
    expect(game.zoneOf("bo")).toBe("trash");
  });

  test("played from facedown it must NOT draw — 'if you played this from your hand' is false (811 / printed text)", async () => {
    // Expected: Holder gets stunned, Back Off → trash, P1's hand stays EMPTY ("top" still on the deck).
    // Actual: the parsed spell draws unconditionally, so P1 draws "top" even on a facedown play.
    const game = await hidden().active(P1).build();
    await game.p1.reveal("bo");
    await game.settle(); // lone bf1 unit → forced pick of Holder
    expect(game.state("holder").isStunned).toBe(true);
    expect(game.zoneOf("bo")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
    expect(game.zoneOf("top")).toBe("mainDeck");
  });

  test("registry payload — Hidden keyword + Action spell whose draw is CONDITIONAL on being played from hand", async () => {
    // Expected: [Hidden keyword, spell{timing action, stun(a unit) then draw 1 gated by a played-from-hand
    // condition}]. Actual: the sequence is stun → unconditional draw (the gate is dropped).
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "calm", energyCost: 3, name: "Back Off", timing: "action" });
    expect(def?.powerCost ?? []).toEqual([]);
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toEqual({ keyword: "Hidden", type: "keyword" });
    expect(abilities[1]).toMatchObject({ timing: "action", type: "spell" });
    const body = JSON.stringify(abilities[1]);
    expect(body).toContain('"type":"stun"');
    expect(body).toContain('"type":"draw"');
    expect(body).toMatch(/hand/i); // the "from your hand" gate must survive parsing
  });
});
