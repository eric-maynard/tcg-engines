/**
 * Ruling 818a8b0b3f591167 — (no specific card) where the rules say you may play units.
 *   Exercised with Miss Fortune, Buccaneer (OGN-193 → ogn-193-298) "Friendly units may be played to
 *   open battlefields." as the permission that widens the default.
 *
 * Q: Where in the rules does it say you can play units to a battlefield you control?
 * A: A unit is played to a "valid Location", and a valid Location is one you control — your base or a
 *    battlefield you control. (The ruling was answered while that definition was missing from the
 *    Comprehensive Rules; the 2026-07-24 CR carries it explicitly at 355.2.a, and an effect may make
 *    other locations valid under 355.2.b.)
 * Rules: 355.2 (choose a valid Location when playing a Unit), 355.2.a (default = your Base or a
 *        Battlefield you control), 355.2.b (effects may grant extra valid locations), 143.4 (a played
 *        unit enters exhausted).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MF_BUCCANEER = "ogn-193-298";
const VANILLA = { cardType: "unit", domain: "fury", energyCost: 1, might: 3, name: "Test Recruit" } as const;

/** P1's turn. bf1 is held by P1 (a unit anchors the control), bf2 is open, bf3 is held by P2. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { fury: 3, body: 3 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2")
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor")
    .unit(P2, "bf3", { might: 2, name: "Foe" }, "foe")
    .hand(P1, VANILLA, "recruit");
}

describe("Ruling 818a8b0b3f591167 — a valid Location for a unit play is one you control", () => {
  test("your base is always valid, and it is the default when no destination is named", async () => {
    const game = await board().build();
    await game.p1.play("recruit");
    expect(game.locationOf("recruit")).toBe("base");
    expect(game.state("recruit").isExhausted).toBe(true); // 143.4
    expect(game.violations()).toEqual([]);
  });

  test("a battlefield you CONTROL is offered as a destination and the unit may be played straight there", async () => {
    const game = await board().build();
    const dest = game.p1.option("play", "recruit")?.fields.find((f) => f.arg === "to");
    expect(dest?.options).toEqual(["base", "battlefield-bf1"]); // your base and the battlefield you control
    expect(dest?.options).not.toContain("battlefield-bf2"); // open battlefield
    expect(dest?.options).not.toContain("battlefield-bf3"); // enemy battlefield
    await game.p1.play("recruit", { to: "bf1" });
    expect(game.locationOf("recruit")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });

  test("an OPEN battlefield and an ENEMY battlefield are not valid locations by default", async () => {
    const game = await board().build();
    expect((await game.p1.try((p) => p.play("recruit", { to: "bf2" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.play("recruit", { to: "bf3" }))).ok).toBe(false);
    expect(game.zoneOf("recruit")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });

  test("an effect may make another location valid (355.2.b): Miss Fortune, Buccaneer opens the OPEN battlefield bf2", async () => {
    const game = await board().unit(P1, "base", MF_BUCCANEER, "mf").build();
    await game.p1.play("recruit", { to: "bf2" });
    expect(game.locationOf("recruit")).toBe("bf2");
    expect(game.violations()).toEqual([]);
  });
});
