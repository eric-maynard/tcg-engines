/**
 * Ruling 3daa786a3992d65f — Hexdrinker (SFD-102 → sfd-102-221) · Equipment · +1 · "[Equip] [body] … [Deflect]" (Effect Text →
 *     the wearer gains Deflect)
 *   × Irelia, Fervent (SFD-057 → sfd-057-221) · 4 Might · "[Deflect] When you choose or ready me, give me +1 [Might] this turn."
 *
 * Q: Hexdrinker on Irelia — does Deflect "double"?
 * A: The values are SUMMED (not multiplied): Irelia's printed Deflect (1) + Hexdrinker's granted Deflect (1) = Deflect 2 —
 *    opponents must pay 2 power (any domain) to choose her with a spell or ability.
 * Rules: 809.1.b.3 (bare Deflect = value 1), 809.2 (multiple Deflect sources sum), 809.1.c.1 (paid in power of any domain),
 *        136/718.3 (Equipment Effect Text is conferred to the wearer).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HEXDRINKER = "sfd-102-221";
const IRELIA = "sfd-057-221";

/** A [1] Action "Deal 2 to a unit." for the opponent to aim at Irelia. */
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt (deal 2)",
  timing: "action",
} as const;

/** P2's turn with [1] + `power` fury. P1: Irelia in base wearing Hexdrinker (or bare). P2 holds the Bolt. */
function board(power: number, equipped = true) {
  const s = scenario().active(P2).resources(P2, { energy: 1, power: { fury: power } }).hand(P2, BOLT, "bolt");
  return equipped
    ? s.unit(P1, "base", IRELIA, "irelia", { equippedWith: ["hex"] }).card("hex", { def: HEXDRINKER, meta: { attachedTo: "irelia" }, owner: P1, zone: "base" })
    : s.unit(P1, "base", IRELIA, "irelia");
}

describe("Ruling 3daa786a3992d65f — Hexdrinker on Irelia: Deflect 1 + Deflect 1 = Deflect 2 (summed)", () => {
  test("baseline: bare Irelia has Deflect 1 — an opponent's spell may choose her by paying ONE extra power", async () => {
    const game = await board(1, false).build();
    expect(game.state("irelia").keywords).toContain("Deflect");
    await game.p2.cast("bolt", { targets: "irelia" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // [1] + 1 Deflect pip
  });

  test("with Hexdrinker attached (4 + 1 = 5 Might): ONE spare power is no longer enough to choose her — the surcharge is now 2", async () => {
    const game = await board(1).build();
    expect(game.state("irelia")).toMatchObject({ attachments: ["hex"], might: 5 });
    expect(game.state("irelia").keywords).toContain("Deflect");
    expect(game.p2.can("cast", "bolt")).toBe(false); // Irelia is the only unit and she costs 2 extra
    const r = await game.p2.try((p) => p.cast("bolt", { targets: "irelia" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("bolt")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 1, power: { fury: 1 } });
  });

  test("with TWO spare power it is legal and exactly 2 pips are taken (summed 1 + 1 — not 1, and nothing beyond 2); the Bolt then lands", async () => {
    const game = await board(2).build();
    expect(game.p2.can("cast", "bolt")).toBe(true);
    await game.p2.cast("bolt", { targets: "irelia" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.state("irelia").damage).toBe(2);
    expect(game.zoneOf("irelia")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("'summed, not doubled' also means a third spare power is simply left over (Deflect 2, not more)", async () => {
    const game = await board(3).build();
    await game.p2.cast("bolt", { targets: "irelia" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 1 } });
  });
});
