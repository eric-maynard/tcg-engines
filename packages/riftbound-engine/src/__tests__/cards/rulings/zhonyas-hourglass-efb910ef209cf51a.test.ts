/**
 * Ruling efb910ef209cf51a — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2] · [Hidden]
 *   "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   (Sett is cited alongside; only the Hourglass is exercised here.)
 *   × Void Seeker (ogn-024-298) "Deal 4 to a unit at a battlefield. Draw 1." / Hextech Ray (ogn-009-298) "Deal 3 …".
 *
 * Q: When Zhonya's recalls a unit exhausted instead of it dying, what happens to SPELL damage already on the unit?
 * A: The (errata'd) text also HEALS the saved unit — it arrives in base with no damage marked. (The original template
 *    without the heal would have left it lethally damaged.)
 * Rules: 370–373 (replacement), 142.4 (lethal damage), 420 (heal removes marked damage).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const VOID_SEEKER = "ogn-024-298";
const HEXTECH_RAY = "ogn-009-298";

/** P2's turn with spell money. P1 holds bf1 with a 3-Might Ward (optionally pre-damaged) and an Anchor; Zhonya's face up in P1's base. */
function board(wardDamage = 0) {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 4, power: { fury: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 1, name: "Their Holder" }, "th")
    .unit(P1, "bf1", { might: 3, name: "Ward" }, "ward", wardDamage ? { damage: wardDamage } : undefined)
    .unit(P1, "bf1", { might: 5, name: "Anchor" }, "anchor")
    .gear(P1, ZHONYAS, "zh")
    .hand(P2, VOID_SEEKER, "seeker")
    .hand(P2, HEXTECH_RAY, "ray");
}

describe("Ruling efb910ef209cf51a — a unit saved by Zhonya's is healed of the spell damage that would have killed it", () => {
  test("Void Seeker's 4 on the 3-Might Ward: Zhonya's is killed instead and the Ward lands in base EXHAUSTED with 0 damage (not 4) — and it stays alive through the following cleanups", async () => {
    const game = await board().build();
    await game.p2.cast("seeker", { targets: "ward" });
    await game.settle();
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("ward")).toMatchObject({ damage: 0, isExhausted: true, might: 3, zone: "base" });
    expect(game.p1.trash()).not.toContain("ward");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("earlier spell damage is wiped too: Ward already carrying 1 (from before) takes Hextech Ray's 3 → would die → saved with ALL damage healed (0), not just the last hit", async () => {
    const game = await board(1).build();
    expect(game.state("ward").damage).toBe(1);
    await game.p2.cast("ray", { targets: "ward" });
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("ward")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
  });

  test("the heal matters: the saved Ward survives into P1's next turn and readies like any unit (had the damage stayed, 4 ≥ 3 would kill it in the very next cleanup)", async () => {
    const game = await board().build();
    await game.p2.cast("seeker", { targets: "ward" });
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("ward")).toMatchObject({ damage: 0, isReady: true, zone: "base" });
  });
});
