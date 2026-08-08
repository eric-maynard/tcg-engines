/**
 * Bone Skewer — unl-139-219 · Spell · Chaos · 2 energy + [chaos]
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   Choose a battlefield. An opponent reveals their hand. You may choose a unit from it. They
 *   play that unit to that battlefield, ignoring any and all costs. When they do, [Stun] it.
 *   (It doesn't deal combat damage this turn.)
 *
 * Head-judge checklist (trickiest situations for this card):
 *  1. THEY play it (not you): the unit stays under its owner's control, P2 pays nothing even for a
 *     6-cost unit at 0 resources ("any and all costs" → total cost 0, 356.5.a), its "When you play
 *     me" triggers fire for P2, and it enters exhausted AND stunned.
 *  2. Pulled into YOUR occupied battlefield: P2's unit applies Contested (190.3.a.1) → a combat is
 *     staged on P1's turn with P2 as ATTACKER holding Focus (464.2.c.1); stunned, it deals 0
 *     (423.1.b) and dies to / bounces off the defenders; survivors are recalled (466.1.a.2).
 *  3. Pulled onto an EMPTY uncontrolled battlefield: P2 contests it, a showdown follows and P2
 *     CONQUERS and scores on P1's turn (469.1 has no whose-turn clause).
 *  4. "You may choose a UNIT": spells/gear are revealed but never offered; declining or a unit-less
 *     hand plays nothing (the spell still resolves and is trashed). The whole hand is public until
 *     the spell finishes resolving (424.1.a.3), then private again.
 *  5. [Hidden]: hide for one power of ANY domain at a battlefield you control; from the next turn it
 *     is a 0-cost Reaction, and "Choose a battlefield" is then locked to THAT battlefield (811.1.d.2).
 *  6. Stun is "this turn": it drops in end-of-turn cleanup (423.1.a.2); Accelerate on the pulled unit
 *     may still be opted into for free (356.4.f.1 × 356.5.a) and then it enters ready.
 */

