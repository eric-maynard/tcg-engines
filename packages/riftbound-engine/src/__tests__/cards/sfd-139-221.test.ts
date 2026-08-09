/**
 * Edge of Night — sfd-139-221 · Gear — Equipment · Chaos · 3 energy · Might bonus +2
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   When you play this from face down, attach it to a unit you control (here).
 *   [Equip] [chaos] ([chaos]: Attach this to a unit you control.)
 *
 * Head-judge checklist (the tricky spots for THIS card):
 *  1. Three ways onto a unit: (a) hard-cast for 3 to base, then [Equip] for one chaos at default speed;
 *     (b) hide for one power of ANY domain at a battlefield you control (no chain, 811.1.c.2), then from
 *     the NEXT turn play it from face down for 0 — it gains [Reaction] while facedown (811.6) and its
 *     play trigger attaches it for free; (c) Weaponmaster etc. (not covered here).
 *  2. "from face down" ONLY: the hard-cast from hand must NOT attach anything (negative space).
 *  3. "(here)" + 811.1.d.1.a/811.1.d.2: played from facedown the gear is played TO THAT BATTLEFIELD and
 *     the attach target must be a unit you control AT THAT BATTLEFIELD — a unit in base or elsewhere is
 *     not eligible; with no friendly unit there nothing is attached and the loose gear is recalled to
 *     base at the next cleanup (149.3).
 *  4. The defensive line: P2 attacks the battlefield hiding it; after the attacker passes Focus P1 flips
 *     it (Reaction), the trigger resolves before combat damage, the defender gets +2 and the fight turns.
 *  5. Same-turn restriction: cannot be played from facedown the turn it was hidden (811.1.b "beginning on
 *     the next turn"). Losing control of the battlefield trashes the facedown card at the cleanup.
 *  6. Costs: 3 energy flat from hand (2 is short); hide needs a power (chaos alone is fine — [rainbow] is
 *     any domain) and a battlefield you CONTROL; [Equip] needs exactly one chaos.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-139-221";

/** Pass priority around the play-from-hidden trigger; answer an attach prompt with `prefer` if asked. Returns what was offered. */
async function resolveFlip(game: Game, prefer?: string): Promise<string[]> {
  let offered: string[] = [];
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && (d.context === "main" || d.context === "showdown"))) {
      break;
    }
    if (d.kind === "pick" && d.seat === P1) {
      offered = d.options.map((o) => o.card ?? o.key).sort();
      await game.p1.pick(prefer ?? (d.options[0]?.key as string));
    } else if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  return offered;
}

