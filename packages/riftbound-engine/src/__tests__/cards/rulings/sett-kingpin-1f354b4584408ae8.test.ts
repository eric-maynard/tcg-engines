/**
 * Ruling 1f354b4584408ae8 — Sett, Kingpin (OGN-240 → ogn-240-298) · Champion · Order · [4][order] · 5 Might
 *     "[Tank] I get +1 [Might] for each buffed friendly unit at my battlefield."
 *
 * Q: Does "at my battlefield" mean the battlefield Sett is at, or every battlefield its controller holds?
 * A: The one Sett is at — "my battlefield" is "here". A first-person reference on a unit means that card,
 *    not its controller, so buffed friends elsewhere (or in base) never count, and Sett gets nothing at all
 *    while he himself is in base.
 * Rules: 174.4 ("I/my" on a card refers to that object), 105.2 / 740.1.a (location clauses: "at my
 *        battlefield" = here), 365 (statics re-evaluate continuously).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const SETT = "ogn-240-298";

describe("Ruling 1f354b4584408ae8 — Sett's 'at my battlefield' is 'here', and gives nothing while he is in base", () => {
  test("Sett at bf1 with a buffed friend AT bf1: +1 (5 → 6)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SETT, "sett")
      .unit(P1, "bf1", { might: 2, name: "Bruiser" }, "bruiser", { buffed: true })
      .build();
    expect(game.state("sett")).toMatchObject({ baseMight: 5, isBuffed: false, might: 6 });
  });

  test("the SAME buffed friend at another battlefield P1 controls gives Sett nothing: 5", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", SETT, "sett")
      .unit(P1, "bf2", { might: 2, name: "Bruiser" }, "bruiser", { buffed: true })
      .build();
    expect(game.state("bruiser").isBuffed).toBe(true);
    expect(game.state("sett").might).toBe(5);
  });

  test("Sett IN BASE gets no bonus even with buffed friends beside him in base: 5", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", SETT, "sett")
      .unit(P1, "base", { might: 2, name: "Bruiser" }, "bruiser", { buffed: true })
      .unit(P1, "base", { might: 2, name: "Enforcer" }, "enforcer", { buffed: true })
      .build();
    expect(game.locationOf("sett")).toBe("base");
    expect(game.state("sett").might).toBe(5);
  });

  test("a buffed Sett in base counts only himself once he is AT a battlefield: 5 in base, 7 after moving to bf1 with a buffed friend there", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", SETT, "sett", { buffed: true })
      .unit(P1, "bf1", { might: 2, name: "Bruiser" }, "bruiser", { buffed: true })
      .build();
    // In base: only the buff itself, no passive bonus (neither he nor the Bruiser is "at my battlefield").
    expect(game.state("sett").might).toBe(6);
    await game.p1.move("sett", "bf1");
    await game.settle();
    expect(game.locationOf("sett")).toBe("bf1");
    // Now two buffed friendly units are at his battlefield: himself and the Bruiser.
    expect(game.state("sett").might).toBe(8); // 5 + 1 buff + 2
    expect(game.violations()).toEqual([]);
  });
});
