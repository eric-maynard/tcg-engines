/**
 * Ruling 8a5428ebb0cb8e0f — Svellsongur (SFD-059 → sfd-059-221) · Equipment · Calm · [Equip] [1][calm]
 *     "As this is attached to a unit, copy that unit's text to this Equipment's effect text …"
 *   × Jhin, Murderous Artist (UNL-022 → unl-022-219) · Champion · 4 Might · "[Deflect] [Ganking] When I move, [Add] [1][rainbow]."
 *   × Salvage (OGN-224 → ogn-224-298) · "You may kill up to one gear. Draw 1."
 *
 * Q: If I equip Jhin with Svellsongur, is the Deflect copied too?
 * A: Yes — Svellsongur's effect text gains Jhin's printed [Deflect] (= Deflect 1) and grants it to him on top of his own,
 *    and Deflect values sum: Jhin has Deflect 2. Svellsongur itself does NOT have Deflect — targeting the gear (e.g.
 *    Salvage) costs no extra power.
 * Rules: 809.1.b.3 ([Deflect] with no number = 1), 809.2 (Deflect from multiple sources sums), 718 (copying text),
 *        Equipment effect text applies to the equipped unit.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SVELLSONGUR = "sfd-059-221";
const JHIN = "unl-022-219";
const SALVAGE = "ogn-224-298";
/** A 1-cost [Action] "Deal 1 to a unit" so the only variable is the Deflect surcharge for choosing Jhin. */
const SPARK = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Spark",
  timing: "action",
} as const;

/**
 * P1's turn 2: Jhin in base, Svellsongur loose with exactly [1][calm] to Equip. P2 holds Spark and Salvage.
 * P1 equips, the turn passes to P2, and P2 is handed `p2` resources (pools empty at end of turn, so add them then).
 */
async function jhinWearingSvellsongurOnP2Turn(p2: { energy: number; power: Record<string, number> }): Promise<Game> {
  const game = await scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .unit(P1, "base", JHIN, "jhin")
    .gear(P1, SVELLSONGUR, "svell")
    .hand(P2, SPARK, "spark")
    .hand(P2, SALVAGE, "salvage")
    .build();
  await game.p1.do("equipCard", { equipmentId: "svell", unitId: "jhin" });
  await game.settle();
  expect(game.state("svell").attachedTo).toBe("jhin");
  expect(game.state("svell").meta.copiedFromCardId).toBe("jhin"); // Jhin's text now lives on the Equipment too
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.do("addResources", p2);
  expect(game.p2.resources()).toEqual(p2);
  return game;
}

describe("Ruling 8a5428ebb0cb8e0f — Svellsongur on Jhin: Deflect 1 + copied Deflect 1 = Deflect 2 on Jhin, none on the gear", () => {
  test("baseline — bare Jhin is Deflect 1: an opponent's Spark at him costs 1 energy + exactly ONE power", async () => {
    const game = await scenario().active(P2).resources(P2, { energy: 1, power: { rainbow: 2 } }).unit(P1, "base", JHIN, "jhin").hand(P2, SPARK, "spark").build();
    expect(game.state("jhin").keywords).toContain("Deflect");
    await game.p2.cast("spark", { targets: "jhin" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
  });

  test("with Svellsongur attached, ONE power is no longer enough to choose Jhin — the cast is refused and nothing is spent", async () => {
    const game = await jhinWearingSvellsongurOnP2Turn({ energy: 1, power: { rainbow: 1 } });
    const r = await game.p2.try((p) => p.cast("spark", { targets: "jhin" }));
    expect(r.ok).toBe(false);
    expect(game.p2.resources()).toEqual({ energy: 1, power: { rainbow: 1 } });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("spark")).toBe("hand");
  });

  test("with Svellsongur attached Jhin is Deflect 2: Spark at him costs 1 energy + TWO power, then resolves normally (1 damage)", async () => {
    const game = await jhinWearingSvellsongurOnP2Turn({ energy: 1, power: { rainbow: 2 } });
    await game.p2.cast("spark", { targets: "jhin" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    expect(game.zoneOf("spark")).toBe("trash");
    expect(game.state("jhin").damage).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("Svellsongur itself has no Deflect: Salvage choosing the gear costs only Salvage's own price (no power beyond its pip), kills it, and P2 draws 1", async () => {
    const game = await jhinWearingSvellsongurOnP2Turn({ energy: 2, power: { order: 1 } }); // zero rainbow available
    expect(game.state("svell").keywords).not.toContain("Deflect");
    const handBefore = game.p2.hand().length;
    await game.p2.cast("salvage", { targets: "svell" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("svell")).toBe("trash");
    expect(game.state("jhin").attachments).toEqual([]);
    expect(game.p2.hand()).toHaveLength(handBefore - 1 + 1); // Salvage left, drew 1
    expect(game.zoneOf("jhin")).toBe("base");
  });
});
