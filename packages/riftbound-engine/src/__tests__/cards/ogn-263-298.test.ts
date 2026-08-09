/**
 * Swift Scout — ogn-263-298 · Legend (Teemo) · Mind/Chaos
 *
 *   You may pay [1] to hide a card with [Hidden] instead of [rainbow].
 *   [1], [Exhaust]: Put a Teemo unit you own into your hand from your Champion Zone or the board.
 *
 * Rules: 811.1.b (Hide: pay [rainbow] on your turn in an Open State, at a battlefield you control),
 * 811.1.c.2 (hiding opens no chain), 355.8 (an ability needs a valid target to be activated),
 * 355.9.a.5 ("unit in the Champion Zone"), 108.2/127.1 (owner ≠ controller), 313.1.a (an untagged
 * activated ability is Neutral-Open-on-your-turn only), 174.8 (legends have activated abilities).
 *
 * Head-judge checklist (trickiest situations for THIS card):
 *  1. The static is an ALTERNATIVE payment: 1 energy and no power must be enough to Hide any
 *     [Hidden] card (not only Teemo); power-only still works; with both, exactly one is spent.
 *     It changes only the Hide cost — you still need a battlefield you control and it is still not
 *     legal on the opponent's turn; playing from facedown later still costs 0.
 *  2. The activated ability reaches into the CHAMPION ZONE (an off-board zone) as well as the board:
 *     an unplayed Teemo, Scout can be put into hand for [1] — and with the champion zone as the only
 *     Teemo the ability must still be activatable.
 *  3. "Teemo unit you OWN": a non-Teemo unit is never a choice; a Teemo you own that the opponent
 *     currently controls IS (ownership, not control) and it goes to YOUR hand.
 *  4. No Teemo anywhere → the ability cannot be activated at all (355.8) — the [1] is not spent.
 *  5. Costs: exactly 1 energy + the legend exhausts; an exhausted legend or an empty pool blocks it.
 *     It is a chain item (not an Add), so the opponent gets priority before Teemo leaves the board.
 *  6. The loop the card exists for: Teemo on the board → back to hand → Hide it → a later turn plays
 *     it from facedown for 0 to that battlefield with its play trigger again.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ogn-263-298";
const TEEMO_SCOUT = "ogn-197-298"; // Chaos · 2 · 1 Might · [Hidden] · When you play me, give me +3 Might this turn.
const TEEMO_STRATEGIST = "ogn-121-298"; // Mind · 2+[mind] · 2 Might · [Hidden] · defend trigger
const FOX_FIRE = "ogn-256-298"; // Calm/Mind spell · [Hidden] [Action] Kill any number of units at a battlefield with total Might ≤ 4.

function hideBoard(res: { energy?: number; power?: Record<string, number> }) {
  return scenario()
    .resources(P1, res)
    .legend(P1, CARD, "scout")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .hand(P1, TEEMO_SCOUT, "teemo")
    .hand(P1, FOX_FIRE, "ff");
}

describe("Swift Scout (ogn-263-298)", () => {
  test("registry payload: a static that swaps the Hide cost to [1] and an activated [1]+[Exhaust] return-to-hand of a Teemo unit from champion zone or board", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Teemo", domain: ["mind", "chaos"], name: "Swift Scout" });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({ type: "static" });
    expect(abilities[1]).toMatchObject({
      cost: { energy: 1, exhaust: true },
      effect: { target: { filter: { tag: "Teemo" }, type: "unit" }, type: "return-to-hand" },
      type: "activated",
    });
  });

  test("static — with 1 energy and NO power a [Hidden] card can be hidden by paying [1] instead of [rainbow] (811.1.b + this card)", async () => {
    // Expected: hide is legal and costs exactly 1 energy; Teemo goes facedown at bf1, no chain.
    // Actual: hideCard only ever checks/deducts a power — the legend's static is not consulted.
    const game = await hideBoard({ energy: 1 }).build();
    expect(game.p1.can("hide", "teemo")).toBe(true);
    await game.p1.hide("teemo", "bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("teemo")).toBe("facedown-bf1");
    expect(game.chain()).toEqual([]);
  });

  test("static applies to ANY [Hidden] card, not just Teemo — Fox-Fire hides for [1] energy with an empty power pool", async () => {
    // Expected: legal, energy 1 → 0. Actual: not offered without a power.
    const game = await hideBoard({ energy: 1 }).build();
    expect(game.p1.can("hide", "ff")).toBe(true);
    await game.p1.hide("ff", "bf1");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("ff")).toBe("facedown-bf1");
  });

  test("static is 'may … instead': paying the normal [rainbow] (one power of any domain) still hides with 0 energy", async () => {
    const game = await hideBoard({ energy: 0, power: { chaos: 1 } }).build();
    expect(game.p1.can("hide", "teemo")).toBe(true);
    await game.p1.hide("teemo", "bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("teemo")).toBe("facedown-bf1");
    expect(game.state("teemo").isHidden).toBe(true);
  });

  test("with both 1 energy and 1 power available exactly ONE of them is spent on the hide — never both, never neither", async () => {
    const game = await hideBoard({ energy: 1, power: { mind: 1 } }).build();
    await game.p1.hide("teemo", "bf1");
    const r = game.p1.resources();
    expect(r.energy + (r.power.mind ?? 0)).toBe(1);
    expect(game.zoneOf("teemo")).toBe("facedown-bf1");
  });

  test("static changes only the cost: no battlefield you control → no hide even with energy and power; not on the opponent's turn either", async () => {
    const noBf = await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).legend(P1, CARD, "scout").battlefield("bf1", { controller: P2 }).hand(P1, TEEMO_SCOUT, "teemo").build();
    expect(noBf.p1.can("hide", "teemo")).toBe(false);
    const oppTurn = await hideBoard({ energy: 3, power: { chaos: 1 } }).active(P2).build();
    expect(oppTurn.p1.can("hide", "teemo")).toBe(false);
  });

  test("[1],[Exhaust]: returns a Teemo unit on the board to its owner's hand — pays exactly 1 energy, exhausts the legend, uses the chain, statuses are shed", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .legend(P1, CARD, "scout")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", TEEMO_SCOUT, "teemo", { damage: 0, exhausted: true })
      .unit(P1, "base", { might: 2, name: "Grunt" }, "grunt")
      .build();
    expect(game.p1.can("activate", "scout")).toBe(true);
    await game.p1.activate("scout");
    expect(game.p1.energy()).toBe(1);
    expect(game.state("scout").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "scout", controller: P1 })]);
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1"); // not yet — the opponent may respond first
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("teemo");
      await game.settle();
    }
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.p1.hand()).toContain("teemo");
    expect(game.zoneOf("grunt")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("'a Teemo unit': a non-Teemo unit is never offered — with two Teemos the prompt lists exactly those two and the chosen one goes to hand", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { mind: 1 } })
      .legend(P1, CARD, "scout")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", TEEMO_SCOUT, "teemoA")
      .unit(P1, "base", TEEMO_STRATEGIST, "teemoB")
      .unit(P1, "base", { might: 2, name: "Grunt" }, "grunt")
      .unit(P2, "base", { might: 2, name: "Enemy" }, "enemy")
      .build();
    // The Teemo to return is this ability's target, chosen as it is activated (355.5).
    const offered = game.p1.option("activate", "scout")?.fields.find((f) => f.arg === "targets")?.options ?? [];
    expect([...offered].map(String).sort()).toEqual(["teemoA", "teemoB"]);
    expect((await game.p1.try((p) => p.activate("scout", 1, { targets: "grunt" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.activate("scout", 1, { targets: "enemy" }))).ok).toBe(false);
    await game.p1.activate("scout", 1, { targets: "teemoB" });
    await game.settle();
    expect(game.zoneOf("teemoB")).toBe("hand");
    expect(game.zoneOf("teemoA")).toBe("battlefield-bf1");
    expect(game.zoneOf("grunt")).toBe("base");
  });

  test("'… from your Champion Zone': an unplayed Teemo, Scout in the champion zone can be put into hand (355.9.a.5) — with it as the only Teemo the ability is still activatable", async () => {
    // Expected: activate is legal; after resolution teemo is in P1's hand, energy 0, legend exhausted.
    // Actual: the target pool is the board only, so with no Teemo on the board nothing is offered.
    const game = await scenario().resources(P1, { energy: 1 }).legend(P1, CARD, "scout").champion(P1, TEEMO_SCOUT, "teemo").build();
    expect(game.zoneOf("teemo")).toBe("championZone");
    expect(game.p1.can("activate", "scout")).toBe(true);
    await game.p1.activate("scout");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("teemo");
      await game.settle();
    }
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.p1.champion()).toBeUndefined();
    expect(game.p1.energy()).toBe(0);
    expect(game.state("scout").isExhausted).toBe(true);
  });

  test("no Teemo unit anywhere → the ability cannot be activated at all (355.8) and nothing is spent", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).legend(P1, CARD, "scout").unit(P1, "base", { might: 2, name: "Grunt" }, "grunt").build();
    expect(game.p1.can("activate", "scout")).toBe(false);
    const r = await game.p1.try((p) => p.activate("scout", 1));
    expect(r.ok).toBe(false);
    expect(game.p1.energy()).toBe(3);
    expect(game.state("scout").isReady).toBe(true);
  });

  test("cost gates: an exhausted legend, or a ready legend with 0 energy and no runes, cannot activate even with Teemo on the board", async () => {
    const tired = await scenario()
      .resources(P1, { energy: 3 })
      .card("scout", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .unit(P1, "base", TEEMO_SCOUT, "teemo")
      .build();
    expect(tired.state("scout").isExhausted).toBe(true);
    expect(tired.p1.can("activate", "scout")).toBe(false);
    const broke = await scenario().resources(P1, { energy: 0, power: { chaos: 2 } }).legend(P1, CARD, "scout").unit(P1, "base", TEEMO_SCOUT, "teemo").build();
    expect(broke.p1.can("activate", "scout")).toBe(false);
  });

  test("timing (313.1.a): no [Action]/[Reaction] — not on the opponent's turn and not during a showdown you opened", async () => {
    const opp = await scenario().active(P2).resources(P1, { energy: 1 }).legend(P1, CARD, "scout").unit(P1, "base", TEEMO_SCOUT, "teemo").build();
    expect(opp.p1.can("activate", "scout")).toBe(false);
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .legend(P1, CARD, "scout")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "guard")
      .unit(P1, "base", TEEMO_SCOUT, "teemo")
      .unit(P1, "base", { might: 3 }, "runner")
      .build();
    expect(game.p1.can("activate", "scout")).toBe(true);
    await game.p1.move("runner", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "scout")).toBe(false);
  });

  test("'you OWN' is ownership, not control (108.2/127.1): a Teemo P1 owns but P2 controls can be taken back into P1's hand", async () => {
    // Expected: the stolen Teemo is a legal choice and lands in its OWNER's (P1's) hand.
    // Actual: the parsed target is `controller: friendly`, so an enemy-controlled Teemo you own is excluded.
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .legend(P1, CARD, "scout")
      .battlefield("bf1", { controller: P2 })
      .card("teemo", { controller: P2, def: TEEMO_SCOUT, owner: P1, zone: "bf1" })
      .build();
    expect(game.state("teemo")).toMatchObject({ controller: P2, owner: P1 });
    expect(game.p1.can("activate", "scout")).toBe(true);
    await game.p1.activate("scout");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("teemo");
      await game.settle();
    }
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.p1.hand()).toContain("teemo");
    expect(game.p2.hand()).not.toContain("teemo");
  });

  test("the loop: bounce Teemo, Scout from bf1, hide it there for a power, and two turns later play it from facedown for 0 — it re-enters at bf1 as a 4-Might unit", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { chaos: 1 } })
      .legend(P1, CARD, "scout")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P1, "bf1", TEEMO_SCOUT, "teemo")
      .build();
    expect(game.state("teemo").might).toBe(1); // the old +3 is long gone
    await game.p1.activate("scout");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("teemo");
      await game.settle();
    }
    expect(game.zoneOf("teemo")).toBe("hand");
    await game.p1.hide("teemo", "bf1");
    expect(game.zoneOf("teemo")).toBe("facedown-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    expect(game.state("scout").isReady).toBe(true); // the legend readied in P1's Awaken step
    const energyBefore = game.p1.energy();
    await game.p1.reveal("teemo");
    expect(game.p1.energy()).toBe(energyBefore); // played ignoring its cost
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.state("teemo").might).toBe(4);
  });
});
