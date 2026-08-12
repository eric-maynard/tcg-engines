/**
 * Ruling 23902438d19a5e28 — Riposte (SFD-206 → sfd-206-221) · Reaction · [2] + 2 power
 *     "Choose a friendly unit and a spell. Counter that spell and give that unit +[Might] equal to that
 *      spell's Energy cost this turn."
 *   × Singularity (ogn-105-298) · [6][mind][mind] · "Deal 6 to each of up to two units." — P1's own big spell.
 *
 * Q: Can Riposte counter your OWN spell?
 * A: Yes. It says "a spell", not "an enemy spell", so any spell on the chain is a legal choice, your own
 *    included; the countered spell does nothing and the chosen friendly unit still gets +Might equal to
 *    its Energy cost.
 * Rules: 355.9 (choosing: any legal object of the named kind), 425.1 / 425.1.a (a countered card does
 *        nothing and is trashed), 174.2 ("enemy"/"friendly" qualifiers are printed when they are meant).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RIPOSTE = "sfd-206-221";
const SINGULARITY = "ogn-105-298";

/** P1's turn: P1 can afford Singularity ([6][mind][mind]) and Riposte ([2] + 2 power); P2 holds bf1 with a Wall. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { body: 1, mind: 2, order: 1, rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
    .hand(P1, SINGULARITY, "singularity")
    .hand(P1, RIPOSTE, "riposte");
}

describe("Ruling 23902438d19a5e28 — Riposte says 'a spell', so it may counter its own controller's spell", () => {
  test("P1's own Singularity on the chain makes Riposte legal for P1 — the only spell to choose is P1's own", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "riposte")).toBe(false); // nothing on the chain yet (355.8)
    await game.p1.cast("singularity", { targets: ["wall"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["singularity"]);
    expect(game.p1.can("cast", "riposte")).toBe(true);
    // Only the friendly-unit role is enumerated; the spell role is forced onto P1's own Singularity.
    const targets = game.p1.option("cast", "riposte")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(targets.map((t) => (Array.isArray(t) ? t[0] : t))).toEqual(["ally"]);
  });

  test("countering it: the 6 damage is never dealt and the Ally still gets +6 (Singularity's Energy cost)", async () => {
    const game = await board().build();
    await game.p1.cast("singularity", { targets: ["wall"] });
    await game.p1.cast("riposte", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["singularity", "riposte"]);
    await game.settle();
    expect(game.zoneOf("riposte")).toBe("trash");
    expect(game.zoneOf("singularity")).toBe("trash"); // countered → cleared from the chain to the trash
    expect(game.state("wall")).toMatchObject({ damage: 0, might: 9 });
    expect(game.state("ally").might).toBe(9); // 3 + 6
    expect(game.violations()).toEqual([]);
  });

  test("that buff is 'this turn' only: next turn the Ally is back to 3", async () => {
    const game = await board().build();
    await game.p1.cast("singularity", { targets: ["wall"] });
    await game.p1.cast("riposte", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(9);
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(3);
  });

  test("countering an ENEMY spell works the same way — the printed text simply does not restrict which side's spell it is", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { body: 1, order: 1, rainbow: 2 } })
      .resources(P2, { energy: 6, power: { mind: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Ally" }, "ally")
      .hand(P2, SINGULARITY, "singularity")
      .hand(P1, RIPOSTE, "riposte")
      .build();
    await game.p2.cast("singularity", { targets: ["ally"] });
    await game.p2.passPriority();
    await game.p1.cast("riposte", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("singularity")).toBe("trash");
    expect(game.state("ally")).toMatchObject({ damage: 0, might: 9 });
  });
});
