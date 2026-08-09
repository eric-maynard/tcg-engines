/**
 * Scorn of the Moon — unl-197-219 · Legend (Diana) · Mind/Chaos
 *
 *   [Reaction][>] [Exhaust]: [Add] [1]. Spend this Energy only during showdowns.
 *   (Abilities that add resources can't be reacted to.)
 *
 * Head-judge checklist (the tricky spots for THIS card):
 *  1. [Add] abilities resolve immediately on being finalized (400.2): no chain item, no priority
 *     window for the opponent, the Energy is in the pool the moment the legend exhausts — even
 *     mid-chain or mid-showdown, and whoever held priority/focus keeps it.
 *  2. [Reaction] timing (813): your own Neutral Open turn, any Closed state (holding priority on the
 *     opponent's chain), any showdown while holding Focus. NOT the opponent's Neutral Open state —
 *     only the turn player acts there (316.5.b).
 *  3. The rider "Spend this Energy only during showdowns" is a spending RESTRICTION on that 1 Energy:
 *     it may be ADDED any time the ability is legal, but may only PAY for something while a showdown
 *     is in progress. Outside a showdown it must not make a 1-cost card affordable; inside one it
 *     pays for an [Action]/[Reaction] spell normally. Unspent, it empties with the pool at end of turn.
 *  4. Cost is [Exhaust] only: works at 0 energy; an exhausted legend cannot pay; once per ready-cycle
 *     (readies in its controller's Awaken step).
 *  5. Natural partner: a cheap [Action]/[Reaction] spell during a defence — the extra Energy turns a
 *     0-energy defender into one that can bolt the attacker dead before combat damage.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-197-219";
/** 1-cost [Action] spell: deal 3 to a unit. */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  name: "Test Bolt",
  rulesText: "[Action] Deal 3 to a unit.",
  timing: "action",
};
/** 1-cost [Reaction] spell: deal 1 to a unit. */
const PING = { ...BOLT, abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }], name: "Test Ping", rulesText: "[Reaction] Deal 1 to a unit.", timing: "reaction" };
const RECRUIT = { cardType: "unit", energyCost: 1, might: 1, name: "One-Drop" } as const;

/** P2 to act with a 3-Might raider; P1 (0 energy) defends bf1 with a 2-Might guard, legend ready, Bolt in hand. */
function defence() {
  return scenario()
    .active(P2)
    .legend(P1, CARD, "scorn")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, BOLT, "bolt");
}

