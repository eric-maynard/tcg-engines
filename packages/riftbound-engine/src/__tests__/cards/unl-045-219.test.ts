/**
 * Forgotten Signpost — unl-045-219 · Gear · Calm · 2 energy
 *
 *   [Action][>] Exhaust a unit you control, [Exhaust]: Move a different unit you control to the
 *   location of the unit you exhausted to pay for this ability.
 *
 * Head-judge notes (the tricky spots this file covers):
 *   1. TWO costs (204.1.b): exhaust a READY unit you control (chosen as a cost, so it is not a
 *      target — 355.10.c.1) AND exhaust the Signpost. Neither cost alone suffices; an exhausted unit
 *      cannot be exhausted again to pay.
 *   2. The destination is NOT a choice: it is wherever the cost-unit is — a battlefield OR the base.
 *      An enemy battlefield where you exhausted nothing can never be reached this way.
 *   3. "a different unit": the exhausted cost-unit can't be the one moved, so with a single unit the
 *      ability has no legal play (402.3). The moved unit may itself be exhausted — this is an effect
 *      Move (446), not a Standard Move, so it neither requires nor changes readiness.
 *   4. [Action] on a gear ability (806.1.c.2): usable in showdowns on ANY player's turn — the classic
 *      line is exhausting your defender to pull a helper from base into the fight — but never in the
 *      opponent's open main phase (151.2).
 *   5. It is a real Move: "When I move" triggers (Treasure Hunter → Gold token) fire off it.
 *   6. Cost to play the gear: 2 energy; enters ready (gear default).
 */

import { describe, expect, test } from "bun:test";
import type { Decision } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-045-219";
const TREASURE_HUNTER = "sfd-130-221"; // 1-Might unit: When I move, play a Gold gear token exhausted.

/** Answer a pick with the first of `wants` that is offered (by key, card or bare battlefield id). */
const prefer =
  (...wants: string[]) =>
  (d: Decision) => {
    if (d.kind !== "pick") {
      return undefined;
    }
    for (const w of wants) {
      const o = d.options.find((x) => x.key === w || x.card === w || x.key === `battlefield-${w}`);
      if (o) {
        return [o.key];
      }
    }
    return undefined;
  };

