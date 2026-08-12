/**
 * Ruling 7a7e38bd59bf6644 — Gust (OGN-169 → ogn-169-298) · [Reaction] · Chaos · [1]
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2] · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: Can Zhonya's be played in base to save a unit that is at a battlefield?
 * A: Yes — a face-up Hourglass in your base protects any friendly unit, wherever it is. What it cannot be is a
 *    "hidden spell": [Hidden] hides it at a BATTLEFIELD (for [rainbow], revealed later for [0]). And if it is revealed
 *    at a battlefield without being consumed — e.g. the unit it would have saved is Gusted away first — it simply
 *    becomes a normal gear in base, usable for any unit afterwards.
 * Rules: 370–373 (die replacement, no location clause), 811.1 ([Hidden] = facedown at a battlefield), 355.2.a
 *        (gear are played to base), 359.3.e.5 (a removed target makes the instruction fizzle).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const ZHONYAS = "ogn-077-298";

/** Inline [1] action spell: kill a unit. */
const SLAY = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  name: "Test Slay",
  timing: "action",
};

describe("Ruling 7a7e38bd59bf6644 — Zhonya's in base saves a unit at a battlefield; [Hidden] hides it at a battlefield, not in base", () => {
  test("a face-up Hourglass sitting in P1's BASE saves P1's unit dying at bf1: the gear dies instead and the unit is healed, exhausted and recalled", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Scout" }, "scout", { damage: 1 })
      .gear(P1, ZHONYAS, "zh")
      .hand(P2, SLAY, "slay")
      .build();
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.locationOf("scout")).toBe("bf1");
    await game.p2.cast("slay", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash"); // "kill this instead"
    expect(game.zoneOf("scout")).toBe("base"); // healed, exhausted, recalled
    expect(game.state("scout")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.violations()).toEqual([]);
  });

  test("[Hidden] puts it facedown at a BATTLEFIELD (for [rainbow]) — base is not a hiding place", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Scout" }, "scout")
      .hand(P1, ZHONYAS, "zh")
      .build();
    expect((await game.p1.try((p) => p.hide("zh", "base"))).ok).toBe(false);
    await game.p1.hide("zh", "bf1");
    expect(game.zoneOf("zh")).toBe("facedown-bf1");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 0 } }); // [rainbow] to hide
  });

  test("revealed from hiding for [0] it becomes an ordinary gear in P1's BASE — from where it goes on to protect any friendly unit", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Scout" }, "scout")
      .unit(P1, "bf2", { might: 3, name: "Ranger" }, "ranger")
      .facedown(P1, "bf1", ZHONYAS, "zh")
      .hand(P2, SLAY, "slay")
      .build();
    expect(game.zoneOf("zh")).toBe("facedown-bf1");
    await game.p2.cast("slay", { targets: "ranger" }); // the threat is at the OTHER battlefield
    await game.p2.passPriority();
    await game.p1.reveal("zh");
    expect(game.zoneOf("zh")).toBe("base"); // gear live in base once revealed
    expect(game.p1.gear()).toContain("zh");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // [0] to reveal
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash"); // it saved the Ranger at bf2
    expect(game.zoneOf("ranger")).toBe("base");
    expect(game.state("ranger").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("nuance — if the unit it would have saved is Gusted away first, the Hourglass is NOT consumed and stays available in base", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1 })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Scout" }, "scout")
      .unit(P1, "bf2", { might: 3, name: "Ranger" }, "ranger")
      .facedown(P1, "bf1", ZHONYAS, "zh")
      .hand(P1, GUST, "gust")
      .hand(P2, SLAY, "slay")
      .build();
    await game.p2.cast("slay", { targets: "scout" });
    await game.p2.passPriority();
    await game.p1.reveal("zh");
    expect(game.zoneOf("zh")).toBe("base");
    await game.p2.passPriority();
    await game.p1.cast("gust", { targets: "scout" }); // save it a cheaper way — the Hourglass is not spent
    await game.settle();
    expect(game.zoneOf("scout")).toBe("hand"); // Gust resolved first, so Slay had no target
    expect(game.zoneOf("zh")).toBe("base"); // still there, and no longer tied to bf1
    expect(game.p1.gear()).toContain("zh");
    expect(game.violations()).toEqual([]);
  });
});
