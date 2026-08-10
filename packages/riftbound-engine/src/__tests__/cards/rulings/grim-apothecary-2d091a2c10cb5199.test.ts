/**
 * Ruling 2d091a2c10cb5199 — Grim Apothecary (UNL-021 → unl-021-219) · Unit · Fury · 3 · 3 Might
 *   "[Ambush] — When you play me, you may return a friendly unit at a battlefield to its owner's hand."
 *
 * Q: If I play Grim Apothecary to a battlefield, can I return a friendly unit from ANOTHER battlefield to hand?
 * A: Yes. The ability says "a friendly unit at a battlefield" with no "here" restriction, so any friendly unit at any
 *    battlefield may be chosen (units in base may not).
 * Rules: 355.6 / 402.2 (targets as described by the ability), 811.3 contrast (no Hidden restriction — played from hand).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const APOTHECARY = "unl-021-219";

/** P1's turn, 3 energy. bf1 (P1): Scout 2. bf2 (P1): Ranger 1. P1 base: Home 2. bf3 (P2): Foe 1. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
    .unit(P1, "bf2", { might: 1, name: "Ranger" }, "ranger")
    .unit(P1, "base", { might: 2, name: "Home" }, "home")
    .unit(P2, "bf3", { might: 1, name: "Foe" }, "foe")
    .hand(P1, APOTHECARY, "grim");
}

const pickCards = (game: Game) => {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
};

describe("Ruling 2d091a2c10cb5199 — Grim Apothecary played to bf1 may bounce a friendly unit at bf2", () => {
  test("played to bf1: after 'yes' the choice offers every friendly unit at ANY battlefield — Scout (bf1), Ranger (bf2) and herself — but not Home (base) nor the enemy Foe", async () => {
    const game = await board().build();
    await game.p1.play("grim", { to: "bf1" });
    expect(game.locationOf("grim")).toBe("bf1");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(pickCards(game)).toEqual(["grim", "ranger", "scout"]);
    expect(pickCards(game)).not.toContain("home");
    expect(pickCards(game)).not.toContain("foe");
  });

  test("choosing Ranger at the OTHER battlefield is legal: on resolution Ranger returns to P1's hand; Scout, Home and the Apothecary stay put", async () => {
    const game = await board().build();
    await game.p1.play("grim", { to: "bf1" });
    await game.p1.yes();
    await game.p1.pick("ranger");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "grim", targets: ["ranger"], triggered: true })]);
    await game.settle();
    expect(game.zoneOf("ranger")).toBe("hand");
    expect(game.p1.hand()).toEqual(["ranger"]);
    expect(game.locationOf("scout")).toBe("bf1");
    expect(game.locationOf("grim")).toBe("bf1");
    expect(game.locationOf("home")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
