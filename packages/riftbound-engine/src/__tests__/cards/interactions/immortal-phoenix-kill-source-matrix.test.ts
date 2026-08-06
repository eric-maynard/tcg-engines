/**
 * Interaction: Immortal Phoenix (ogn-037-298) — 3 energy + [fury], [Assault 2],
 *     "When you kill a unit with a spell, you may pay [1][fury] to play me from your trash."
 *   × Sky Splitter (ogn-014-298) — Action spell, "Deal 5 to a unit at a battlefield."
 *   × Smite (unl-007-219) — Action spell, "Deal 3 to a unit at a battlefield. If it would die this
 *     turn, banish it instead."
 *   (+ Zhonya's Hourglass ogn-077-298 as the opponent's death replacement, and plain combat.)
 *
 * Question: which kill sources let P1 pay [1][fury] to play the Phoenix from trash?
 *   (a) Sky Splitter's 5 damage kills an enemy 4-Might unit in the following cleanup.
 *   (b) Smite deals lethal 3 but replaces the death with a banish.
 *   (c) P1's units kill an enemy unit with combat damage.
 *   (d) Sky Splitter kills P1's OWN on-board Phoenix (trash had no Phoenix).
 *   (e) as (a) but the opponent's Zhonya's Hourglass replaces the death.
 *
 * Rules:
 *   428.5.c / 428.5.c.1 — a cleanup kill is attributed to the spell that dealt the damage just
 *                         before it; the dealer's controller is responsible → "you killed … with a spell" (411.6).
 *   428.5.c.2 — combat-cleanup kills are attributed to the units that dealt combat damage, not a spell.
 *   370.1.a.1 — a replaced death means the kill never occurred; 427.2.a — banish is not a kill.
 *   383.2.c.1 — a trash-zone trigger is evaluated if the card enters the trash simultaneously with
 *               its condition ("even if the unit you killed with a spell was that Immortal Phoenix").
 *   808.1.d.1 — Hourglass-style replacement: the unit is not sent to the trash at all.
 *   143.4     — a unit played (here: from trash) enters the board exhausted.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const IMMORTAL_PHOENIX = "ogn-037-298";
const SKY_SPLITTER = "ogn-014-298";
const SMITE = "unl-007-219";
const ZHONYAS_HOURGLASS = "ogn-077-298";

/** P1's turn, Phoenix in P1's trash, an enemy battlefield bf1, and enough to cast + pay [1][fury]. */
function trashBoard() {
  return scenario()
    .resources(P1, { energy: 9, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .trash(P1, IMMORTAL_PHOENIX, "phoenix");
}

describe("Immortal Phoenix — which kill sources count as 'you kill a unit with a spell'", () => {
  test("(a) Sky Splitter's damage kills an enemy unit in cleanup → kill attributed to the spell (428.5.c); P1 is offered the [1][fury] replay and Phoenix lands in base", async () => {
    // victim → trash, then a yes/no "Pay [1][fury]…" prompt for P1; yes → Phoenix from
    // trash to P1's base, 1 energy + 1 fury spent on top of the spell.
    const game = await trashBoard().unit(P2, "bf1", { might: 4 }, "victim").hand(P1, SKY_SPLITTER, "sky").build();
    await game.p1.cast("sky", { targets: "victim" });
    const afterCast = game.p1.resources();
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("phoenix")).toBe("base");
    expect(game.p1.energy()).toBe(afterCast.energy - 1);
    expect(game.p1.power("fury")).toBe((afterCast.power.fury ?? 0) - 1);
  });

  test("(b) Smite: lethal 3 to a 3-Might unit is replaced by a banish — no unit was killed (370.1.a.1, 427.2.a), so no Phoenix prompt", async () => {
    const game = await trashBoard().unit(P2, "bf1", { might: 3 }, "victim").hand(P1, SMITE, "smite").build();
    await game.p1.cast("smite", { targets: "victim" });
    const afterCast = game.p1.resources();
    const r = await game.settle();
    expect(game.zoneOf("victim")).toBe("banishment");
    expect(r.reason).toBe("open");
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.resources()).toEqual(afterCast);
  });

  test("(c) a combat kill is attributed to the units that dealt combat damage (428.5.c.2), not a spell — no Phoenix prompt", async () => {
    const game = await trashBoard().unit(P2, "bf1", { might: 2 }, "victim").unit(P1, "base", { might: 5 }, "bruiser").build();
    await game.p1.move("bruiser", "bf1");
    const r = await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(r.reason).toBe("open");
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 9, power: { fury: 2 } });
  });

  describe("(d) Sky Splitter kills P1's OWN on-board Phoenix (383.2.c.1: trigger evaluated as it enters the trash)", () => {
    function ownPhoenixBoard() {
      return scenario()
        .resources(P1, { energy: 9, power: { fury: 2 } })
        .battlefield("bf1", { controller: P1 })
        .unit(P1, "bf1", IMMORTAL_PHOENIX, "phoenix")
        .hand(P1, SKY_SPLITTER, "sky");
    }

    test("Phoenix (3 Might) dies to the 5 damage and P1 is immediately asked whether to pay [1][fury]", async () => {
      const game = await ownPhoenixBoard().build();
      expect(game.p1.trash()).toEqual([]);
      await game.p1.cast("sky", { targets: "phoenix" }); // own unit: legal target, no Deflect-style tax
      const r = await game.settle();
      expect(game.zoneOf("phoenix")).toBe("trash");
      expect(r.reason).toBe("unanswered");
      expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
      expect(game.decision()?.prompt ?? "").toMatch(/Immortal Phoenix/);
    });

    test("yes → pays exactly [1][fury] more, the play goes on the chain, and the same Phoenix returns to P1's base", async () => {
      const game = await ownPhoenixBoard().build();
      await game.p1.cast("sky", { targets: "phoenix" });
      await game.settle();
      const before = game.p1.resources();
      await game.p1.yes();
      expect(game.p1.energy()).toBe(before.energy - 1);
      expect(game.p1.power("fury")).toBe((before.power.fury ?? 0) - 1);
      expect(game.chain().map((i) => i.cardId)).toEqual(["phoenix"]);
      await game.settle();
      expect(game.zoneOf("phoenix")).toBe("base");
      expect(game.p1.units("base")).toContain("phoenix");
      expect(game.chain()).toHaveLength(0);
    });

    test.failing("BUG: the replayed Phoenix is a new object — the 5 damage from Sky Splitter is cleared by the trash round-trip (124.1)", async () => {
      // Expected: board → trash → board clears all damage; Phoenix sits in base at 0 damage.
      // Actual: it comes back still carrying the 5 damage that killed it.
      const game = await ownPhoenixBoard().build();
      await game.p1.cast("sky", { targets: "phoenix" });
      await game.settle();
      await game.p1.yes();
      await game.settle();
      expect(game.zoneOf("phoenix")).toBe("base");
      expect(game.state("phoenix").damage).toBe(0);
      expect(game.violations()).toEqual([]);
    });

    test.failing("BUG: the replayed Phoenix enters the board EXHAUSTED like any played unit (143.4)", async () => {
      // Expected: isExhausted true after being played from trash. Actual: it arrives ready.
      const game = await ownPhoenixBoard().build();
      await game.p1.cast("sky", { targets: "phoenix" });
      await game.settle();
      await game.p1.yes();
      await game.settle();
      expect(game.zoneOf("phoenix")).toBe("base");
      expect(game.state("phoenix").isExhausted).toBe(true);
    });

    test("'you may': declining leaves Phoenix in the trash and spends nothing", async () => {
      const game = await ownPhoenixBoard().build();
      await game.p1.cast("sky", { targets: "phoenix" });
      await game.settle();
      const before = game.p1.resources();
      await game.p1.no();
      const r = await game.settle();
      expect(r.reason).toBe("open");
      expect(game.zoneOf("phoenix")).toBe("trash");
      expect(game.p1.resources()).toEqual(before);
    });
  });

  test("(e) opponent's Zhonya's Hourglass replaces the death: the unit is not killed, so Phoenix does not trigger", async () => {
    const game = await trashBoard()
      .unit(P2, "bf1", { might: 4 }, "victim")
      .gear(P2, ZHONYAS_HOURGLASS, "hourglass")
      .hand(P1, SKY_SPLITTER, "sky")
      .build();
    await game.p1.cast("sky", { targets: "victim" });
    const afterCast = game.p1.resources();
    const r = await game.settle();
    expect(game.zoneOf("victim")).not.toBe("trash"); // death replaced
    expect(r.reason).toBe("open");
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.resources()).toEqual(afterCast);
  });

  test("(e) what IS killed instead is the Hourglass — a gear, not a unit — and the saved unit is healed, exhausted and recalled; still no Phoenix prompt (808.1.d.1)", async () => {
    // Expected: hourglass → P2's trash; victim → P2's base at 0 damage, exhausted; no yes/no for P1.
    // Actual: the replacement swallows the death but runs none of its effects (Hourglass stays in
    // base, victim stays at bf1 carrying 5 damage).
    const game = await trashBoard()
      .unit(P2, "bf1", { might: 4 }, "victim")
      .gear(P2, ZHONYAS_HOURGLASS, "hourglass")
      .hand(P1, SKY_SPLITTER, "sky")
      .build();
    await game.p1.cast("sky", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("hourglass")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim").damage).toBe(0);
    expect(game.state("victim").isExhausted).toBe(true);
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("phoenix")).toBe("trash");
  });
});
