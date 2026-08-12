/**
 * Ruling f8e1d1dc1d8c9cd6 — Showstopper (OGN-270 → ogn-270-298) · 1 + [rainbow]
 *   "Buff a friendly unit in your base, then move it to a battlefield."
 *   × Vi, Peacekeeper (unl-176-219) "[Ambush] (You may play me as a [Reaction] to a battlefield where
 *     you have units.)"
 *
 * Q: After Showstopper sends one unit to attack, may I move more units to that battlefield before the
 *    showdown resolves?
 * A: No. The showdown has to be resolved first — a move is a discretionary action and those need a
 *    Neutral Open State. What you CAN still do is bring units in with a card or ability during the
 *    showdown itself (e.g. an [Ambush] Reaction unit).
 * Rules: 307 (discretionary actions require a Neutral Open State), 410.1.a (a move is discretionary),
 *        806/[Ambush] (Reaction permissions still work inside a showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHOWSTOPPER = "ogn-270-298";
const VI_PEACEKEEPER = "unl-176-219";

/** P1: Hero + Second in base, Showstopper and an Ambush Vi in hand. P2 holds bf1 with a small Guard. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { order: 1, rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 5, name: "Hero" }, "hero")
    .unit(P1, "base", { might: 3, name: "Second" }, "second")
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .hand(P1, SHOWSTOPPER, "show")
    .hand(P1, VI_PEACEKEEPER, "vi");
}

/** Cast Showstopper on the Hero, send it to bf1, and stop with the showdown open. */
async function sendHero(game: Game): Promise<void> {
  await game.p1.cast("show", { targets: "hero" });
  await game.p1.pick("battlefield-bf1"); // destination is named at finalization
  for (let i = 0; i < 6 && game.chain().length > 0 && game.decision()?.kind === "action"; i++) {
    await game.acting().passPriority();
  }
}

describe("Ruling f8e1d1dc1d8c9cd6 — after Showstopper opens a showdown, no further units may be moved in until it resolves", () => {
  test("Showstopper buffs the Hero and moves it to bf1, opening a showdown", async () => {
    const game = await board().build();
    await sendHero(game);
    expect(game.locationOf("hero")).toBe("bf1");
    expect(game.state("hero").isBuffed).toBe(true);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true });
  });

  test("moving the second unit to that battlefield is now illegal — the whole move menu is gone", async () => {
    const game = await board().build();
    await sendHero(game);
    expect(game.p1.legal().map((o) => o.verb)).not.toContain("move");
    const join = await game.p1.try((p) => p.move("second", "bf1"));
    expect(join.ok).toBe(false);
    expect(game.locationOf("second")).toBe("base");
  });

  test("once the showdown is resolved, moving units there is legal again", async () => {
    const game = await board().build();
    await sendHero(game);
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    await game.p1.move("second", "bf1"); // no longer refused
    expect(game.locationOf("second")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });

  test("nuance: a card WITH a showdown permission can still join — [Ambush] Vi is playable to bf1 mid-showdown", async () => {
    const game = await board().build();
    await sendHero(game);
    expect(game.p1.can("play", "vi")).toBe(true);
    await game.p1.play("vi", { to: "bf1" });
    expect(game.locationOf("vi")).toBe("bf1");
    // ...while the plain move for the very same battlefield is still refused.
    const join = await game.p1.try((p) => p.move("second", "bf1"));
    expect(join.ok).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
