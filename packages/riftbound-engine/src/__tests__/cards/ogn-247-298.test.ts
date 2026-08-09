/**
 * Daughter of the Void — ogn-247-298 · Legend (Kai'Sa) · Fury/Mind
 *
 *   [Exhaust]: [Reaction] — [Add] [rainbow]. Use only to play spells.
 *   (Abilities that add resources can't be reacted to.)
 *
 * Rules: 429.2/400.2/337.2 (an [Add] ability resolves the moment it is finalized — it never waits on
 * the chain and nobody gets priority off it), 813 ([Reaction] on an ability = may be activated in
 * showdowns and closed states on ANY player's turn; it is permission only), 316.5.b (in the Neutral
 * Open State of the opponent's turn only the turn player may activate anything), 135.2.e.5.b ([rainbow]
 * added to the pool pays a Power cost of ANY domain), 429.4 + printed text ("Use only to play spells":
 * the added power is earmarked — it must not fund a unit, a gear, or an activated ability such as
 * [Equip]), 167 (unspent power empties at end of turn), Awaken readies the legend.
 *
 * Head-judge checklist for THIS card:
 *  1. It is a mana LEGEND: the cost is only [Exhaust]; once a turn cycle (readies at your Awaken).
 *  2. Reaction timing: legal on your own turn (open state and mid-showdown), legal with priority on the
 *     opponent's chain, NOT legal in the opponent's neutral open state.
 *  3. It never becomes a chain item: chain length is unchanged and the acting seat does not flip to P2.
 *  4. The rainbow pays a [fury] pip of a spell (Hextech Ray) — the whole point of the card — including
 *     inside a combat showdown where the Ray then kills the lone defender and the attacker conquers.
 *  5. Earmark (negative space): the same rainbow must NOT make a [fury]-pip UNIT playable, nor pay a
 *     gear's [Equip] [fury]. The hand-authored ability drops the restriction and the engine only
 *     earmarks Energy → BUG tests.
 *  6. Leftover rainbow is gone next turn; an exhausted legend offers nothing.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ogn-247-298";
const HEXTECH_RAY = "ogn-009-298"; // Fury spell · [Action] · 1 + [fury] · Deal 3 to a unit at a battlefield.
const CLEAVE = "ogn-004-298"; // Fury spell · [Action] · 1 · Give a unit [Assault 3] this turn.
const RECURVE_BOW = "sfd-016-221"; // Fury Equipment · 2 · [Equip] [fury]
const FURY_PIP_UNIT = { cardType: "unit", domain: "fury", energyCost: 0, might: 2, name: "Pip Recruit", powerCost: ["fury"] } as const;

function withLegend(meta?: { exhausted?: boolean }) {
  return scenario().card("dov", { def: CARD, meta, owner: P1, zone: "legendZone" });
}

describe("Daughter of the Void (ogn-247-298)", () => {
  test("registry payload: Kai'Sa Fury/Mind legend with ONE activated [Exhaust] Reaction ability that adds [rainbow]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Kai'Sa", domain: ["fury", "mind"], name: "Daughter of the Void" });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      cost: { exhaust: true },
      effect: { power: ["rainbow"], type: "add-resource" },
      timing: "reaction",
      type: "activated",
    });
    expect((def?.abilities?.[0] as { cost?: { energy?: number } }).cost?.energy ?? 0).toBe(0);
  });

  test("payload should carry the printed 'Use only to play spells' earmark (restriction: 'spell') like Lux, Crownguard (429.4)", async () => {
    // Expected: effect { type:"add-resource", power:["rainbow"], restriction:"spell" } (the parser emits this
    // for the identical Lux wording). Actual: the hand-authored ability omits the restriction entirely.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def?.abilities?.[0]).toMatchObject({ effect: { power: ["rainbow"], restriction: "spell", type: "add-resource" } });
  });

  test("[Exhaust]: adds 1 rainbow power at once — legend exhausted, nothing on the chain, P1 keeps the open main phase (429.2)", async () => {
    const game = await withLegend().build();
    expect(game.state("dov").isReady).toBe(true);
    expect(game.p1.can("activate", "dov")).toBe(true);
    await game.p1.activate("dov");
    expect(game.state("dov").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.chain()).toEqual([]);
    expect(game.decision() as ActionDecision).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "dov")).toBe(false); // already exhausted: once per ready cycle
    expect(game.violations()).toEqual([]);
  });

  test("exhausted legend: not offered; it readies at P1's next Awaken and works again; leftover rainbow emptied at end of turn (167)", async () => {
    const game = await withLegend({ exhausted: true }).build();
    expect(game.state("dov").isExhausted).toBe(true);
    expect(game.p1.can("activate", "dov")).toBe(false);
    await game.advanceTurn(); // → P2
    expect(game.state("dov").isExhausted).toBe(true); // the opponent's Awaken does not ready my legend
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("dov").isReady).toBe(true);
    await game.p1.activate("dov");
    expect(game.p1.power("rainbow")).toBe(1);
    await game.advanceTurn();
    expect(game.p1.power()).toBe(0);
  });

  test("the added [rainbow] pays the [fury] pip of a spell: Hextech Ray (1 + [fury]) becomes castable and drains the pool", async () => {
    const game = await withLegend()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Target" }, "target")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    expect(game.p1.can("cast", "ray")).toBe(false); // no power for the pip
    await game.p1.activate("dov");
    expect(game.p1.can("cast", "ray")).toBe(true);
    await game.p1.cast("ray", { targets: "target" });
    expect([game.p1.energy(), game.p1.power()]).toEqual([0, 0]);
    await game.settle();
    expect(game.state("target").damage).toBe(3);
    expect(game.zoneOf("ray")).toBe("trash");
  });

  test("[Reaction] in a combat showdown on my turn: activate with Focus, Ray the lone 3-Might defender dead, then the attacker conquers", async () => {
    const game = await withLegend()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Skirmisher" }, "atk")
      .unit(P2, "bf1", { might: 3, name: "Defender" }, "def")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    await game.p1.move("atk", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "ray")).toBe(false);
    expect(game.p1.can("activate", "dov")).toBe(true);
    await game.p1.activate("dov");
    expect(game.chain()).toEqual([]); // still no chain item
    expect(game.actingSeat()).toBe(P1); // focus did not pass (429.2.a)
    await game.p1.cast("ray", { targets: "def" });
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("[Reaction] on the OPPONENT's turn: not in their neutral open state (316.5.b), but legal with priority on their chain — and it does not join that chain", async () => {
    const idle = await withLegend().active(P2).build();
    expect(idle.p1.can("activate", "dov")).toBe(false);

    const game = await withLegend()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P2, "base", { might: 2, name: "Theirs" }, "theirs")
      .hand(P2, CLEAVE, "cleave")
      .build();
    await game.p2.cast("cleave", { targets: "theirs" });
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "dov")).toBe(true);
    await game.p1.activate("dov");
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
    expect(game.actingSeat()).toBe(P1); // P1 still holds priority; P2 got no window off the Add
    await game.settle();
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.turnPlayer()).toBe(P2);
  });

  test("only its controller may use it: P2 is never offered P1's legend ability", async () => {
    const game = await withLegend().active(P2).build();
    expect(game.p2.can("activate", "dov")).toBe(false);
    expect((await game.p2.try((p) => p.activate("dov", 0))).ok).toBe(false);
    expect(game.state("dov").isReady).toBe(true);
  });

  test("'Use only to play spells' — the added rainbow must NOT make a [fury]-pip unit playable (429.4)", async () => {
    // Expected: with 0 energy and only the earmarked rainbow, the 0+[fury] unit stays unplayable while the
    // 1+[fury] spell (given 1 energy) is fine. Actual: the rainbow is ordinary power and the unit can be played.
    const game = await withLegend().hand(P1, FURY_PIP_UNIT, "recruit").build();
    expect(game.p1.can("play", "recruit")).toBe(false);
    await game.p1.activate("dov");
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.p1.can("play", "recruit")).toBe(false);
    // Sanity: real fury power does play it.
    const control = await withLegend().resources(P1, { power: { fury: 1 } }).hand(P1, FURY_PIP_UNIT, "recruit").build();
    expect(control.p1.can("play", "recruit")).toBe(true);
  });

  test("'Use only to play spells' — the added rainbow must NOT pay a gear's [Equip] [fury] activation (an ability is not a spell)", async () => {
    // Expected: Recurve Bow's Equip stays unaffordable off the earmarked rainbow. Actual: equipCard is offered.
    const game = await withLegend().unit(P1, "base", { might: 2 }, "ally").gear(P1, RECURVE_BOW, "bow").build();
    expect(game.p1.can("equipCard")).toBe(false);
    await game.p1.activate("dov");
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.p1.can("equipCard")).toBe(false);
  });
});
