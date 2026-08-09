/**
 * Charm — ogn-043-298 · Spell · Calm · 1 energy + [calm]
 *
 *   Move an enemy unit.
 *
 * The caster chooses the enemy unit (target) and where it moves to (another
 * location on the board: its base or a different battlefield).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-043-298";

function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
    .unit(P2, "base", { might: 2, name: "Homebody" }, "home")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, CARD, "charm");
}

describe("Charm (ogn-043-298)", () => {
  test("costs 1 energy + 1 calm; moves an enemy unit from a battlefield back to its base", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "foe" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { pendingChoiceType: "choose-destination" } });
    await game.p1.pick("base");
    await game.settle();
    expect(game.locationOf("foe")).toBe("base");
    expect(game.state("foe").owner).toBe(P2);
    expect(game.zoneOf("charm")).toBe("trash");
  });

  test("the caster picks the destination: an enemy unit can be pulled from bf1 to another battlefield", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "foe" });
    await game.settle();
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    expect(game.locationOf("foe")).toBe("bf2");
    expect(game.p2.units("bf1")).toEqual([]);
  });

  test("an enemy unit in its base can be moved out to a battlefield", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "home" });
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(keys).not.toContain("base"); // must actually move somewhere else
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    expect(game.locationOf("home")).toBe("bf2");
  });

  // rule 450: Contested is attributed to the controller of the unit that moved,
  // not to the caster who chose the destination.
  test("moving an enemy unit onto an uncontrolled battlefield contests it for THAT unit's controller", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "home" });
    await game.settle();
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    // rule 344.2 — settle() hands the Cleanup-begun showdown back once before passing Focus.
    await game.settle();
    // The caster (P1) has no unit there, so Contested must never be credited
    // to P1 — the showdown belongs to P2, the moved unit's controller.
    expect(game.gameState.battlefields.bf2?.contestedBy).not.toBe(P1);
    // The uncontested showdown closes to the moved unit's controller.
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
  });

  test("targets only ENEMY units — friendly units are not offered", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "charm")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(expect.arrayContaining([["foe"], ["home"]]));
    const t = await game.p1.try((p) => p.cast("charm", { targets: "ally" }));
    expect(!t.ok && t.error.code).toBe("ILLEGAL_ARGS");
  });

  test("not playable without the calm power, without 1 energy, or with no enemy unit", async () => {
    const noPower = await scenario().resources(P1, { energy: 3 }).unit(P2, "base", { might: 1 }, "u").hand(P1, CARD, "c").build();
    expect(noPower.p1.can("cast", "c")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 0, power: { calm: 1 } }).unit(P2, "base", { might: 1 }, "u").hand(P1, CARD, "c").build();
    expect(noEnergy.p1.can("cast", "c")).toBe(false);
    const noEnemy = await scenario().resources(P1, { energy: 1, power: { calm: 1 } }).unit(P1, "base", { might: 1 }, "u").hand(P1, CARD, "c").build();
    expect(noEnemy.p1.can("cast", "c")).toBe(false);
  });

  // rule 323.6 / 319.5 — a battlefield whose controller has no unit there loses control
  // in the very next Cleanup. Charming the last enemy unit off a LIVE battlefield (whose
  // own play-a-spell trigger queues a chain item that is then discarded as unperformable)
  // must still run that Cleanup once the chain empties.
  test("control of a live battlefield drops as soon as Charm moves its last unit away, even when the battlefield's own trigger left the chain unfinalized (rules 323.6, 319.5)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .battlefield("hall", { controller: P2, def: "unl-205-219", inert: false })
      .unit(P2, "hall", { might: 2, name: "Foe" }, "foe")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, CARD, "charm")
      .build();
    await game.p1.cast("charm", { targets: "foe" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("base");
      await game.settle();
    }
    expect(game.locationOf("foe")).toBe("base");
    expect(game.gameState.interaction?.chain ?? null).toBeNull();
    expect(game.gameState.battlefields.hall?.controller).toBeNull();
  });
});