/** P1: Anchor (ready) at bf1, Mover (exhausted) + Spare in base, Signpost in base. P2 holds bf2 with Foe. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor")
    .unit(P1, "base", { might: 3, name: "Mover" }, "mover", { exhausted: true })
    .unit(P1, "base", { might: 1, name: "Spare" }, "spare")
    .unit(P2, "bf2", { might: 3, name: "Foe" }, "foe")
    .unit(P2, "base", { might: 1, name: "Theirs" }, "theirs")
    .gear(P1, CARD, "post");
}

describe("Forgotten Signpost (unl-045-219)", () => {
  test("registry payload: one [Action] activated ability whose cost exhausts this AND a friendly unit, and whose effect moves another friendly unit", async () => {
    await board().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "gear", domain: "calm", energyCost: 2 });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({
      cost: { exhaust: true },
      effect: { target: { controller: "friendly", type: "unit" }, type: "move" },
      timing: "action",
      type: "activated",
    });
  });

  test("playing the gear: 2 energy, lands ready in base; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "post").build();
    await game.p1.play("post");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("post")).toBe("base");
    expect(game.state("post").isReady).toBe(true);
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "post").build();
    expect(poor.p1.can("play", "post")).toBe(false);
  });

  test("[Exhaust] cost: activating puts the ability on the chain and exhausts the Signpost; an exhausted Signpost cannot be activated", async () => {
    const game = await board().build();
    await game.p1.activate("post", 0, { targets: "mover" });
    expect(game.state("post").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "post", controller: P1, triggered: false })]);
    const tapped = await board().gear(P1, CARD, "post2", { exhausted: true }).build();
    expect(tapped.p1.can("activate", "post2")).toBe(false);
    expect(tapped.p1.can("activate", "post")).toBe(true);
  });

  test("only units YOU control are offered to move — never the opponent's", async () => {
    const game = await board().build();
    const offered = game.p1.option("activate", "post")?.fields.find((f) => f.arg === "targets")?.options;
    expect(offered).toEqual(expect.arrayContaining([["anchor"], ["mover"], ["spare"]]));
    expect(offered).toHaveLength(3);
    expect((await game.p1.try((p) => p.activate("post", 0, { targets: "theirs" }))).ok).toBe(false);
  });

  test("effect Move, not a Standard Move: an EXHAUSTED unit in base is carried to the Anchor's battlefield and stays exhausted; the Anchor does not move", async () => {
    const game = await board().script(P1, [prefer("anchor", "bf1"), prefer("anchor", "bf1")]).build();
    await game.p1.activate("post", 0, { targets: "mover" });
    await game.settle();
    expect(game.locationOf("mover")).toBe("bf1");
    expect(game.state("mover").isExhausted).toBe(true);
    expect(game.locationOf("anchor")).toBe("bf1");
    expect(game.locationOf("spare")).toBe("base");
    expect(game.chain()).toEqual([]);
  });

  test("the cost 'Exhaust a unit you control' must actually exhaust the chosen ready unit (Anchor) as the ability is activated (204.1.b)", async () => {
    // Expected: paying the cost exhausts Anchor (and the Signpost); Mover then joins Anchor at bf1.
    // Actual: no unit is asked for or exhausted — only the Signpost taps; Anchor stays ready.
    const game = await board().script(P1, [prefer("anchor", "bf1"), prefer("anchor", "bf1")]).build();
    await game.p1.activate("post", 0, { targets: "mover" });
    await game.settle();
    expect(game.locationOf("mover")).toBe("bf1");
    expect(game.state("post").isExhausted).toBe(true);
    expect(game.state("anchor").isExhausted).toBe(true);
  });

  test("the destination is fixed by the exhausted unit — an enemy battlefield (bf2) where you exhausted nothing must never be offered", async () => {
    // Expected: no free destination choice; at most bf1 (Anchor) / base (Spare) depending on the cost unit.
    // Actual: after resolution P1 is asked to "Choose a destination" among ALL battlefields, bf2 included.
    const game = await board().build();
    await game.p1.activate("post", 0, { targets: "mover" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(keys).not.toContain("battlefield-bf2");
  });

  test("exhausting a unit in BASE pulls a battlefield unit home — Anchor (bf1) moves to base when Spare (base) pays the cost", async () => {
    // Expected: cost = exhaust Spare (in base) → Anchor is moved to base, arriving in whatever state it had (ready).
    // Actual: the effect only ever offers battlefields as destinations; base is unreachable.
    const game = await board().script(P1, [prefer("spare", "base"), prefer("spare", "base")]).build();
    await game.p1.activate("post", 0, { targets: "anchor" });
    await game.settle();
    expect(game.locationOf("anchor")).toBe("base");
    expect(game.state("anchor").isReady).toBe(true);
    expect(game.state("spare").isExhausted).toBe(true);
  });

  test("'a different unit' — with exactly one unit you control there is nothing legal to move, so the ability cannot be activated (402.3)", async () => {
    // Expected: the lone unit would have to be both the exhaust-cost and the moved unit → illegal.
    // Actual: activation is offered with the lone unit as the move target.
    const game = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 2 }, "lonely").gear(P1, CARD, "post").build();
    expect(game.p1.can("activate", "post")).toBe(false);
  });

  test("no units at all → not activatable; nothing is paid", async () => {
    const game = await scenario().battlefield("bf1", { controller: P1 }).gear(P1, CARD, "post").build();
    expect(game.p1.can("activate", "post")).toBe(false);
    expect(game.state("post").isReady).toBe(true);
  });

  test("[Action] timing: NOT in the opponent's open main phase, but YES once you hold Focus in their combat showdown — pull a helper from base into the defence", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P1, "base", { might: 2, name: "Helper" }, "helper")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .gear(P1, CARD, "post")
      .script(P1, [prefer("guard", "bf1"), prefer("guard", "bf1")])
      .build();
    expect(game.p1.can("activate", "post")).toBe(false); // 151.2: their Neutral Open state
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "post")).toBe(true); // 806.1.c.2
    await game.p1.activate("post", 0, { targets: "helper" });
    await game.settle();
    // Guard 3 + Helper 2 = 5 ≥ 4 kills the Raider; Raider's 4 cannot kill both (3 + 2 = 5) → bf1 stays P1's.
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.locationOf("helper")).toBe("bf1");
    expect(game.p2.points()).toBe(0);
  });

  test("control for the showdown test: without the Signpost the lone 3-Might Guard dies to the 4-Might Raider and bf1 is conquered", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P1, "base", { might: 2, name: "Helper" }, "helper")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test("it is a real Move (446.1): Treasure Hunter carried by the Signpost triggers 'When I move' and mints an exhausted Gold token", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor")
      .unit(P1, "base", TREASURE_HUNTER, "th", { exhausted: true })
      .gear(P1, CARD, "post")
      .script(P1, [prefer("anchor", "bf1"), prefer("anchor", "bf1")])
      .build();
    expect(game.p1.gear()).toEqual(["post"]);
    await game.p1.activate("post", 0, { targets: "th" });
    await game.settle();
    expect(game.locationOf("th")).toBe("bf1");
    const gold = game.p1.gear().filter((id) => game.state(id).name === "Gold");
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string)).toMatchObject({ cardType: "gear", isExhausted: true, isToken: true });
  });
});
