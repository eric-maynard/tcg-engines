/**
 * Ruling e1bfe131746a0b97 — The Ruination (UNL-180 → unl-180-219) · Spell · Order · 9+[order]x3 · "Kill all units."
 *   × Karthus, Eternal (OGN-236 → ogn-236-298) · 3 Might · "Your [Deathknell] effects trigger an additional time." (PASSIVE)
 *   Deathknell witnesses: Watchful Sentry (OGN-096 → ogn-096-298) · 1 Might · "[Deathknell] — Draw 1." (two copies)
 *
 * Q: I cast The Ruination while my opponent has Karthus — are all their Deathknells still doubled?
 * A: Yes. Karthus's ability is passive, so it still applies at the exact moment every unit (Karthus included) dies
 *    simultaneously; each Deathknell triggers once for the death plus one additional time.
 * Rules: 808.1.d.2 (Deathknell), 365 / 370.1.a.2 (passives apply while on the board incl. the moment of a simultaneous
 *        wipe), 359 (one spell = one simultaneous kill event).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const THE_RUINATION = "unl-180-219";
const KARTHUS = "ogn-236-298";
const WATCHFUL_SENTRY = "ogn-096-298";

/** P1's turn with exactly 9+[order]x3. P2: Karthus + two Watchful Sentries (base and bf1). P1: a vanilla Grunt so "all units" spans both sides. */
function board(withKarthus: boolean) {
  const s = scenario()
    .resources(P1, { energy: 9, power: { order: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", WATCHFUL_SENTRY, "sentryA")
    .unit(P2, "base", WATCHFUL_SENTRY, "sentryB")
    .unit(P1, "base", { might: 2, name: "Grunt" }, "grunt")
    .hand(P1, THE_RUINATION, "ruin");
  return withKarthus ? s.unit(P2, "base", KARTHUS, "karthus") : s;
}

describe("Ruling e1bfe131746a0b97 — The Ruination kills Karthus with everything else, yet every enemy Deathknell is still doubled", () => {
  test("The Ruination kills ALL units at once — Karthus, both Sentries and P1's own Grunt are in the trash", async () => {
    const game = await board(true).build();
    await game.p1.cast("ruin");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ruin")).toBe("trash");
    for (const id of ["karthus", "sentryA", "sentryB", "grunt"]) {
      expect(game.zoneOf(id)).toBe("trash");
    }
    expect(game.p1.units()).toEqual([]);
    expect(game.p2.units()).toEqual([]);
  });

  test("each Sentry's '[Deathknell] — Draw 1' triggers TWICE (base + Karthus's additional time) although Karthus died in the same event: P2 draws 4", async () => {
    const game = await board(true).build();
    const hand = game.p2.hand().length;
    const deck = game.p2.deck().length;
    await game.p1.cast("ruin");
    await game.settle();
    expect(game.p2.hand()).toHaveLength(hand + 4);
    expect(game.p2.deck()).toHaveLength(deck - 4);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("reference — without Karthus the same wipe gives each Sentry ONE Deathknell: P2 draws 2", async () => {
    const game = await board(false).build();
    const hand = game.p2.hand().length;
    await game.p1.cast("ruin");
    await game.settle();
    expect(game.zoneOf("sentryA")).toBe("trash");
    expect(game.zoneOf("sentryB")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(hand + 2);
  });
});
