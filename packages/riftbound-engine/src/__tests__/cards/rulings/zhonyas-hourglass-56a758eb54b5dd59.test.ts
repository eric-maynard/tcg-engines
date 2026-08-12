/**
 * Ruling 56a758eb54b5dd59 — Zhonya's Hourglass (OGN-077 → ogn-077-298)
 *   "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: Played face-up as an ordinary gear (not hidden), must it save the NEXT friendly unit that dies,
 *    or may its controller choose when to use it?
 * A: It must save the next one. The ability is a mandatory replacement effect — no "you may", no
 *    window to hold it back; the very next friendly death consumes it. The one choice its controller
 *    gets is which unit to save when several die simultaneously.
 * Rules: 370–373 (replacement effects; 373 = which death a single-use replacement applies to),
 *        371 (a replacement with no "may" is mandatory), 149 (recall).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";

/** Base-speed "Deal 9 to a unit." */
const SMITE = {
  abilities: [{ effect: { amount: 9, target: { type: "unit" }, type: "damage" }, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Smite",
  rulesText: "Deal 9 to a unit.",
  timing: "standard",
} as const;

/** Base-speed "Deal 9 to all units at battlefields." — kills a whole battlefield at once. */
const WAVE = {
  abilities: [
    {
      effect: { amount: 9, target: { location: "battlefield", quantity: "all", type: "unit" }, type: "damage" },
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Wave",
  rulesText: "Deal 9 to all units at battlefields.",
  timing: "standard",
} as const;

describe("Ruling 56a758eb54b5dd59 — a face-up Zhonya's Hourglass must save the next friendly unit to die", () => {
  test("it is a face-up gear on the board, and the next friendly death consumes it with no opt-in prompt", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Alpha" }, "a")
      .gear(P1, ZHONYAS, "hourglass")
      .hand(P1, SMITE, "smite")
      .build();
    expect(game.zoneOf("hourglass")).toBe("base"); // played normally, not hidden at a battlefield
    expect(game.state("hourglass").isHidden).toBe(false);
    await game.p1.cast("smite", { targets: "a" });
    const stop = await game.settle();
    expect(stop.reason).toBe("open"); // nothing was ever asked
    expect(game.locationOf("a")).toBe("base"); // saved: healed, exhausted, recalled
    expect(game.state("a").damage).toBe(0);
    expect(game.state("a").isExhausted).toBe(true);
    expect(game.zoneOf("hourglass")).toBe("trash"); // it died in Alpha's place
    expect(game.violations()).toEqual([]);
  });

  test("it cannot be saved for a later, better death: once spent on the first unit, the second one really dies", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Alpha" }, "a")
      .unit(P1, "bf1", { might: 9, name: "Champion" }, "champ")
      .gear(P1, ZHONYAS, "hourglass")
      .hand(P1, SMITE, "smite1")
      .hand(P1, SMITE, "smite2")
      .build();
    await game.p1.cast("smite1", { targets: "a" }); // the cheap unit dies first
    await game.settle();
    expect(game.locationOf("a")).toBe("base");
    expect(game.zoneOf("hourglass")).toBe("trash");
    await game.p1.cast("smite2", { targets: "champ" });
    await game.settle();
    expect(game.zoneOf("champ")).toBe("trash"); // no protection left
    expect(game.violations()).toEqual([]);
  });

  test("simultaneous deaths: the controller is asked WHICH one it saves, and only that one comes back", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Alpha" }, "a")
      .unit(P1, "bf1", { might: 3, name: "Bravo" }, "b")
      .gear(P1, ZHONYAS, "hourglass")
      .hand(P1, WAVE, "wave")
      .build();
    await game.p1.cast("wave");
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const decision = game.decision();
    expect(decision).toMatchObject({
      allowDecline: false,
      kind: "pick",
      max: 1,
      min: 1,
      seat: P1,
      semantics: "replacement-assign",
      timing: "RPL",
    });
    expect(
      decision?.kind === "pick" ? decision.options.map((o) => o.card).sort() : [],
    ).toEqual(["a", "b"]);
    await game.p1.pick("b");
    await game.settle();
    expect(game.locationOf("b")).toBe("base"); // the chosen one is saved
    expect(game.zoneOf("a")).toBe("trash"); // the other still dies
    expect(game.zoneOf("hourglass")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