describe("Scorn of the Moon (unl-197-219)", () => {
  test("registry payload (shape): a [Reaction] activated ability, cost {exhaust}, effect add-resource 1 Energy", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Diana", domain: ["mind", "chaos"], name: "Scorn of the Moon" });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({ cost: { exhaust: true }, effect: { energy: 1, type: "add-resource" }, timing: "reaction", type: "activated" });
  });

  test("registry payload drops 'Spend this Energy only during showdowns' — the add-resource effect should carry a showdown-only spending restriction", async () => {
    // Expected: effect { type: "add-resource", energy: 1, restriction: <something naming showdowns> } (cf. the
    // `restriction` earmark used for "use only to play spells", 429.4). Actual: { type, energy } only.
    const def = (await loadDefaultCardPool()).get(CARD);
    const effect = (def?.abilities?.[0] as { effect: Record<string, unknown> }).effect;
    expect(Object.keys(effect).sort()).not.toEqual(["energy", "type"]);
    expect(JSON.stringify(effect)).toMatch(/showdown/i);
  });

  test("own turn, Neutral Open, empty pool: exhausts the legend and the 1 Energy is in the pool at once — no chain item, no priority for P2 (400.2)", async () => {
    const game = await scenario().legend(P1, CARD, "scorn").unit(P2, "base", { might: 1 }, "foe").build();
    await game.p1.activate("scorn");
    expect(game.state("scorn").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "scorn")).toBe(false); // exhausted: once per ready-cycle
  });

  test("[Reaction] in a Closed state on the OPPONENT's turn: holding priority on P2's spell, P1 adds 1; the chain is untouched and P1 still holds priority", async () => {
    const game = await defence().resources(P2, { energy: 1 }).hand(P2, PING, "ping").build();
    expect(game.p1.can("activate", "scorn")).toBe(false); // P2's Neutral Open: only the turn player acts (316.5.b)
    await game.p2.cast("ping", { targets: "guard" });
    expect(game.p1.can("activate", "scorn")).toBe(false); // P2 still holds priority
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "scorn")).toBe(true);
    await game.p1.activate("scorn");
    expect(game.p1.energy()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ping", controller: P2 })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("partner play — defending with 0 energy: attacker passes Focus, P1 exhausts Scorn (+1) and Bolts the 3-Might raider dead before combat; guard untouched, bf1 held", async () => {
    const game = await defence().build();
    await game.p2.move("raider", "bf1");
    expect(game.p1.can("activate", "scorn")).toBe(false); // attacker has Focus first
    await game.p2.passFocus();
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "bolt")).toBe(false); // 0 energy
    await game.p1.activate("scorn");
    expect(game.p1.energy()).toBe(1);
    expect(game.actingSeat()).toBe(P1); // Focus kept — nothing to respond to
    expect(game.p1.can("cast", "bolt")).toBe(true);
    await game.p1.cast("bolt", { targets: "raider" });
    expect(game.p1.energy()).toBe(0); // the showdown Energy paid for it
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.state("guard").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.state("scorn").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("Energy added BEFORE the showdown may still be spent DURING it: add in Neutral Open, attack, then cast the 1-cost [Action] Bolt with Focus", async () => {
    const game = await scenario()
      .legend(P1, CARD, "scorn")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .hand(P1, BOLT, "bolt")
      .build();
    await game.p1.activate("scorn");
    expect(game.p1.energy()).toBe(1);
    await game.p1.move("scout", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.p1.cast("bolt", { targets: "foe" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("'Spend this Energy only during showdowns' — in a Neutral Open state the added Energy must NOT make a 1-cost unit playable", async () => {
    // Expected: after +1 in Neutral Open, One-Drop (1 energy) is still unaffordable because the only Energy in the
    // pool is showdown-restricted; trying to play it fails and the Energy stays. Actual: the Energy is ordinary and
    // the unit is playable.
    const game = await scenario().legend(P1, CARD, "scorn").hand(P1, RECRUIT, "drop").build();
    expect(game.p1.can("play", "drop")).toBe(false);
    await game.p1.activate("scorn");
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.can("play", "drop")).toBe(false);
    expect((await game.p1.try((p) => p.play("drop"))).ok).toBe(false);
    expect(game.zoneOf("drop")).toBe("hand");
  });

  test("'only during showdowns' also excludes a plain chain — priority on P2's non-showdown spell must not let the added Energy pay for a [Reaction] Ping", async () => {
    // Expected: P1 may ADD the Energy while holding priority (Reaction), but with no showdown in progress the
    // restricted Energy cannot pay Ping's 1 — casting it is illegal. Actual: Ping becomes castable.
    const game = await scenario()
      .active(P2)
      .legend(P1, CARD, "scorn")
      .resources(P2, { energy: 1 })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .hand(P2, PING, "theirs")
      .hand(P1, PING, "mine")
      .build();
    await game.p2.cast("theirs", { targets: "ally" });
    await game.p2.passPriority();
    await game.p1.activate("scorn");
    expect(game.p1.energy()).toBe(1);
    expect(game.gameState.interaction?.showdownStack?.some((s) => s.active) ?? false).toBe(false);
    expect(game.p1.can("cast", "mine")).toBe(false);
  });

  test("unspent, the Energy is lost with the pool at end of turn: added during P2's showdown and not used → 0 when P1's turn opens", async () => {
    const game = await defence().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.activate("scorn");
    expect(game.p1.energy()).toBe(1);
    await game.settle(); // combat: raider 3 kills guard 2, conquers
    expect(game.zoneOf("guard")).toBe("trash");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.energy()).toBe(0);
    expect(game.state("scorn").isReady).toBe(true); // Awaken readied it
  });

  test("cost edge: an exhausted legend offers nothing — not on your turn, not with Focus in a showdown", async () => {
    const own = await scenario().card("scorn", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" }).build();
    expect(own.p1.can("activate", "scorn")).toBe(false);
    const game = await scenario()
      .active(P2)
      .card("scorn", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "scorn")).toBe(false);
    expect(game.p1.energy()).toBe(0);
  });

  test("negative space: the opponent's legend is theirs — P2 can never activate P1's Scorn, even on P2's own turn", async () => {
    const game = await scenario().active(P2).legend(P1, CARD, "scorn").build();
    expect(game.p2.can("activate", "scorn")).toBe(false);
    expect(game.p2.legal().some((o) => o.card === "scorn")).toBe(false);
  });
});