import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../harness";
import { P1, P2, isHiddenView, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-139-219";
const SKULKER = "ogn-175-298"; // vanilla 3-might unit, 3 energy
const CLOUD_DRAKE = "ven-048-166"; // 6-cost 5-might unit: When you play me, draw 1.
const REARGUARD = "ogn-010-298"; // 2-might unit with [Accelerate]
const CLEAVE = "ogn-004-298"; // a spell (never a legal pick)

/** P1's turn; P1 holds bf1 with a 4-might Guard; P2's hand = Skulker + Cloud Drake + Cleave + a gear. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Guard" }, "guard")
    .hand(P2, SKULKER, "skulker")
    .hand(P2, CLOUD_DRAKE, "drake")
    .hand(P2, CLEAVE, "cleave")
    .hand(P2, { cardType: "gear", energyCost: 1, name: "Trinket" }, "trinket")
    .deck(P2, [SKULKER], ["p2top"])
    .hand(P1, CARD, "bs");
}

/** Cast at `bf`, pass to resolution, and return the reveal-and-pick prompt. */
async function skewer(game: Game, bf = "bf1"): Promise<PickDecision> {
  await game.p1.cast("bs", { targets: bf });
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  const d = game.decision() as PickDecision;
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
  return d;
}

/** Open a staged combat/showdown if the engine left it as a turn-player option, then resolve it. */
async function fight(game: Game, bf: string): Promise<void> {
  await game.settle();
  if (game.p1.can("startShowdown")) {
    await game.p1.choose(`startShowdown:${bf}`);
  }
  await game.settle();
  await game.settle(); // a handed-back non-combat showdown is passed on the second call
}

describe("Bone Skewer (unl-139-219)", () => {
  test("registry payload: Hidden keyword + one spell effect (choose battlefield → opponent reveals hand → optional unit pick → they play it there free → stun)", async () => {
    await board().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", energyCost: 2, powerCost: ["chaos"] });
    expect(def?.timing).not.toBe("reaction"); // from hand it is a plain-speed spell
    expect(def?.abilities).toEqual([
      { keyword: "Hidden", type: "keyword" },
      {
        effect: {
          chooseBattlefield: true,
          filter: { cardTypes: ["unit"] },
          onPicked: "play",
          optional: true,
          playIgnoreCost: true,
          playStun: true,
          target: { type: "player", which: "opponent" },
          type: "reveal-hand",
        },
        timing: "action",
        type: "spell",
      },
    ]);
  });

  test("cost from hand: 2 energy + 1 chaos, battlefield chosen as it is played; unaffordable short of either; not castable from hand on the opponent's turn", async () => {
    const game = await board().build();
    expect(game.p1.option("cast", "bs")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["bf1"]]);
    await game.p1.cast("bs", { targets: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("bs")).toBe("chain");
    expect((await board().resources(P1, { energy: 1, power: { chaos: 1 } }).build()).p1.can("cast", "bs")).toBe(false);
    expect((await board().resources(P1, { energy: 2, power: { chaos: 0 } }).build()).p1.can("cast", "bs")).toBe(false);
    expect((await board().active(P2).build()).p1.can("cast", "bs")).toBe(false);
  });

  test("only UNITS are offered from the revealed hand (the spell and the gear are not); 'you may' — declining plays nothing and trashes the spell", async () => {
    const game = await board().build();
    const d = await skewer(game);
    expect(d.allowDecline).toBe(true);
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["drake", "skulker"]);
    await game.p1.decline();
    await game.settle();
    expect(game.p2.hand().sort()).toEqual(["cleave", "drake", "skulker", "trinket"]);
    expect(game.zoneOf("bs")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
  });

  test("THEY play it to that battlefield for free: Skulker lands at bf1 under P2's control, exhausted + stunned, P2's (empty) pool untouched", async () => {
    const game = await board().build();
    await skewer(game);
    await game.p1.pick("skulker");
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.state("skulker")).toMatchObject({ controller: P2, isExhausted: true, isStunned: true, owner: P2 });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p2.units("bf1")).toEqual(["skulker"]);
    expect(game.p1.units("bf1")).toEqual(["guard"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // being played there does not hand over control
  });

  test("the pulled unit applies Contested to YOUR battlefield by itself (190.3.a.1) → combat on P1's turn with P2 as attacker holding Focus (464.2.c.1); stunned it deals 0 and dies to the 4-might Guard; bf1 stays P1's", async () => {
    // Expected: right after the play bf1 is contested BY P2, a combat is staged and, once begun, Skulker is
    // the attacker with P2 holding Focus; it deals 0 (stunned) and dies. Actual (regressed while this file
    // was being written): bf1 stays uncontested and P1 is merely offered a manual `contest bf1` that
    // would make P1 the contesting/attacking player.
    const game = await board().build();
    await skewer(game);
    await game.p1.pick("skulker");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    // 323.13 — the Cleanup after the resolution begins the staged Combat (P1's own spell staged it).
    if (game.p1.can("startShowdown")) {
      await game.p1.choose("startShowdown:bf1");
    }
    expect(game.state("skulker").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.actingSeat()).toBe(P2); // 464.2.c.1 / 464.2.d — the attacker has Focus
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.state("guard").damage).toBe(0); // a stunned attacker contributes no combat damage
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("bs")).toBe("trash");
    expect(game.turnPlayer()).toBe(P1);
  });

  test("'ignoring any and all costs' + THEIR play trigger: a 6-cost Cloud Drake is pulled with P2 at 0 resources, lands at bf1 stunned, and P2 (not P1) draws 1 off 'When you play me'", async () => {
    const game = await board().build();
    await skewer(game);
    await game.p1.pick("drake");
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("drake")).toBe("battlefield-bf1");
    expect(game.state("drake")).toMatchObject({ controller: P2, isExhausted: true, isStunned: true });
    await game.settle();
    expect(game.zoneOf("p2top")).toBe("hand"); // P2 ("you" on the Drake) drew, not P1
    expect(game.p2.hand().sort()).toEqual(["cleave", "p2top", "skulker", "trinket"]);
    expect(game.p1.hand()).toEqual([]);
  });

  test("the ensuing combat with a stunned 5-Might Drake attacking the 4-Might Guard — nobody dies, damage is healed and the ATTACKER is recalled to P2's base (466.1.a.2); bf1 stays P1's", async () => {
    // Expected: Drake deals 0 (stunned), takes 4 < 5, both remain → attackers recalled, heal, P1 keeps bf1.
    // Actual: no Contested/combat is produced by the forced play (see the BUG above), so the Drake just sits at bf1.
    const game = await board().build();
    await skewer(game);
    await game.p1.pick("drake");
    await fight(game, "bf1");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.zoneOf("drake")).toBe("base");
    expect(game.state("drake")).toMatchObject({ controller: P2, damage: 0 });
    expect(game.state("guard").damage).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
  });

  test("a hand with no units: still castable (the hand is private), resolves with no pick prompt and nothing enters the board", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4 }, "guard")
      .hand(P2, CLEAVE, "cleave")
      .hand(P1, CARD, "bs")
      .build();
    expect(game.p1.can("cast", "bs")).toBe(true);
    await game.p1.cast("bs", { targets: "bf1" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("bs")).toBe("trash");
    expect(game.zoneOf("cleave")).toBe("hand");
    expect(game.cardsAt("bf1")).toEqual(["guard"]);
  });

  test("two battlefields: the one chosen at play time is where they play it — into P2's OWN battlefield there is no combat; the unit just sits there stunned and exhausted", async () => {
    const game = await board().battlefield("bf2", { controller: P2 }).unit(P2, "bf2", { might: 2, name: "Holder" }, "holder").build();
    expect(game.p1.option("cast", "bs")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["bf1"], ["bf2"]]);
    await skewer(game, "bf2");
    await game.p1.pick("skulker");
    await fight(game, "bf2");
    expect(game.zoneOf("skulker")).toBe("battlefield-bf2");
    expect(game.state("skulker")).toMatchObject({ controller: P2, isExhausted: true, isStunned: true });
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P2 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
  });

  test("stun lasts 'this turn' only (423.1.a.2): after the turn ends the pulled unit is un-stunned, still P2's, and readies at P2's Awaken", async () => {
    const game = await board().battlefield("bf2", { controller: P2 }).unit(P2, "bf2", { might: 2 }, "holder").build();
    await skewer(game, "bf2");
    await game.p1.pick("skulker");
    await fight(game, "bf2");
    expect(game.state("skulker").isStunned).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("skulker")).toMatchObject({ controller: P2, isReady: true, isStunned: false, zone: "battlefield-bf2" });
  });

  test("pulled onto an EMPTY uncontrolled battlefield, P2's unit contests it (190.3.a.1) and after the showdown P2 conquers and scores 1 — on P1's turn", async () => {
    // Expected: bf2 becomes contested by P2, a non-combat showdown is staged/handed back, and once it
    // closes P2 controls bf2 and has 1 point (469.1). Actual: bf2 stays uncontrolled/uncontested, 0 points.
    const game = await board().battlefield("bf2", { controller: null }).build();
    await skewer(game, "bf2");
    await game.p1.pick("skulker");
    await fight(game, "bf2");
    expect(game.zoneOf("skulker")).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
  });

  test("Accelerate on the pulled unit — P2 may opt in for free (all costs ignored, 356.5.a) and Legion Rearguard then enters READY (still stunned)", async () => {
    // P2 is asked, accepts without paying [1][fury] (they have nothing), Rearguard is ready + stunned.
    const game = await board().battlefield("bf2", { controller: P2 }).unit(P2, "bf2", { might: 2 }, "holder").hand(P2, REARGUARD, "rear").build();
    await skewer(game, "bf2");
    await game.p1.pick("rear");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
    await game.p2.yes();
    await fight(game, "bf2");
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("rear")).toBe("battlefield-bf2");
    expect(game.state("rear").isStunned).toBe(true);
    expect(game.state("rear").isReady).toBe(true);
  });

  test.failing("BUG: 'reveals their hand' is public until the spell finishes resolving (424.1.a.3) — while the pick is pending P1 sees ALL of P2's hand (spell and gear too); afterwards it is private again", async () => {
    // Expected: during the prompt every P2 hand card is a full view for P1; after resolution hidden views.
    // Actual: no visibility grant is recorded — P1's observation shows P2's hand redacted throughout.
    const game = await board().build();
    await skewer(game);
    const during = (game.p1.view().zones.hand ?? []).filter((c) => c.owner === P2);
    expect(during).toHaveLength(4);
    expect(during.every((c) => !isHiddenView(c))).toBe(true);
    await game.p1.decline();
    await game.settle();
    const after = (game.p1.view().zones.hand ?? []).filter((c) => c.owner === P2);
    expect(after.every((c) => isHiddenView(c))).toBe(true);
  });

  test("[Hidden]: hide at a battlefield you control for one power of ANY domain (fury here), no chain; not playable from facedown this turn nor in the opponent's open state", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 4 }, "guard")
      .unit(P2, "bf2", { might: 2 }, "holder")
      .hand(P2, SKULKER, "skulker")
      .hand(P1, CARD, "bs")
      .build();
    expect(game.p1.option("hide", "bs")?.fields.find((f) => f.arg === "to")?.options).toEqual(["bf1"]); // not bf2
    await game.p1.hide("bs", "bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("bs")).toBe("facedown-bf1");
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("reveal", "bs")).toBe(false); // 811.1.b — "beginning on the next turn"
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("reveal", "bs")).toBe(false); // Reaction still needs a closed state / showdown (813.1.c.1)
  });

  test("played from facedown on a later turn it costs 0 and 'Choose a battlefield' is locked to the battlefield it was hidden at (811.1.d.2) — bf2 must not be selectable", async () => {
    // Expected: after reveal (0 paid) either bf1 is auto-chosen (straight to the reveal-and-pick prompt)
    // or the target prompt offers only bf1. Actual: a choose-target prompt offers bf1 AND bf2.
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 4 }, "guard")
      .unit(P2, "bf2", { might: 2 }, "holder")
      .hand(P2, SKULKER, "skulker")
      .hand(P1, CARD, "bs")
      .build();
    await game.p1.hide("bs", "bf1");
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    const before = game.p1.resources();
    await game.p1.reveal("bs");
    expect(game.p1.resources()).toEqual(before); // [energy_0]
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.semantics === "target") {
      expect(d.options.map((o) => o.key)).toEqual(["bf1"]);
    } else {
      expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
    }
  });

  test("[Hidden] as a Reaction on the opponent's turn: revealed from bf1 in response to P2's spell, it resolves first and drags P2's Skulker to bf1 stunned — before their spell resolves", async () => {
    const game = await scenario()
      .resources(P1, { power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 2, name: "Buddy" }, "buddy")
      .hand(P2, SKULKER, "skulker")
      .hand(P2, CLEAVE, "cleave")
      .hand(P1, CARD, "bs")
      .build();
    await game.p1.hide("bs", "bf1");
    await game.advanceTurn(); // → P2
    await game.p2.do("addResources", { energy: 1 });
    await game.p2.cast("cleave", { targets: "buddy" });
    await game.p2.passPriority();
    expect(game.p1.can("reveal", "bs")).toBe(true);
    const before = game.p1.resources();
    await game.p1.reveal("bs");
    expect(game.p1.resources()).toEqual(before); // [energy_0] — nothing more paid
    expect(game.chain().map((i) => i.cardId)).toEqual(["cleave", "bs"]);
    // Drain priority until the reveal-and-pick prompt appears (single battlefield → auto-chosen).
    for (let i = 0; i < 6 && game.decision()?.kind !== "pick"; i++) {
      await game.acting().pass();
    }
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
    await game.p1.pick("skulker");
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.state("skulker")).toMatchObject({ controller: P2, isStunned: true });
    expect(game.chain().map((i) => i.cardId)).toEqual(["cleave"]); // Cleave still waiting underneath
    expect(game.state("buddy").grantedKeywords).toEqual([]);
  });
});
