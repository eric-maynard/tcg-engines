/**
 * Ruling 196ec28818f593d5 — Not So Fast (SFD-045 → sfd-045-221) · Spell · Calm · 2 + [calm] · [Reaction]
 *     "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × Beast Below (SFD-132 → sfd-132-221) · Unit · 7 + [chaos][chaos] · 8 Might
 *     "When you play me, return another friendly unit and an enemy unit to their owners' hands."
 *
 * Q: Does Not So Fast counter only the part of Beast Below's effect aimed at my unit, or the whole effect?
 * A: The whole triggered ability — it is one chain item, countered as a unit; you cannot counter half of it. Neither
 *    unit is returned. Beast Below itself stays on the board: countering its "When you play me" ability does not undo
 *    the unit.
 * Rules: 412.1.a (a countered item does nothing), 383 (a triggered ability is a single chain item).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const BEAST_BELOW = "sfd-132-221";

/**
 * P2's turn with exactly 7 + [chaos][chaos]; Beast Below in hand; P2's Pal (2) in base. P1 holds bf1 with Guard (3)
 * and has Not So Fast + exactly 2 + [calm].
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 7, power: { chaos: 2 } })
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P2, "base", { might: 2, name: "Pal" }, "pal")
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .hand(P2, BEAST_BELOW, "beast")
    .hand(P1, NOT_SO_FAST, "nsf");
}

describe("Ruling 196ec28818f593d5 — Not So Fast counters Beast Below's ENTIRE play trigger; the Beast stays", () => {
  test("Beast Below is played: the unit is on the board and ONE triggered chain item names both the friendly Pal and the enemy Guard", async () => {
    const game = await board().build();
    await game.p2.play("beast");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("beast")).toBe("base");
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "beast", controller: P2, triggered: true, type: "ability" });
    expect([...(game.chain()[0]?.targets ?? [])].sort()).toEqual(["guard", "pal"]);
  });

  test("P1 gets priority and Not So Fast may target that ability (it chooses P1's Guard)", async () => {
    const game = await board().build();
    await game.p2.play("beast");
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "nsf")).toBe(true);
    await game.p1.cast("nsf", { targets: "beast" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["beast", "nsf"]);
  });

  test("resolution: the whole ability is countered — NEITHER the Pal nor the Guard is returned — and Beast Below remains on the board", async () => {
    const game = await board().build();
    await game.p2.play("beast");
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    await game.p1.cast("nsf", { targets: "beast" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("base"); // the "friendly unit" half did NOT happen either
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.p2.hand()).not.toContain("pal");
    expect(game.p1.hand()).not.toContain("guard");
    expect(game.zoneOf("beast")).toBe("base"); // only the ability was countered, not the unit
    expect(game.state("beast").might).toBe(8);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("control: with no counter, the trigger resolves and BOTH units go back to their owners' hands", async () => {
    const game = await board().build();
    await game.p2.play("beast");
    await game.settle();
    expect(game.zoneOf("pal")).toBe("hand");
    expect(game.p2.hand()).toContain("pal");
    expect(game.zoneOf("guard")).toBe("hand");
    expect(game.p1.hand()).toContain("guard");
    expect(game.zoneOf("beast")).toBe("base");
  });
});
