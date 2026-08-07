/**
 * Tideturner — ogn-199-298 · Unit · Chaos · 2 energy · 2 Might
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   When you play me, you may choose a unit you control at another location. Move me to its
 *   location and it to my original location.
 *
 * Rules: 811 Hidden (hide for [rainbow] at a battlefield you control; later play from facedown
 * for 0, the permanent enters at THAT battlefield — 811.1.d.1; 811.1.d.2 names Tideturner
 * explicitly: its "another location" restriction can never be met at its own battlefield, so
 * the swap partner may be chosen freely); 383.3.a (leading "you may" → optional trigger).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-199-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Far" }, "far")
    .unit(P1, "base", { might: 2, name: "Near" }, "near")
    .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe")
    .hand(P1, CARD, "tt");
}

describe("Tideturner (ogn-199-298)", () => {
  test("costs 2 energy; a 2-Might unit with Hidden; the optional play trigger goes on the chain; unaffordable at 1", async () => {
    const game = await board().build();
    await game.p1.play("tt", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.zoneOf("tt")).toBe("base");
    expect(game.state("tt").might).toBe(2);
    expect(game.state("tt").keywords).toContain("Hidden");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tt", controller: P1, triggered: true })]);
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "tt").build();
    expect(poor.p1.can("play", "tt")).toBe(false);
  });

  test("'you may': declining the trigger leaves every unit where it is", async () => {
    const game = await board().build();
    await game.p1.play("tt", { to: "base" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.locationOf("tt")).toBe("base");
    expect(game.locationOf("far")).toBe("bf1");
    expect(game.locationOf("near")).toBe("base");
  });

  test("accepting → choose a unit YOU control at ANOTHER location (only 'far'), then swap: Tideturner → bf1, Far → base", async () => {
    // After "yes" (asked while the trigger is finalized, rule 402.1) and both passes, P1 picks among
    // own units not at Tideturner's location (far; not near, not the enemy foe); Tideturner moves to
    // bf1 and Far moves to base.
    const game = await board().build();
    await game.p1.play("tt", { to: "base" });
    await game.settle();
    await game.p1.yes();
    // rule 402: the item resolves after both pass; the swap partner is picked as it resolves.
    await game.acting().passPriority();
    await game.acting().passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" && d.options.map((o) => o.card).sort()).toEqual(["far"]);
    await game.p1.pick("far");
    await game.settle();
    expect(game.locationOf("tt")).toBe("bf1");
    expect(game.locationOf("far")).toBe("base");
    expect(game.locationOf("near")).toBe("base");
    expect(game.locationOf("foe")).toBe("bf2");
  });

  test("Hidden: hide at bf1 for [rainbow]; on a later turn play it from facedown for 0 — it enters at bf1 (811.1.d.1)", async () => {
    const game = await board().build();
    await game.p1.hide("tt", "bf1");
    expect(game.zoneOf("tt")).toBe("facedown-bf1");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([]);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    const energy = game.p1.energy();
    await game.p1.reveal("tt");
    expect(game.p1.energy()).toBe(energy);
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
      await game.settle();
    }
    expect(game.zoneOf("tt")).toBe("battlefield-bf1");
  });

  test("played from facedown at bf1, the swap partner may be a unit in base (811.1.d.2 example): Tideturner → base, Near → bf1", async () => {
    // Expected: the Hidden targeting restriction does not apply (impossible at own battlefield), so
    // 'near' (in base) is offered; after the swap Tideturner is in base and Near is at bf1.
    // Actual: the swap never prompts / moves anything (see above).
    const game = await board().build();
    await game.p1.hide("tt", "bf1");
    await game.advanceTurn();
    await game.advanceTurn();
    await game.p1.reveal("tt");
    await game.settle();
    await game.p1.yes();
    // rule 402: opt-in at finalization; the swap partner is picked as the item resolves.
    await game.acting().passPriority();
    await game.acting().passPriority();
    const d = game.decision();
    expect(d?.kind === "pick" && d.options.map((o) => o.card).sort()).toEqual(["near"]);
    await game.p1.pick("near");
    await game.settle();
    expect(game.locationOf("tt")).toBe("base");
    expect(game.locationOf("near")).toBe("bf1");
    expect(game.locationOf("far")).toBe("bf1");
  });
});