describe("Edge of Night (sfd-139-221)", () => {
  test("registry payload: Hidden keyword, a play-from-hidden trigger attaching THIS to a friendly unit, and [Equip] costing exactly [chaos]; 3 energy, +2", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "chaos", energyCost: 3, mightBonus: 2, name: "Edge of Night" });
    expect(def?.powerCost).toBeUndefined();
    expect(def?.abilities).toHaveLength(3);
    expect(def?.abilities?.[0]).toEqual({ keyword: "Hidden", type: "keyword" });
    expect(def?.abilities?.[1]).toMatchObject({
      effect: { equipment: "self", to: { controller: "friendly", type: "unit" }, type: "attach" },
      trigger: { event: "play-from-hidden", on: "self" },
      type: "triggered",
    });
    expect(def?.abilities?.[2]).toEqual({ cost: { power: ["chaos"] }, keyword: "Equip", type: "keyword" });
  });

  test("hard-cast from hand: 3 energy (no power), base only, READY and unattached — the 'from face down' trigger does NOT fire; 2 energy is short", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Field" }, "field")
      .unit(P1, "base", { might: 2, name: "Home" }, "home")
      .hand(P1, CARD, "edge")
      .build();
    await game.p1.play("edge");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 1 } });
    await game.settle();
    expect(game.zoneOf("edge")).toBe("base");
    expect(game.state("edge")).toMatchObject({ attachedTo: undefined, isReady: true });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("home").might + game.state("field").might).toBe(4);
    expect((await scenario().resources(P1, { energy: 2, power: { chaos: 3 } }).hand(P1, CARD, "edge").build()).p1.can("play", "edge")).toBe(false);
  });

  test("[Equip] [chaos] from base: one chaos (not energy, not fury), an ability on the chain, +2 on resolution — 2+2 then beats a 3-Might defender", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .gear(P1, CARD, "edge")
      .build();
    await game.p1.choose("equipCard", { params: { equipmentId: "edge", unitId: "ally" } });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "edge", controller: P1 })]);
    await game.settle();
    expect(game.state("edge").attachedTo).toBe("ally");
    expect(game.state("ally")).toMatchObject({ baseMight: 2, might: 4 });
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    expect(game.locationOf("edge")).toBe("bf1");
    const fury = await scenario().resources(P1, { energy: 5, power: { fury: 2 } }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "edge").build();
    expect(fury.p1.legal().some((o) => o.moveId === "equipCard")).toBe(false);
  });

  test("Hide: one power of ANY domain (a lone chaos pays; energy untouched), only at a battlefield you control, no chain, facedown and hidden — and not flippable this same turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("mine", { controller: P1 })
      .battlefield("theirs", { controller: P2 })
      .battlefield("open", { controller: null })
      .unit(P1, "mine", { might: 2 }, "field")
      .hand(P1, CARD, "edge")
      .build();
    expect(game.p1.option("hide", "edge")?.fields.find((f) => f.arg === "to")?.options).toEqual(["mine"]);
    await game.p1.hide("edge", "mine");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { chaos: 0 } });
    expect(game.zoneOf("edge")).toBe("facedown-mine");
    expect(game.state("edge").isHidden).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("reveal", "edge")).toBe(false); // "beginning on the next turn" (811.1.b)
    const broke = await scenario().resources(P1, { energy: 9 }).battlefield("mine", { controller: P1 }).unit(P1, "mine", { might: 2 }, "u").hand(P1, CARD, "edge").build();
    expect(broke.p1.can("hide", "edge")).toBe(false); // no power at all
  });

  test("the defensive flip (811.6 + trigger): P2's 3-Might raider attacks bf1; after the attacker passes Focus P1 plays Edge from facedown for 0, it attaches to the lone 2-Might guard (+2 → 4) before damage — raider dies, guard holds", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .facedown(P1, "bf1", CARD, "edge", { hiddenOnTurn: 0 })
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.p1.can("reveal", "edge")).toBe(false); // attacker holds Focus first
    await game.p2.passFocus();
    expect(game.decision() as ActionDecision).toMatchObject({ context: "showdown", seat: P1 });
    await game.p1.reveal("edge");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // [energy_0], no power
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "edge", controller: P1, triggered: true })]);
    await resolveFlip(game, "guard");
    expect(game.state("edge").attachedTo).toBe("guard");
    expect(game.locationOf("edge")).toBe("bf1");
    expect(game.state("guard").might).toBe(4);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.state("guard").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control: the same attack WITHOUT flipping Edge kills the 2-Might guard, P2 conquers — and the facedown Edge is trashed with the lost battlefield (cleanup)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .facedown(P1, "bf1", CARD, "edge", { hiddenOnTurn: 0 })
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.zoneOf("edge")).toBe("trash");
    expect(game.p1.trash()).toContain("edge");
  });

  test("hidden this turn, flipped on your NEXT turn in Neutral Open: costs nothing and ends attached to the unit at that battlefield", async () => {
    const game = await scenario()
      .resources(P1, { power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Sentry" }, "sentry")
      .hand(P1, CARD, "edge")
      .build();
    await game.p1.hide("edge", "bf1");
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    expect(game.zoneOf("edge")).toBe("facedown-bf1");
    const before = game.p1.resources();
    await game.p1.reveal("edge");
    expect(game.p1.resources()).toEqual(before);
    await resolveFlip(game, "sentry");
    await game.settle();
    expect(game.state("edge").attachedTo).toBe("sentry");
    expect(game.state("sentry").might).toBe(5);
    expect(game.locationOf("edge")).toBe("bf1");
  });

  test("'(here)' / 811.1.d — flipped at bf1 with allies at bf1 AND a unit in base, only the bf1 units may receive it; the base unit must stay bare", async () => {
    // Expected: the attach prompt (if any) offers exactly ally/ally2 (both at bf1); picking ally makes it 5 and Edge sits at bf1;
    // Home (base) is untouched. Actual: the gear is put into BASE on the flip, "here" is read as base, and it auto-attaches to Home.
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Ally" }, "ally")
      .unit(P1, "bf1", { might: 1, name: "Ally2" }, "ally2")
      .unit(P1, "base", { might: 2, name: "Home" }, "home")
      .facedown(P1, "bf1", CARD, "edge", { hiddenOnTurn: 0 })
      .build();
    await game.p1.reveal("edge");
    const offered = await resolveFlip(game, "ally");
    await game.settle();
    if (offered.length > 0) {
      expect(offered).toEqual(["ally", "ally2"]);
    }
    expect(game.state("home").attachments).toEqual([]);
    expect(game.state("home").might).toBe(2);
    expect(game.state("edge").attachedTo).toBe("ally");
    expect(game.state("ally").might).toBe(5);
    expect(game.locationOf("edge")).toBe("bf1");
  });

  test("no friendly unit at that battlefield ⇒ nothing to attach — the flipped gear stays loose and is recalled to base UNATTACHED (149.3); the base unit is not equipped", async () => {
    // Expected: Home keeps 2 Might and no attachments; Edge ends in base with attachedTo undefined.
    // Actual: Edge lands in base on the flip and attaches itself to Home (4 Might).
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 2, name: "Home" }, "home")
      .facedown(P1, "bf1", CARD, "edge", { hiddenOnTurn: 0 })
      .build();
    expect(game.p1.can("reveal", "edge")).toBe(true); // a permanent with a targetless-able trigger is still playable
    await game.p1.reveal("edge");
    await resolveFlip(game);
    await game.settle();
    expect(game.state("home").attachments).toEqual([]);
    expect(game.state("home").might).toBe(2);
    expect(game.state("edge").attachedTo).toBeUndefined();
    expect(game.zoneOf("edge")).toBe("base");
  });

  test("bearer dies later ⇒ Edge detaches and is recalled to base (719.5 / 149.3), not trashed, and can be re-Equipped for [chaos]", async () => {
    const game = await scenario()
      .resources(P1, { power: { chaos: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .unit(P1, "base", { might: 1, name: "Spare" }, "spare")
      .gear(P1, CARD, "edge")
      .build();
    await game.p1.choose("equipCard", { params: { equipmentId: "edge", unitId: "ally" } });
    await game.settle();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("edge")).toBe("base");
    expect(game.state("edge").attachedTo).toBeUndefined();
    await game.p1.choose("equipCard", { params: { equipmentId: "edge", unitId: "spare" } });
    await game.settle();
    expect(game.state("spare").might).toBe(3);
    expect(game.p1.power("chaos")).toBe(0);
  });
});
