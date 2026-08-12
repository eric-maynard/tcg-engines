/**
 * Ruling 83b4c221d895404d — Rockfall Path (SFD-216 → sfd-216-221) · Battlefield
 *     "Units can't be played here."
 *   × Inferna (UNL-002 → unl-002-219) · Unit · [2] · 1 Might ·
 *     "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)"
 *
 * Q: Can an [Ambush] unit enter at Rockfall Path?
 * A: No. [Ambush] only ADDS a legal location; it does not lift a restriction. Rockfall Path's "can't" beats the
 *    permission, so the play is simply not available there. Moving units there, or targeting them there, is fine.
 * Rules: 822.1.b ([Ambush] adds "a battlefield where you have units" as a play destination),
 *        054.1/822.1 ("can't" overrides "can"), 355.16 (an illegal play is not offered).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ROCKFALL_PATH = "sfd-216-221";
const INFERNA = "unl-002-219";

describe("Ruling 83b4c221d895404d — [Ambush] cannot beat Rockfall Path's 'Units can't be played here'", () => {
  test("ruling: on P1's own turn the play destinations offered for Inferna are base and bf2 — Rockfall Path is absent even though P1 controls it and has a unit there", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("rock", { controller: P1, def: ROCKFALL_PATH, inert: false })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "rock", { might: 2, name: "Holder" }, "holder")
      .unit(P1, "bf2", { might: 2, name: "Other" }, "other")
      .hand(P1, INFERNA, "inferna")
      .build();
    const destinations = game.p1
      .legal()
      .filter((o) => o.card === "inferna")
      .flatMap((o) => o.variants.map((v) => String((v.params as Record<string, unknown>).location)));
    expect(destinations).toContain("base");
    expect(destinations).toContain("battlefield-bf2");
    expect(destinations).not.toContain("battlefield-rock");
    expect((await game.p1.try((p) => p.play("inferna", { to: "rock" }))).ok).toBe(false);
    expect(game.zoneOf("inferna")).toBe("hand");
  });

  test("ruling: the same holds for the [Ambush] play itself — inside the opponent's showdown Inferna may ambush into bf2 (where P1 has units) but never into Rockfall Path (where P1 also has units)", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P1, { energy: 4 })
      .battlefield("rock", { controller: P1, def: ROCKFALL_PATH, inert: false })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "rock", { might: 2, name: "Holder" }, "holder")
      .unit(P1, "bf2", { might: 2, name: "Other" }, "other")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .hand(P1, INFERNA, "inferna")
      .build();
    await game.p2.move("raider", "bf2");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    const destinations = game.p1
      .legal()
      .filter((o) => o.card === "inferna")
      .flatMap((o) => o.variants.map((v) => String((v.params as Record<string, unknown>).location)));
    expect(destinations).toEqual(["battlefield-bf2"]); // the [Ambush] window offers only the legal battlefield
    expect((await game.p1.try((p) => p.play("inferna", { to: "rock" }))).ok).toBe(false);
    await game.p1.play("inferna", { to: "bf2" });
    expect(game.locationOf("inferna")).toBe("bf2");
  });

  test("the restriction is about PLAYING only — a unit may still be moved onto Rockfall Path", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("rock", { controller: P1, def: ROCKFALL_PATH, inert: false })
      .unit(P1, "rock", { might: 2, name: "Holder" }, "holder")
      .unit(P1, "base", { might: 2, name: "Walker" }, "walker")
      .hand(P1, INFERNA, "inferna")
      .build();
    await game.p1.move("walker", "rock");
    expect(game.locationOf("walker")).toBe("rock");
    expect(game.p1.units("rock").sort()).toEqual(["holder", "walker"]);
    expect(game.violations()).toEqual([]);
  });
});
