/**
 * Ruling 42b466db3f308240 — Sunken Temple (SFD-218 → sfd-218-221) · Battlefield
 *   "When you conquer here with one or more [Mighty] units, you may pay [1] to draw 1."
 *
 * Q: A 4-Might unit with [Assault] walks onto the Temple with no defenders. Does the +1 from Assault make
 *    it [Mighty] and trigger the Temple?
 * A: No — but only for the reason the QUESTION asks about. [Assault] is live only while the unit holds the
 *    Attacker designation (807.1.c–d), and a unit only gains that designation when a COMBAT opens
 *    (464.2.c.3); walking onto an unoccupied battlefield opens a non-combat showdown, so there is no
 *    designation and no bonus and the unit conquers at 4 Might.
 * ADJUDICATED (2026-08-12): the ruling's closing paragraph — "even in a real combat the Assault bonus and
 *    Attacker designation are removed during the Combat Cleanup, immediately before the Conquer step" — is
 *    WRONG under the current (Unleashed) CR and is not followed. See the RULING-CONFLICT facet at the
 *    bottom of this file: 466.5.d Conquers at Resolution-Step 5 while 466.7.a only removes the designation
 *    at step 7, so [Assault] is still live when the Conquer's triggers are evaluated.
 * Rules: 807.1.c / 807.1.d.1 ([Assault] applies, and remains, only while an Attacker), 464.2.c.3
 *        (designations granted when the combat opens), 466.5.d (Conquer) vs 466.7.a (designations removed),
 *        708 / 710 ([Mighty] = 5+).
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

  // RULING-CONFLICT (adjudicated 2026-08-12 — this facet PREVIOUSLY asserted the other way, as a
  // `test.failing` "the engine still reads the Assault bonus at the Conquer" bug marker).
  // Ruling 42b466db3f308240's closing paragraph says the Attacker designation, and with it [Assault], is
  // "removed during the Combat Cleanup phase, immediately before the Conquer step". The CR says the
  // opposite, and the Resolution Step's own numbering is decisive: the Combat Cleanup is step 466.1,
  // Establish Control / Conquer is step 466.5 (466.5.d), and only step 466.7.a — two steps LATER — says
  // "Remove Attacker and Defender Designation from all Units and Players". Rule 807.1.d.1 keeps [Assault]
  // in effect "as long as the Unit maintains the Attacker designation", so at 466.5.d the bonus is still
  // being applied and the conqueror is [Mighty] (708/710).
  // The four rulings that agree: 8bf06d3d8b09e32c (riftfaq, citing exactly 466.5.d vs 466.7.a),
  // f04d5265ef4cdef8 ("under the Unleashed rules update … PREVIOUSLY Assault would have deactivated before
  // conquer effects resolved" — which is what 42b466db and c1edab45a describe), 211635a4cca0ac5a and
  // c1edab45ab8d7f0f. 42b466db3f308240 and c1edab45ab8d7f0f are pre-Unleashed answers; the engine follows
  // the CR. The rest of this ruling (no designation, no [Assault] on a walk-in) is correct and green above.
  test("RULING-CONFLICT 42b466db3f308240 — CR 466.5.d/466.7.a: [Assault] is STILL live at the Conquer, so the 5-Might attacker is Mighty and the Temple offers its paid draw", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("temple", { controller: P2, def: SUNKEN_TEMPLE, inert: false, owner: P2 })
      .unit(P2, "temple", { might: 2, name: "Temple Guard" }, "guard")
      .unit(P1, "base", ASSAULTER(4), "lucian")
      .deck(P1, ["ogn-175-298"], ["d1"])
      .build();
    await game.p1.move("lucian", "temple");
    expect(game.state("lucian")).toMatchObject({ combatRole: "attacker", might: 5 }); // Mighty WHILE attacking …
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.temple?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    // … and still Mighty at 466.5.d, so the Temple's conquer ability sees a [Mighty] unit and asks.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.hand()).toEqual(["d1"]);
    // 466.7.a — the designation (and with it [Assault]) ends only once the combat itself ends.
    expect(game.state("lucian")).toMatchObject({ combatRole: null, might: 4 });
    expect(game.violations()).toEqual([]);
  });
});
