/**
 * Katarina, Reckless — unl-023-219 · Champion Unit (Katarina) · Fury · 5 energy + 1 [fury] · 5 Might
 *
 *   When you hide a card, ready me.
 *   When you play a card from face down, deal 2 to an enemy unit.
 *
 * Rules: 811 (Hidden: on your turn pay [rainbow] to Hide a Hidden card facedown at a battlefield you
 * control; from the next turn it may be played from there for 0 as a Reaction), 811.1.c.1-3 (Hide is NOT
 * a play and opens no chain; playing from facedown IS a play and does), 811.3 (a Hidden card may instead
 * be played normally from hand — that is not "from face down"), 811.1.d.2 (only the hidden card's OWN
 * targets are pinned to its battlefield — Katarina's "an enemy unit" is unrestricted), 383 (both lines
 * are triggered abilities that use the chain), 415 (Ready), 143.2.a (2 damage is lethal on 2 Might).
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. "When YOU hide": my hide readies her wherever she is (no "here"); the OPPONENT hiding does not;
 *      hiding costs [rainbow], leaves the card facedown, and itself puts nothing but her trigger in motion.
 *   2. The tempo line: Katarina enters exhausted, I hide a card, she stands up and attacks the same turn.
 *   3. "Play a card from face down": Marai revealed on my later turn at a battlefield with no enemy —
 *      Marai's own "here" trigger whiffs, but Katarina's 2 reaches an enemy ANYWHERE; with two enemies I
 *      choose, and 2 is exactly lethal on a 2-Might unit. Playing the same Hidden card normally from
 *      hand (811.3) triggers nothing; the opponent playing from face down triggers nothing for me;
 *      playing from face down does NOT ready her (that is the other trigger's job).
 *   4. The ambush stack: P2 attacks my battlefield with a 6-Might unit, I flip Sudden Storm from
 *      facedown — Storm's 4 (it is attacking) + Katarina's 2 = exactly 6: the attacker never reaches
 *      combat damage.
 *   5. Cost: 5 + [fury], enters exhausted; 5 alone / 4 + [fury] are not enough.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-023-219";
const MARAI = "unl-003-219"; // Fury unit 2/2, [Hidden]; "When you play me to a battlefield, deal 2 to an enemy unit here."
const STORM = "sfd-017-221"; // Fury spell, [Hidden] [Action]: deal 2 to a unit at a battlefield (4 instead if it's attacking)

/** P1's turn: Katarina (exhausted unless `ready`) in base, P1 holds bf1 with Holder, P2 has Far (bf2, 3) and Home (base, 2); Marai + Storm in hand, 2 rainbow. */
function board(opts: { katReady?: boolean; katAt?: string } = {}) {
  return scenario()
    .resources(P1, { power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, opts.katAt ?? "base", CARD, "kat", opts.katReady ? undefined : { exhausted: true })
    .unit(P2, "bf2", { might: 3, name: "Far" }, "far")
    .unit(P2, "base", { might: 2, name: "Home" }, "home")
    .hand(P1, MARAI, "marai")
    .hand(P1, STORM, "storm");
}

/** Hide Marai at bf1 this turn, come back two turns later (P1's next turn) ready to flip it. */
async function hiddenMaraiNextTurn(b = board({ katReady: true })) {
  const game = await b.build();
  await game.p1.hide("marai", "bf1");
  await game.settle();
  await game.advanceTurn();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.zoneOf("marai")).toBe("facedown-bf1");
  return game;
}

