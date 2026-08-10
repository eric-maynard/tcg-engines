/**
 * Ruling 4343f46da199e09c — The Harrowing (OGN-198 → ogn-198-298) · Spell · Chaos · [6][chaos][chaos] · [Action]
 *   "Play a unit from your trash, ignoring its Energy cost. (You must still pay its Power cost.)"
 *   × Sivir, Mercenary (sfd-143-221) · [4][chaos] · 4 Might · "[Accelerate] (You may pay [1][chaos] … to have me enter ready.) …"
 *
 * Q: Playing The Harrowing on a unit with Accelerate — can you pay the extra cost to have it enter ready?
 * A: Yes. The unit is PLAYED (from the trash), so its optional Accelerate cost may be paid as it is played and it then
 *    enters ready. Its Energy cost is ignored; its Power cost must still be paid.
 *    (The ruling's nuance line "only the power cost of Accelerate, not the memory cost" contradicts CR 356.1.b.3 — see below.)
 * Rules: 419.3 (effect plays follow the normal steps), 356.1.b.2 (ignore Energy cost only), 356.1.b.3 (additional
 *        costs such as Accelerate are still added and paid in full), 805.1.a / 805.2 / 805.6.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HARROWING = "ogn-198-298";
const SIVIR = "sfd-143-221";

/** P1's turn: Sivir in the trash, The Harrowing in hand; [6 + spare] energy and 2 (spell) + 1 (Sivir) + 1 (Accelerate) chaos. */
function board(spareEnergy: number) {
  return scenario()
    .resources(P1, { energy: 6 + spareEnergy, power: { chaos: 4 } })
    .trash(P1, SIVIR, "sivir")
    .hand(P1, HARROWING, "har")
    .unit(P2, "base", { might: 1, name: "Dummy" }, "dummy");
}

/** Cast The Harrowing choosing Sivir and settle up to the Accelerate offer (if any). */
async function harrowSivir(spareEnergy: number): Promise<Game> {
  const game = await board(spareEnergy).build();
  await game.p1.cast("har", { targets: "sivir" });
  expect(game.p1.resources()).toEqual({ energy: spareEnergy, power: { chaos: 2 } }); // the spell: [6][chaos][chaos]
  await game.settle();
  return game;
}

describe("Ruling 4343f46da199e09c — a unit The Harrowing plays may pay Accelerate and enter ready", () => {
  test("as Sivir is played from the trash, P1 is offered her optional Accelerate cost ([1][chaos]) — a yes/no that CAN be accepted with [1] + chaos spare", async () => {
    const game = await harrowSivir(1);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    expect(game.decision()?.prompt ?? "").toMatch(/\[1\]\[chaos\]/);
    expect(game.zoneOf("sivir")).not.toBe("base"); // still being played
  });

  test("accepting: Sivir enters the base READY; her [4] Energy was ignored but her [chaos] Power AND the full Accelerate [1][chaos] were paid (1 energy → 0, 2 chaos → 0)", async () => {
    const game = await harrowSivir(1);
    await game.p1.yes();
    await game.settle();
    expect(game.state("sivir")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("har")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("declining: Sivir enters EXHAUSTED; only her [chaos] Power cost is paid (energy 1 untouched, chaos 2 → 1)", async () => {
    const game = await harrowSivir(1);
    await game.p1.no();
    await game.settle();
    expect(game.state("sivir")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 1 } });
  });

  test("Accelerate's [1] is NOT covered by 'ignoring its Energy cost': with no spare energy the offer cannot be accepted and Sivir enters exhausted", async () => {
    // RULING-CONFLICT: riftjudge 4343f46da199e09c's nuance says "only the power cost needs to be paid for the Accelerate
    // ability, not the memory [energy] cost"; CR 356.1.b.3 (Legion Rearguard example) says the optional additional cost of
    // 1 Energy + 1 Power is added to the Total Cost and must be paid even when the base cost is ignored — engine follows CR.
    const game = await harrowSivir(0);
    for (let i = 0; i < 3; i++) {
      const d = game.decision();
      if (d?.kind !== "yes-no") {
        break;
      }
      expect(d.canAccept).toBe(false);
      await game.p1.no();
      await game.settle();
    }
    expect(game.state("sivir")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 1 } });
  });
});
