/**
 * Flurry of Feathers — unl-044-219 · Spell · Calm · 4 energy + [calm][calm] · Reaction
 *
 *   [Reaction]
 *   Choose one — Counter a spell. · Play four 1 [Might] Bird unit tokens with [Deflect].
 *   (Opponents must pay [rainbow] to choose them with a spell or ability.)
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. Two very different modes on one Reaction. The counter mode needs "a spell" on the chain
 *     (355.8 / 355.9.a.2) and can never pick Flurry itself (355.9.c) nor an ABILITY; the Bird mode
 *     needs nothing, so the card is castable onto an empty chain (even on the opponent's turn, 813).
 *  2. "Counter a spell" has NO cost cap (contrast Defy): a 9-energy / 3-power spell is fair game.
 *     The countered spell does nothing, goes to the trash, and its costs are not refunded (425.1).
 *  3. Bird mode in RESPONSE to an enemy spell does not stop that spell: LIFO — birds land first,
 *     then the enemy spell still resolves.
 *  4. The tokens: exactly four, 1 Might, keyword Deflect, controlled by the caster, enter EXHAUSTED
 *     (185.2.d / 143.4), each placed at base or a battlefield the caster controls (439.2.b.1) —
 *     never at an enemy battlefield. Their Deflect is real: an enemy bolt at a Bird costs +1 power.
 *  5. Modes are chosen as the spell is played (355.3), before anyone can respond: `cast(c, {mode})`
 *     names it up front, a bare `cast(c)` is asked mode → target at once (still before priority).
 *  6. Cost: 4 + two calm; one calm short or 3 energy → not castable.
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-044-219";
const PREMONITION = "sfd-087-221";
const FILLER = "ogn-175-298";
const SHIELDBEARER = "ogn-051-298"; // Unit · 3 · When you play me, stun a unit. (a triggered ABILITY on the chain)

function bolt(name: string, energyCost = 1, powerCost: string[] = []) {
  return {
    abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
    cardType: "spell",
    domain: "fury",
    energyCost,
    name,
    powerCost,
    timing: "action",
  };
}

/** P2's turn: P2 bolts P1's 5-Might unit with `spell` and passes; P1 holds Flurry with 4 + calm×2. */
async function facing(spell: object, p2: { energy: number; power?: Record<string, number> } = { energy: 1 }) {
  const game = await scenario()
    .active(P2)
    .resources(P2, p2)
    .resources(P1, { energy: 4, power: { calm: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 5, name: "Victim" }, "victim")
    .hand(P2, spell, "spell")
    .hand(P1, CARD, "fof")
    .build();
  await game.p2.cast("spell", { targets: "victim" });
  await game.p2.passPriority();
  expect(game.actingSeat()).toBe(P1);
  return game;
}

function birdsOf(game: Awaited<ReturnType<typeof facing>>, at?: "base" | "bf1" | "bf2") {
  return game.p1.units(at).filter((id) => game.state(id).isToken);
}

describe("Flurry of Feathers (unl-044-219)", () => {
  test("cost + Reaction timing: on the opponent's chain for exactly 4 energy + 2 calm; lands on top of their spell as a non-triggered item", async () => {
    const game = await facing(bolt("Bolt"));
    expect(game.p1.can("cast", "fof")).toBe(true);
    await game.p1.cast("fof");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["spell", "fof"]);
    expect(game.chain()[1]).toMatchObject({ controller: P1, name: "Flurry of Feathers", triggered: false });
  });

  test("cost negative space: 4 energy + 1 calm, or 3 energy + 2 calm, cannot cast it", async () => {
    const oneCalm = await scenario().resources(P1, { energy: 4, power: { calm: 1, fury: 3 } }).hand(P1, CARD, "fof").build();
    expect(oneCalm.p1.can("cast", "fof")).toBe(false);
    const threeEnergy = await scenario().resources(P1, { energy: 3, power: { calm: 2 } }).hand(P1, CARD, "fof").build();
    expect(threeEnergy.p1.can("cast", "fof")).toBe(false);
  });

  test("mode 'Counter a spell': the enemy bolt is countered — no damage, both spells in the trash, the bolt's energy is not refunded (425.1)", async () => {
    const game = await facing(bolt("Bolt"));
    await game.p1.cast("fof");
    // rule 355.3 — asked as it is played, labelled with the printed bullets.
    const mode = game.decision() as PickDecision;
    expect(mode).toMatchObject({ kind: "pick", seat: P1, semantics: "mode" });
    expect(mode.options.map((o) => o.label)).toEqual(["Counter a spell", "Play four 1 [Might] Bird unit tokens with [Deflect]"]);
    await game.p1.chooseMode(0);
    expect(game.chain()[1]).toMatchObject({ cardId: "fof", mode: 0 });
    await game.settle(); // the only spell on the chain is the forced pick
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("spell")).toBe("trash");
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.state("victim").damage).toBe(0);
    expect(game.p2.energy()).toBe(0);
    expect(birdsOf(game)).toHaveLength(0); // the other mode did not also happen
  });

  test("no cost cap on the counter: a 9-energy, 3-power enemy spell is countered just the same", async () => {
    const game = await facing(bolt("Cataclysm", 9, ["fury", "fury", "fury"]), { energy: 9, power: { fury: 3 } });
    await game.p1.cast("fof", { mode: 0, targets: "spell" });
    await game.settle();
    expect(game.zoneOf("spell")).toBe("trash");
    expect(game.state("victim").damage).toBe(0);
  });

  test("mode 'Birds' in response does NOT stop the enemy spell: four Birds land first (LIFO), then the bolt still deals its 2", async () => {
    const game = await facing(bolt("Bolt"));
    await game.p1.cast("fof", { mode: 1 });
    await game.settle(); // both pass → Flurry resolves first
    // Each Bird asks base | a battlefield P1 controls; put them all in the base.
    for (let i = 0; i < 4; i++) {
      const d = game.decision() as PickDecision;
      expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
      expect(d.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf1"]); // never the enemy bf2
      await game.p1.pick("base");
    }
    expect(game.chain().map((i) => i.cardId)).toEqual(["spell"]); // Flurry resolved, bolt still waiting
    await game.settle();
    expect(game.state("victim").damage).toBe(2);
    expect(game.zoneOf("spell")).toBe("trash");
    expect(birdsOf(game, "base")).toHaveLength(4);
  });

  test("the tokens: exactly four 1-Might 'Bird' units with Deflect, controlled and owned by the caster, entering EXHAUSTED; split between base and a controlled battlefield as chosen", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { calm: 2 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .hand(P1, CARD, "fof")
      .build();
    await game.p1.cast("fof"); // own turn, empty chain: legal because the Bird mode needs no target (and is forced)
    await game.settle();
    await game.p1.pick("base");
    await game.p1.pick("battlefield-bf1");
    await game.p1.pick("battlefield-bf1");
    await game.p1.pick("base");
    expect(game.decision()?.kind).toBe("action");
    const all = birdsOf(game);
    expect(all).toHaveLength(4);
    expect(birdsOf(game, "base")).toHaveLength(2);
    expect(birdsOf(game, "bf1")).toHaveLength(2);
    expect(birdsOf(game, "bf2")).toHaveLength(0);
    for (const id of all) {
      expect(game.state(id)).toMatchObject({ baseMight: 1, cardType: "unit", controller: P1, isExhausted: true, isToken: true, might: 1, name: "Bird", owner: P1 });
      expect(game.state(id).keywords).toContain("Deflect");
    }
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("with no controlled battlefield the Birds simply enter the base — no destination prompt", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { calm: 2 } }).battlefield("bf2", { controller: P2 }).hand(P1, CARD, "fof").build();
    await game.p1.cast("fof"); // Bird mode forced (nothing to counter)
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(birdsOf(game, "base")).toHaveLength(4);
  });

  test("the Birds' Deflect is real: next turn an enemy bolt cannot choose a Bird without a spare power, and pays 1 (any domain) when it has one", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { calm: 2 } })
      .hand(P1, CARD, "fof")
      .hand(P2, bolt("Bolt A"), "boltA")
      .hand(P2, { ...bolt("Bolt B"), abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }], rulesText: "[Reaction]\nDeal 2 to a unit.", timing: "reaction" }, "boltB")
      .build();
    await game.p1.cast("fof");
    await game.settle();
    const bird = birdsOf(game, "base")[0] as string;
    await game.advanceTurn(); // → P2's turn with an empty pool
    await game.p2.do("addResources", { energy: 1 });
    const broke = await game.p2.try((p) => p.cast("boltA", { targets: bird }));
    expect(broke.ok).toBe(false);
    await game.p2.do("addResources", { power: { mind: 1 } });
    await game.p2.cast("boltA", { targets: bird });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.has(bird) ? game.zoneOf(bird) : "gone").not.toBe("base"); // 2 damage kills the 1-Might Bird
    expect(birdsOf(game, "base")).toHaveLength(3);
  });

  test("'a spell' only: with just a triggered ABILITY on the chain the counter mode has nothing to hit — the Shieldbearer's stun still resolves", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3 })
      .resources(P1, { energy: 4, power: { calm: 2 } })
      .unit(P1, "base", { might: 5, name: "Victim" }, "victim")
      .hand(P2, SHIELDBEARER, "sol")
      .hand(P1, CARD, "fof")
      .build();
    await game.p2.play("sol");
    await game.p2.pick("victim"); // rule 402 (finalization): the stun target is chosen before priority
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sol", triggered: true })]);
    await game.p2.passPriority();
    expect(game.p1.can("cast", "fof")).toBe(true); // still castable — the Bird mode keeps it legal
    // rule 355.8 — an ability is not "a spell": the counter mode is not offered at all.
    expect(game.p1.option("cast", "fof")?.fields.find((f) => f.name === "mode")?.options).toEqual([1]);
    expect((await game.p1.try((p) => p.cast("fof", { mode: 0 }))).ok).toBe(false);
    await game.p1.cast("fof"); // Bird mode forced
    await game.settle(); // Birds land; then the stun trigger resolves
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("victim");
      await game.settle();
    }
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.zoneOf("sol")).toBe("base");
    expect(game.state("victim").isStunned).toBe(true);
    expect(birdsOf(game, "base")).toHaveLength(4);
  });

  test("cannot counter itself (355.9.c): alone on the chain the counter mode is not a legal choice at all — the forced Bird mode resolves instead", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { calm: 2 } }).hand(P1, CARD, "fof").build();
    expect((await game.p1.try((p) => p.cast("fof", { mode: 0 }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("fof", { mode: 0, targets: "fof" }))).ok).toBe(false);
    await game.p1.cast("fof");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fof")).toBe("trash");
    expect(birdsOf(game)).toHaveLength(4);
    expect(game.decision()?.kind).toBe("action");
  });

  test("the mode is chosen as Flurry is played (355.3), before the opponent gets priority", async () => {
    const game = await facing(bolt("Bolt"));
    await game.p1.cast("fof");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "mode" });
    // …and naming it on the play needs no question: the counter's target rides on the chain item.
    const named = await facing(bolt("Bolt"));
    await named.p1.cast("fof", { mode: 0, targets: "spell" });
    expect(named.chain()[1]).toMatchObject({ cardId: "fof", mode: 0, targets: ["spell"] });
    expect(named.actingSeat()).toBe(P1);
    await named.p1.passPriority();
    expect(named.actingSeat()).toBe(P2); // P2 responds knowing a counter is coming
  });

  test("with no spell to counter, only the Bird mode is offered (355.8) — and being forced, it is not even asked", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { calm: 2 } }).hand(P1, CARD, "fof").build();
    const modeField = game.p1.option("cast", "fof")?.fields.find((f) => f.name === "mode");
    expect(modeField?.options).toEqual([1]);
    expect(modeField?.labels).toEqual(["Play four 1 [Might] Bird unit tokens with [Deflect]"]);
    await game.p1.cast("fof");
    expect(game.chain()[0]).toMatchObject({ cardId: "fof", mode: 1 });
    expect(game.decision()?.kind).toBe("action"); // no mode prompt: P1 keeps priority
  });

  test("registry payload matches the printed text: Reaction spell, 4 + calm×2, choice of [counter a spell | create 4× 1-Might Bird tokens with Deflect]", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "calm", energyCost: 4, name: "Flurry of Feathers", powerCost: ["calm", "calm"], timing: "reaction" });
    expect(def?.abilities).toEqual([
      {
        effect: {
          options: [
            { effect: { type: "counter" }, label: "Counter a spell" },
            { effect: { amount: 4, token: { keywords: ["Deflect"], might: 1, name: "Bird", type: "unit" }, type: "create-token" }, label: "Play four 1 [Might] Bird unit tokens with [Deflect]" },
          ],
          type: "choice",
        },
        timing: "reaction",
        type: "spell",
      },
    ]);
  });

  test("with two spells on the chain, the counter mode asks WHICH spell to counter (rule 355.8)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 4, power: { mind: 6 } })
      .deck(P2, [FILLER, FILLER, FILLER, FILLER, FILLER, FILLER], ["d1", "d2", "d3", "d4", "d5", "d6"])
      .resources(P1, { energy: 4, power: { calm: 2 } })
      .unit(P1, "base", { might: 5, name: "Victim" }, "victim")
      .hand(P2, PREMONITION, "premA")
      .hand(P2, PREMONITION, "premB")
      .hand(P1, CARD, "fof")
      .build();
    await game.p2.cast("premA");
    await game.p2.cast("premB");
    await game.p2.passPriority();
    await game.p1.cast("fof");
    await game.p1.chooseMode(0);
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target" });
    expect(d.options.map((o) => o.key).sort()).toEqual(["premA", "premB"]);
    await game.p1.pick("premA");
    expect(game.chain().find((i) => i.cardId === "fof")).toMatchObject({ targets: ["premA"] });
    await game.settle();
    expect(game.zoneOf("premA")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(3); // only premB drew
  });
});
