/**
 * Ruling 38af67596ef52d68 — Unforgiven (OGN-259 → ogn-259-298) · Legend · Yasuo
 *   "[2], [Exhaust]: Move a friendly unit to or from its base."
 *
 * Q: Can the Yasuo legend's ability be used during the opponent's turn, and if so when?
 * A: No, never. Everything in the game happens at base speed — on your own turn, in an
 *    Open State — unless the card itself says [Action] or [Reaction]. Unforgiven's
 *    activated ability says neither, so it is unusable on the opponent's turn: not in
 *    their open main phase, not on a chain, not in a showdown.
 * Rules: 150.2 / 420.1 (base speed = your turn, Open State), 421 (Action / Reaction speed),
 *        401 (activating an ability needs the right timing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNFORGIVEN = "ogn-259-298";
const DREDGE_UP = "ven-049-166"; // P2's cheap spell, purely to close the state on their turn

/** P2's turn. P1 has the Yasuo legend (ready), [2] banked, a Runner in base and a battlefield to move to. */
function opponentsTurn() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 2 })
    .legend(P1, UNFORGIVEN, "yasuo")
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf2", { might: 3, name: "Runner" }, "runner")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P2, DREDGE_UP, "dredge");
}

const canActivate = (game: Game) => game.p1.can("activate", "yasuo");

describe("Ruling 38af67596ef52d68 — Unforgiven's ability is base speed: never usable on the opponent's turn", () => {
  test("premise: the legend is ready, P1 has the [2], and the ability prints no Action/Reaction timing", async () => {
    const game = await opponentsTurn().build();
    expect(game.state("yasuo").isReady).toBe(true);
    expect(game.p1.energy()).toBe(2);
    expect(game.state("yasuo").rulesText).not.toMatch(/\[(Action|Reaction)\]/);
  });

  test("P2's OPEN main phase: P1 cannot activate it (P1 has no window at all)", async () => {
    const game = await opponentsTurn().build();
    expect(game.turnPlayer()).toBe(P2);
    expect(canActivate(game)).toBe(false);
    const r = await game.p1.try((p) => p.activate("yasuo"));
    expect(r.ok).toBe(false);
    expect(game.state("yasuo").isReady).toBe(true);
    expect(game.p1.energy()).toBe(2);
  });

  test("on a CHAIN during P2's turn (P2 casts a spell and passes): P1 holds priority but Unforgiven is still not activatable", async () => {
    const game = await opponentsTurn().build();
    await game.p2.cast("dredge");
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(canActivate(game)).toBe(false);
    expect(game.p1.legal().some((o) => o.moveId === "activateAbility" && o.card === "yasuo")).toBe(false);
    expect((await game.p1.try((p) => p.activate("yasuo"))).ok).toBe(false);
  });

  test("in a SHOWDOWN during P2's turn (P2 attacks P1's battlefield and passes focus): still not activatable", async () => {
    const game = await opponentsTurn().build();
    await game.p2.move("raider", "bf2");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(canActivate(game)).toBe(false);
    expect((await game.p1.try((p) => p.activate("yasuo"))).ok).toBe(false);
    expect(game.state("yasuo").isReady).toBe(true);
  });

  test("contrast — on P1's OWN turn in an open main phase it works: [2] and the exhaust are paid and the Runner moves", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .legend(P1, UNFORGIVEN, "yasuo")
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
      .build();
    expect(canActivate(game)).toBe(true);
    await game.p1.activate("yasuo");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("runner");
      await game.settle();
    }
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("bf1");
      await game.settle();
    }
    expect(game.state("yasuo").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.locationOf("runner")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });

  test("and once it is exhausted it is unusable even on P1's own turn — one use per readying", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .card("yasuo", { def: UNFORGIVEN, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
      .build();
    expect(canActivate(game)).toBe(false);
    expect((await game.p1.try((p) => p.activate("yasuo"))).ok).toBe(false);
  });
});
