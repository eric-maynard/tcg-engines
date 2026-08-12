/**
 * Ruling 29eb4e9711e575d4 — Grandmaster at Arms (SFD-193 → sfd-193-221, Jax's legend)
 *     "[1], [Exhaust]: Attach a detached Equipment you control to a unit you control.
 *      [Exhaust]: Attach an attached Equipment you control to a unit you control."
 *   × Brutalizer (sfd-042-221) as the Equipment.
 *
 * Q: Can Jax's legend ability be used while defending a battlefield once a showdown has started?
 * A: No. An activated ability with no [Action]/[Reaction] speed keyword may only be activated on your own
 *    turn in an Open State. Inside a showdown — attacking or defending, on either player's turn — it is not
 *    legally timed, so it is simply not among your options.
 * Rules: 377 / 151.2 (activated-ability timing: Open State, your turn, unless the ability carries a speed
 *        keyword), 344–347 (in a showdown only legally-timed spells and abilities may be used).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GRANDMASTER_AT_ARMS = "sfd-193-221";
const BRUTALIZER = "sfd-042-221";

/** P1 owns the Jax legend (ready), [1] in pool and a detached Brutalizer in base. */
function base() {
  return scenario().legend(P1, GRANDMASTER_AT_ARMS, "jax").resources(P1, { energy: 1 }).gear(P1, BRUTALIZER, "brut");
}

describe("Ruling 29eb4e9711e575d4 — no speed keyword ⇒ Jax's legend ability is unusable in any showdown", () => {
  test("DEFENDING on the opponent's turn: P2's Raider attacks P1's bf1 and passes Focus — Jax is not activatable, and trying throws", async () => {
    const game = await base()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Ally" }, "ally")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("ally").combatRole).toBe("defender");
    expect(game.p1.can("activate", "jax")).toBe(false);
    expect(game.p1.legal().some((o) => o.verb === "activate")).toBe(false);
    expect((await game.p1.try((p) => p.activate("jax", 0))).ok).toBe(false);
    expect(game.state("jax").isReady).toBe(true);
    expect(game.p1.energy()).toBe(1);
  });

  test("ATTACKING on your own turn is no different — the showdown is still a showdown", async () => {
    const game = await base()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 4, name: "Ally" }, "ally")
      .unit(P2, "bf1", { might: 2, name: "Watcher" }, "watcher")
      .build();
    await game.p1.move("ally", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "jax")).toBe(false);
  });

  test("control: in P1's own Open main phase the ability IS offered — it costs [1] and exhausts the legend", async () => {
    const game = await base()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Ally" }, "ally")
      .build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "jax")).toBe(true);
    await game.p1.activate("jax", 0);
    await game.settle();
    expect(game.state("jax").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("…and it comes back the moment the showdown closes: the same ability is legal again in the Open State that follows", async () => {
    const game = await base()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 4, name: "Ally" }, "ally")
      .build();
    await game.p1.move("ally", "bf1"); // non-combat showdown at an open battlefield
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "jax")).toBe(false);
    await game.settle(); // showdown closes, P1 conquers bf1
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "jax")).toBe(true);
  });
});
