/**
 * Ruling 02cdae90989602e3 — Grandmaster at Arms (SFD-193 → sfd-193-221, Jax legend)
 *     "[1], [Exhaust]: Attach a detached Equipment you control to a unit you control.
 *      [Exhaust]: Attach an attached Equipment you control to a unit you control."
 *   (× Brutalizer sfd-042-221 as the detached Equipment.)
 *
 * Q: Can Jax's legend ability be used during a showdown?
 * A: No. Activated abilities without [Action]/[Reaction] may only be activated on your turn in an Open State (empty chain, no showdown);
 *    the legend's abilities carry no speed keyword, so they are illegal in any showdown — attacking or defending.
 * Rules: 151.2 / 377 (activated-ability timing), 344–346 (showdown states; only legally-timed spells/abilities may be used).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GRANDMASTER_AT_ARMS = "sfd-193-221";
const BRUTALIZER = "sfd-042-221";

/** P1: Jax legend (ready), [1] in pool, a detached Brutalizer in base. P2 holds bf1 with Watcher (2); P1 holds bf2; bf3 is open. */
function board() {
  return scenario()
    .legend(P1, GRANDMASTER_AT_ARMS, "jax")
    .resources(P1, { energy: 1 })
    .gear(P1, BRUTALIZER, "brut")
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: null });
}

describe("Ruling 02cdae90989602e3 — Jax's legend ability has no speed keyword: never usable inside a showdown", () => {
  test("control: in P1's Main Phase Open State (empty chain) the [1],[Exhaust] ability IS offered and activating it exhausts the legend", async () => {
    const game = await board().unit(P1, "base", { might: 3, name: "Ally" }, "ally").unit(P2, "bf1", { might: 2, name: "Watcher" }, "watcher").build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "jax")).toBe(true);
    await game.p1.activate("jax", 0);
    expect(game.state("jax").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
  });

  test("ATTACKING: Ally moves into P2's bf1 → combat showdown with P1 holding Focus — the legend ability is NOT in P1's legal menu (only pass/concede-type options), legend stays ready, [1] unspent", async () => {
    const game = await board().unit(P1, "base", { might: 3, name: "Ally" }, "ally").unit(P2, "bf1", { might: 2, name: "Watcher" }, "watcher").build();
    await game.p1.move("ally", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("ally").combatRole).toBe("attacker");
    expect(game.p1.can("activate", "jax")).toBe(false);
    expect(game.p1.legal().some((o) => o.verb === "activate")).toBe(false);
    const r = await game.p1.try((p) => p.activate("jax", 0));
    expect(r.ok).toBe(false);
    expect(game.state("jax").isReady).toBe(true);
    expect(game.p1.energy()).toBe(1);
  });

  test("DEFENDING: on P2's turn its Raider attacks P1's bf2; P2 passes Focus to P1 — still no legend activation for P1", async () => {
    const game = await board().active(P2).unit(P1, "bf2", { might: 3, name: "Ally" }, "ally").unit(P2, "base", { might: 2, name: "Raider" }, "raider").build();
    await game.p2.move("raider", "bf2");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("ally").combatRole).toBe("defender");
    expect(game.p1.can("activate", "jax")).toBe(false);
    expect((await game.p1.try((p) => p.activate("jax", 0))).ok).toBe(false);
    expect(game.state("jax").isReady).toBe(true);
  });

  test("a NON-combat showdown (Ally moves to the open bf3) is a showdown too: not usable there either; once it closes and the state is Open again, it is", async () => {
    const game = await board().unit(P1, "base", { might: 3, name: "Ally" }, "ally").build();
    await game.p1.move("ally", "bf3");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "jax")).toBe(false);
    await game.settle(); // both pass Focus → showdown closes, P1 conquers bf3
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "jax")).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
