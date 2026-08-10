/**
 * Ruling e33268bc830887e8 — Sett, Kingpin (OGN-240 → ogn-240-298) · [4]+[order] · 5 Might · [Tank]
 *     "I get +1 [Might] for each buffed friendly unit at my battlefield."
 *   × Lee Sin, Centered (OGN-151 → ogn-151-298) · 6 Might · "Other buffed friendly units at my battlefield have +2 [Might]."
 *
 * Q: Does Sett count himself when calculating his +1 per buffed friendly unit?
 * A: Yes. A buffed Sett alone at a battlefield is 5 + 1 (buff) + 1 (his passive counting himself) = 7. Contrast Lee Sin,
 *    whose text says OTHER buffed friendly units and therefore never counts himself.
 * Rules: 106.3 (a unit is friendly to itself / "friendly" includes self unless "other"), 702 (buff = +1 Might), 363 (statics).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SETT = "ogn-240-298";
const LEE_SIN = "ogn-151-298";

describe("Ruling e33268bc830887e8 — Sett, Kingpin counts himself among 'buffed friendly units at my battlefield'", () => {
  test("buffed Sett ALONE at a battlefield: 5 base + 1 buff + 1 passive (himself) = 7", async () => {
    const game = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", SETT, "sett", { buffed: true }).build();
    expect(game.state("sett")).toMatchObject({ baseMight: 5, isBuffed: true, might: 7 });
  });

  test("unbuffed Sett alone is just 5 — the passive counts BUFFED units only", async () => {
    const game = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", SETT, "sett").build();
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 5 });
  });

  test("each additional buffed friendly unit at his battlefield adds one more: buffed Sett + buffed Ally there = 8; a buffed friendly unit ELSEWHERE or a buffed ENEMY unit here does not count", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", SETT, "sett", { buffed: true })
      .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally", { buffed: true })
      .unit(P1, "bf2", { might: 2, name: "Far Ally" }, "far", { buffed: true })
      .unit(P1, "base", { might: 2, name: "Home Ally" }, "home", { buffed: true })
      .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe", { buffed: true })
      .build();
    expect(game.state("sett").might).toBe(5 + 1 + 2); // buff + (sett, ally)
    expect(game.state("ally").might).toBe(3); // Sett grants nothing to others
  });

  test("contrast — Lee Sin, Centered says OTHER: buffed Lee Sin alone is 6 + 1 buff = 7 (no self-bonus), while a buffed ally beside him gets +2", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", LEE_SIN, "lee", { buffed: true })
      .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally", { buffed: true })
      .build();
    expect(game.state("lee")).toMatchObject({ baseMight: 6, isBuffed: true, might: 7 });
    expect(game.state("ally").might).toBe(2 + 1 + 2);
    expect(game.violations()).toEqual([]);
  });
});
