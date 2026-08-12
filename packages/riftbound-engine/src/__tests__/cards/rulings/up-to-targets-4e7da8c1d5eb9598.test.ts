/**
 * Ruling 4e7da8c1d5eb9598 — (no specific card) may "up to 2 units" name zero units?
 *   Exercised with Flash (OGS-011 → ogs-011-024) "[Reaction] Move up to 2 friendly units to base.",
 *   Singularity (OGN-105 → ogn-105-298) "Deal 6 to each of up to two units." and Kinkou Monk
 *   (OGN-141 → ogn-141-298) "When you play me, buff up to two other friendly units."
 *
 * Q: Can you play a card that says "up to 2 units" and choose 0 units?
 * A: Yes — "up to 2" means 0–2, not 1–2.
 * Rules: 355.13 (a quantity of "up to N" is satisfied by any number from zero to N; a play with zero
 *        chosen objects is still legal), 355.8 (the legality gate does not demand a target for an
 *        "up to" descriptor), 359.3.e.7 (an instruction with no objects simply does nothing).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FLASH = "ogs-011-024";
const SINGULARITY = "ogn-105-298";
const KINKOU_MONK = "ogn-141-298";

describe("Ruling 4e7da8c1d5eb9598 — 'up to N' includes zero", () => {
  test("Flash offers the empty set as a legal choice (min 0) alongside every 1- and 2-unit set", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "A" }, "a")
      .unit(P1, "bf1", { might: 3, name: "B" }, "b")
      .hand(P1, FLASH, "flash")
      .build();
    const field = game.p1.option("cast", "flash")?.fields.find((f) => f.arg === "targets");
    expect(field).toMatchObject({ max: 2, min: 0 });
    expect(field?.options).toContainEqual([]);
  });

  test("casting Flash for ZERO units is legal: the cost is paid, nothing moves, the spell is trashed", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "A" }, "a")
      .unit(P1, "bf1", { might: 3, name: "B" }, "b")
      .hand(P1, FLASH, "flash")
      .build();
    await game.p1.cast("flash", { targets: [] });
    await game.settle();
    expect(game.p1.energy()).toBe(0); // it really was played
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.locationOf("a")).toBe("bf1");
    expect(game.locationOf("b")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });

  test("…and one unit is equally legal, so 'up to 2' really spans 0, 1 and 2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "A" }, "a")
      .unit(P1, "bf1", { might: 3, name: "B" }, "b")
      .hand(P1, FLASH, "flash")
      .build();
    await game.p1.cast("flash", { targets: ["a"] });
    await game.settle();
    expect(game.locationOf("a")).toBe("base");
    expect(game.locationOf("b")).toBe("bf1");
  });

  test("a damage spell behaves the same: Singularity for zero units deals nothing to anybody", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { mind: 2 } })
      .unit(P1, "base", { might: 9, name: "Mine" }, "mine")
      .unit(P2, "base", { might: 9, name: "Theirs" }, "theirs")
      .hand(P1, SINGULARITY, "sing")
      .build();
    await game.p1.cast("sing", { targets: [] });
    await game.settle();
    expect(game.state("mine").damage).toBe(0);
    expect(game.state("theirs").damage).toBe(0);
    expect(game.zoneOf("sing")).toBe("trash");
  });

  test("on a TRIGGER the same is true: Kinkou Monk's 'buff up to two other friendly units' may be declined outright", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { body: 1 } })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .unit(P1, "base", { might: 2, name: "Page" }, "page")
      .hand(P1, KINKOU_MONK, "monk")
      .build();
    await game.p1.play("monk");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 }); // the set pick is surfaced…
    expect(d?.kind === "pick" ? d.min : undefined).toBe(0); // …and zero is a legal answer
    await game.p1.decline();
    await game.settle();
    expect(game.state("squire").isBuffed).toBe(false);
    expect(game.state("page").isBuffed).toBe(false);
    expect(game.zoneOf("monk")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
