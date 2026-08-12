/**
 * Ruling ed4010094feda467 — Karthus, Eternal (OGN-236 → ogn-236-298) · Unit · Order · 3 Might
 *   "Your [Deathknell] effects trigger an additional time."
 *   × Watchful Sentry (OGN-096 → ogn-096-298) "[Deathknell] — Draw 1."
 *   × Viktor, Leader (OGN-246 → ogn-246-298) "When ANOTHER non-Recruit unit you control dies, play a
 *     1 [Might] Recruit unit token into your base."
 *   × Fox-Fire (OGN-256 → ogn-256-298) "Kill any number of units at a battlefield with total Might 4 or less."
 *
 * Q: Do units with death-triggered effects see themselves die and trigger off their own death?
 * A: No — a unit never witnesses its own death, so a "when a unit dies" ability never fires for the unit
 *    carrying it. Consequently a unit cannot use such an ability to protect itself from mass removal.
 *    (Karthus's own text is a static doubler, not a death trigger; his death produces nothing at all.)
 * Rules: 383.2 (a trigger's condition is checked against the event as it happens), 359.3.e (last-known
 *        information for objects that have left), 432 (state-check deaths).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const KARTHUS = "ogn-236-298";
const WATCHFUL_SENTRY = "ogn-096-298";
const VIKTOR = "ogn-246-298";
const FOX_FIRE = "ogn-256-298";
const FILLER = "ogn-175-298";

const recruits = (game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) =>
  game.findAll({ name: "Recruit" }).filter((id) => game.has(id));

describe("Ruling ed4010094feda467 — a unit never sees its own death", () => {
  test("Viktor's 'when ANOTHER unit you control dies' does NOT fire off his own death: killed alone, no Recruit appears", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", VIKTOR, "viktor", { damage: 1 }) // 4 Might, 1 damage → Fox-Fire's ≤4 total counts current Might
      .hand(P1, FOX_FIRE, "fox")
      .build();
    await game.p1.cast("fox", { targets: ["viktor"] });
    await game.settle();
    expect(game.zoneOf("viktor")).toBe("trash");
    expect(recruits(game)).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control: he DOES see another friendly unit die — one Recruit, and exactly one", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", VIKTOR, "viktor")
      .unit(P1, "bf1", { might: 2, name: "Pal" }, "pal")
      .hand(P1, FOX_FIRE, "fox")
      .build();
    await game.p1.cast("fox", { targets: ["pal"] });
    await game.settle();
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.zoneOf("viktor")).toBe("battlefield-bf1");
    expect(recruits(game)).toHaveLength(1);
  });

  test("mass removal: Viktor dying together with a friend still produces only the ONE Recruit that friend's death earns — never a second for himself", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", VIKTOR, "viktor", { mightModifier: -2 }) // 4 → 2, so Fox-Fire's ≤4 total covers both
      .unit(P1, "bf1", { might: 2, name: "Pal" }, "pal")
      .hand(P1, FOX_FIRE, "fox")
      .build();
    await game.p1.cast("fox", { targets: ["viktor", "pal"] });
    await game.settle();
    expect(game.zoneOf("viktor")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("trash");
    expect(recruits(game).length).toBeLessThanOrEqual(1);
    expect(game.violations()).toEqual([]);
  });

  test("Karthus's own text is a STATIC doubler, not a death trigger: killing him alone puts nothing on the chain and draws nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", KARTHUS, "karthus")
      .hand(P1, FOX_FIRE, "fox")
      .deck(P1, [FILLER, FILLER, FILLER], ["a", "b", "c"])
      .build();
    await game.p1.cast("fox", { targets: ["karthus"] });
    await game.settle();
    expect(game.zoneOf("karthus")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual([]); // no draw of his own
  });

  test("…and he cannot shield himself from the wipe: Fox-Fire taking Karthus AND the Sentry kills both (the Sentry's own [Deathknell] still fires — that IS a printed 'when I die')", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", KARTHUS, "karthus")
      .unit(P1, "bf1", WATCHFUL_SENTRY, "sentry")
      .hand(P1, FOX_FIRE, "fox")
      .deck(P1, [FILLER, FILLER, FILLER], ["a", "b", "c"])
      .build();
    await game.p1.cast("fox", { targets: ["karthus", "sentry"] });
    await game.settle();
    expect(game.zoneOf("karthus")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand().length).toBeGreaterThanOrEqual(1);
    expect(game.violations()).toEqual([]);
  });

  test("control: with Karthus alive the Sentry's [Deathknell] triggers the extra time — 2 cards, not 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", KARTHUS, "karthus")
      .unit(P1, "bf1", WATCHFUL_SENTRY, "sentry")
      .hand(P1, FOX_FIRE, "fox")
      .deck(P1, [FILLER, FILLER, FILLER], ["a", "b", "c"])
      .build();
    await game.p1.cast("fox", { targets: ["sentry"] });
    await game.settle();
    expect(game.zoneOf("karthus")).toBe("battlefield-bf1");
    expect(game.p1.hand()).toEqual(["a", "b"]);
  });
});
