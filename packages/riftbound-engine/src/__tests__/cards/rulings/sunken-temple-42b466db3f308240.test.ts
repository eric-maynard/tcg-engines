/**
 * Ruling 42b466db3f308240 — Sunken Temple (SFD-218 → sfd-218-221) · Battlefield
 *   "When you conquer here with one or more [Mighty] units, you may pay [1] to draw 1."
 *
 * Q: A 4-Might unit with [Assault] walks onto the Temple with no defenders. Does the +1 from Assault make
 *    it [Mighty] and trigger the Temple?
 * A: No. [Assault] is only live while the unit has the Attacker designation, and you only become an
 *    Attacker in a COMBAT showdown — moving onto an unoccupied battlefield is a non-combat showdown, so no
 *    designation and no bonus: the unit conquers at 4 Might and is not Mighty. Even in a real combat the
 *    designations (and with them Assault) are stripped in the Combat Cleanup before the Conquer step, so
 *    the Temple never sees an Assault-inflated Might.
 * Rules: 727 / 807.1.c ([Assault] applies only while an Attacker), 464.2 (designations are granted when a
 *        combat is staged), 466.1/466.5 (designations end in Combat Cleanup, before Conquer), 730 ([Mighty] = 5+).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SUNKEN_TEMPLE = "sfd-218-221";

const ASSAULTER = (might: number) => ({ keywords: ["Assault"], might, name: "Lucian" });

describe("Ruling 42b466db3f308240 — [Assault] never makes the conqueror [Mighty] for Sunken Temple", () => {
  test("moving onto an EMPTY Temple is a non-combat showdown: no Attacker designation, so the 4-Might unit stays at 4 …", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("temple", { controller: null, def: SUNKEN_TEMPLE, inert: false, owner: P2 })
      .unit(P1, "base", ASSAULTER(4), "lucian")
      .build();
    await game.p1.move("lucian", "temple");
    expect(game.state("lucian").combatRole).toBeNull();
    expect(game.state("lucian").might).toBe(4); // [Assault] is inactive
    expect(game.state("lucian").keywords).toContain("Assault");
  });

  test("ruling: … so the conquer happens with nothing [Mighty] — no pay-[1]-draw-1 offer, no draw", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("temple", { controller: null, def: SUNKEN_TEMPLE, inert: false, owner: P2 })
      .unit(P1, "base", ASSAULTER(4), "lucian")
      .build();
    const hand = game.p1.hand().length;
    await game.p1.move("lucian", "temple");
    await game.settle();
    expect(game.gameState.battlefields.temple?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.p1.energy()).toBe(1); // the Temple's [1] was never asked for
    expect(game.violations()).toEqual([]);
  });

  test("control: an already-5-Might unit (no Assault involved) DOES trigger the Temple on the same walk-in", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("temple", { controller: null, def: SUNKEN_TEMPLE, inert: false, owner: P2 })
      .unit(P1, "base", { might: 5, name: "Colossus" }, "colossus")
      .build();
    const hand = game.p1.hand().length;
    await game.p1.move("colossus", "temple");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.hand()).toHaveLength(hand + 1);
  });

  // The engine keeps the Attacker designation (and therefore [Assault]) alive while the conquer trigger is
  // evaluated, so it OFFERS the Temple's pay-[1]-draw-1 for an Assault-inflated 5 Might. The ruling says the
  // designations are stripped in the Combat Cleanup, before the Conquer step, so nothing should be Mighty.
  test.failing("BUG: ruling 42b466db3f308240 — after a real combat the engine still reads the Assault bonus (5) at the Conquer and offers Sunken Temple's draw", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("temple", { controller: P2, def: SUNKEN_TEMPLE, inert: false, owner: P2 })
      .unit(P2, "temple", { might: 2, name: "Temple Guard" }, "guard")
      .unit(P1, "base", ASSAULTER(4), "lucian")
      .build();
    const hand = game.p1.hand().length;
    await game.p1.move("lucian", "temple");
    expect(game.state("lucian")).toMatchObject({ combatRole: "attacker", might: 5 }); // Mighty WHILE attacking …
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.temple?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("lucian").might).toBe(4); // … but not any more when the conquer is scored
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.violations()).toEqual([]);
  });
});