describe("Katarina, Reckless (unl-023-219)", () => {
  // Expected: two triggered abilities keyed on MY actions — {event:"hide", friendly} → ready self, and
  // {event:"play-from-hidden", friendly} → deal 2 to an enemy unit. Actual: the first trigger listens to
  // a "reveal" event (an acknowledged placeholder), so "when you hide a card" is not what it fires on.
  test("parsed abilities key 'When you hide a card, ready me' on a 'reveal' event instead of 'hide'", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 5, isChampion: true, might: 5, name: "Katarina, Reckless", powerCost: ["fury"], tags: ["Katarina"] });
    expect(def?.abilities).toEqual([
      { effect: { target: "self", type: "ready" }, trigger: { event: "hide", on: { controller: "friendly" } }, type: "triggered" },
      {
        effect: { amount: 2, target: { controller: "enemy", type: "unit" }, type: "damage" },
        trigger: { event: "play-from-hidden", on: { controller: "friendly" } },
        type: "triggered",
      },
    ]);
  });

  test("cost: 5 energy + 1 fury, enters the base exhausted as a 5-Might unit, nothing triggers on play; 5 alone or 4 + fury is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { fury: 1 } }).unit(P2, "base", { might: 2 }, "home").hand(P1, CARD, "kat").build();
    await game.p1.play("kat");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("kat")).toMatchObject({ isExhausted: true, might: 5, zone: "base" });
    expect(game.state("home").damage).toBe(0);
    expect((await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "kat").build()).p1.can("play", "kat")).toBe(false);
    expect((await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).hand(P1, CARD, "kat").build()).p1.can("play", "kat")).toBe(false);
  });

  // Expected (811.1.c.2 + trigger 1): hiding Marai at bf1 costs [rainbow], puts it facedown, and Katarina —
  // exhausted in the base, i.e. not even "here" — is readied once her trigger resolves. Actual: the hide
  // happens (facedown, rainbow spent) but no trigger fires and she stays exhausted.
  test("'When you hide a card, ready me' — hiding Marai should ready an exhausted Katarina anywhere on the board (811.1.c, 415)", async () => {
    const game = await board().build();
    expect(game.state("kat").isExhausted).toBe(true);
    await game.p1.hide("marai", "bf1");
    expect(game.zoneOf("marai")).toBe("facedown-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    await game.settle();
    expect(game.state("kat").isReady).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // Expected: the tempo line — play Katarina (enters exhausted), hide Storm at bf1, she readies and can
  // walk into bf2 the same turn: 5 vs Far's 3 → Far dies, Katarina conquers bf2. Actual: she never
  // readies, so the move is illegal.
  test("play Katarina, hide a card, then attack with her the same turn — 5 into a 3-Might defender conquers bf2", async () => {
    const game = await board().build(); // Katarina exhausted in base, as if just played
    await game.p1.hide("storm", "bf1");
    await game.settle();
    expect(game.state("kat").isReady).toBe(true);
    await game.p1.move("kat", "bf2");
    await game.settle();
    expect(game.zoneOf("far")).toBe("trash");
    expect(game.zoneOf("kat")).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  test("negative space: the OPPONENT hiding a card on their turn does not ready my exhausted Katarina", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CARD, "kat", { exhausted: true })
      .unit(P2, "bf2", { might: 3, name: "Far" }, "far")
      .hand(P2, MARAI, "theirMarai")
      .build();
    await game.p2.hide("theirMarai", "bf2");
    await game.settle();
    expect(game.zoneOf("theirMarai")).toBe("facedown-bf2");
    expect(game.state("kat").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
  });

  test("'play a card from face down': flipping Marai at bf1 on my later turn (0 energy) puts Marai's trigger AND Katarina's on the chain; I pick among enemy UNITS anywhere and Far — at ANOTHER battlefield — takes exactly 2", async () => {
    // P2 also has a gear in base: never a legal recipient of "deal 2 to an enemy UNIT".
    const game = await hiddenMaraiNextTurn(board({ katReady: true }).gear(P2, { name: "Trinket" }, "trinket"));
    expect(game.p2.units().sort()).toEqual(["far", "home"]);
    const energy = game.p1.energy();
    await game.p1.reveal("marai");
    expect(game.p1.energy()).toBe(energy);
    // rule 402.4: Marai's "an enemy unit here" has no legal target at bf1 ⇒ removed unfinalized
    expect(game.chain().map((c) => [c.cardId, c.triggered])).toEqual([["kat", true]]);
    const d = game.decision(); // rule 402 (finalization): Katarina's target is picked before priority
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["far", "home"]); // enemy UNITS anywhere, no gear, no friendlies
    await game.p1.pick("far");
    await game.settle();
    expect(game.zoneOf("marai")).toBe("battlefield-bf1");
    expect(game.state("far")).toMatchObject({ damage: 2, zone: "battlefield-bf2" });
    expect(game.state("home").damage).toBe(0);
    expect(game.state("holder").damage).toBe(0);
    expect(game.state("kat").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("with a single enemy unit on the board the 2 lands on it without ceremony (Far at bf2: 3 Might → 2 damage, survives)", async () => {
    const b = scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P1, "base", CARD, "kat")
      .unit(P2, "bf2", { might: 3, name: "Far" }, "far")
      .hand(P1, MARAI, "marai");
    const game = await hiddenMaraiNextTurn(b);
    await game.p1.reveal("marai");
    await game.settle({ policy: "first" });
    expect(game.state("far")).toMatchObject({ damage: 2, zone: "battlefield-bf2" });
  });

  test("two enemies: I choose — picking the 2-Might Home is exactly lethal, Far is untouched", async () => {
    const game = await hiddenMaraiNextTurn();
    await game.p1.reveal("marai");
    for (let i = 0; i < 8 && game.decision()?.kind === "action" && (game.decision() as ActionDecision).context === "chain"; i++) {
      await game.acting().pass();
    }
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("home");
    await game.settle();
    expect(game.zoneOf("home")).toBe("trash");
    expect(game.state("far").damage).toBe(0);
  });

  test("negative space (811.3): playing the Hidden Marai NORMALLY from hand for 2 energy is not 'from face down' — no Katarina trigger, nobody damaged", async () => {
    const game = await board({ katReady: true }).resources(P1, { energy: 2, power: { rainbow: 2 } }).build();
    await game.p1.play("marai", { to: "base" });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("marai")).toBe("base");
    expect(game.state("far").damage).toBe(0);
    expect(game.state("home").damage).toBe(0);
  });

  test("negative space: playing from face down does NOT ready Katarina (only hiding does) — she moved to bf1 first and stays exhausted after the flip", async () => {
    const game = await hiddenMaraiNextTurn();
    expect(game.state("kat").isReady).toBe(true); // readied by her own Awaken step
    await game.p1.move("kat", "bf1"); // my own battlefield: no combat, just exhausts her
    await game.settle();
    expect(game.state("kat")).toMatchObject({ isExhausted: true, zone: "battlefield-bf1" });
    await game.p1.reveal("marai");
    await game.settle({ policy: "first" }); // whichever enemy is offered first takes the 2
    const someoneTookTwo = game.zoneOf("home") === "trash" || game.state("far").damage === 2;
    expect(someoneTookTwo).toBe(true); // the damage trigger did fire…
    expect(game.state("kat").isExhausted).toBe(true); // …but nothing readied her
  });

  test("negative space: the OPPONENT playing their card from face down triggers nothing for my Katarina", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CARD, "kat")
      .unit(P1, "base", { might: 2, name: "Bystander" }, "by")
      .unit(P2, "bf2", { might: 3, name: "Far" }, "far")
      .hand(P2, MARAI, "theirMarai")
      .build();
    await game.p2.hide("theirMarai", "bf2");
    await game.advanceTurn(); // → P1
    await game.advanceTurn(); // → P2, who may now flip it
    await game.p2.reveal("theirMarai");
    expect(game.chain().some((c) => c.cardId === "kat")).toBe(false);
    await game.settle({ policy: "first" });
    expect(game.zoneOf("theirMarai")).toBe("battlefield-bf2");
    expect(game.state("kat").damage).toBe(0);
    expect(game.state("by").damage).toBe(0);
    expect(game.state("far").damage).toBe(0);
  });

  test("the ambush stack: P2 attacks bf1 with a 6-Might unit; I flip Sudden Storm from facedown — Storm's 4 (attacking) + Katarina's 2 = exactly 6, the attacker dies before combat damage and I keep bf1", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Bait" }, "bait")
      .unit(P1, "base", CARD, "kat")
      .unit(P2, "base", { might: 6, name: "Juggernaut" }, "jug")
      .hand(P1, STORM, "storm")
      .build();
    await game.p1.hide("storm", "bf1");
    await game.advanceTurn(); // → P2
    await game.p2.move("jug", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "storm")).toBe(true);
    await game.p1.reveal("storm", { answers: ["jug"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(expect.arrayContaining(["storm", "kat"]));
    await game.settle({ policy: "first" }); // Katarina's only enemy unit is the Juggernaut; Storm's target was named
    expect(game.zoneOf("jug")).toBe("trash");
    expect(game.zoneOf("bait")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("storm")).toBe("trash");
  });

  test("control for the ambush: the same flip WITHOUT Katarina leaves the Juggernaut on 4 damage — it survives, kills the Bait and conquers", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Bait" }, "bait")
      .unit(P2, "base", { might: 6, name: "Juggernaut" }, "jug")
      .hand(P1, STORM, "storm")
      .build();
    await game.p1.hide("storm", "bf1");
    await game.advanceTurn();
    await game.p2.move("jug", "bf1");
    await game.p2.passFocus();
    await game.p1.reveal("storm", { answers: ["jug"] });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("bait")).toBe("trash");
    expect(game.zoneOf("jug")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
