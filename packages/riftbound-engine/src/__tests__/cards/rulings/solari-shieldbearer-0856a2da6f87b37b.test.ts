/**
 * Ruling 0856a2da6f87b37b — Solari Shieldbearer (OGN-051 → ogn-051-298) · Unit · Calm · 3 · 2 Might
 *   "When you play me, stun a unit."
 *
 * Q: Can you play Solari Shieldbearer with no other units in play?
 * A: Yes. "Stun a unit" is an instruction of the play trigger, not a requirement to play the unit; you do as much as
 *    you can. Note (FAQ #7116): Solari is itself a legal choice for its own "a unit" — with no other unit around it is
 *    the only candidate.
 * Rules: 055 / 359.3.e.6 (do as much as you can; impossible instructions are skipped), 355.9 (no "another" ⇒ self is legal).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SOLARI = "ogn-051-298";

describe("Ruling 0856a2da6f87b37b — Solari Shieldbearer is playable onto an empty board", () => {
  test("empty board: the play is legal, Solari lands in base and 3 energy is spent", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, SOLARI, "solari").build();
    expect(game.p1.units()).toEqual([]);
    expect(game.p2.units()).toEqual([]);
    expect(game.p1.can("play", "solari")).toBe(true);
    await game.p1.play("solari");
    expect(game.zoneOf("solari")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("solari")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("with no OTHER unit anywhere, Solari itself is the only legal 'a unit' (FAQ #7116) — the trigger binds to it and it ends up stunned", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, SOLARI, "solari").build();
    await game.p1.play("solari");
    // A single legal candidate is auto-bound at finalization; if the engine still asks, answer it.
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["solari"]);
      await game.p1.pick("solari");
    }
    await game.settle();
    expect(game.state("solari").isStunned).toBe(true);
  });

  test("contrast — with another unit on the board P1 CHOOSES which unit to stun (Solari still among the options) and may stun the enemy", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
      .hand(P1, SOLARI, "solari")
      .build();
    await game.p1.play("solari");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toContain("foe");
    expect(offered).toContain("solari");
    await game.p1.pick("foe");
    await game.settle();
    expect(game.state("foe").isStunned).toBe(true);
    expect(game.state("solari").isStunned).toBe(false);
  });
});
