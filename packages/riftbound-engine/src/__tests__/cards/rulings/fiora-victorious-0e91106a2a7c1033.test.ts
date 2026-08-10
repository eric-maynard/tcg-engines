/**
 * Ruling 0e91106a2a7c1033 — Fiora, Victorious (OGN-232 → ogn-232-298) · Champion Unit · Order · [4] · 4 Might
 *   "While I'm [Mighty], I have [Deflect], [Ganking], and [Shield]. (I'm Mighty while I have 5+ [Might].)"
 *
 * Q: Fiora became Mighty from a buff received during a combat in which she defends. Does she also get Shield's +1
 *    now, or was that "trigger" missed?
 * A: There is nothing to miss — it is all passive. At 5 Might she is Mighty, so she has Shield; Shield is "+1 Might
 *    while I'm a defender", and she is defending, so she is immediately 6. No chain, no trigger.
 * Rules: 814 (Shield, passive), 727 (Mighty = 5+ Might), continuous/static evaluation (layers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIORA_VICTORIOUS = "ogn-232-298";
/** A 1-cost [Action] "Buff a friendly unit." — playable by the Focus holder during a showdown. */
const EN_GARDE = {
  abilities: [{ effect: { target: { controller: "friendly", type: "unit" }, type: "buff" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 1,
  name: "En Garde (buff)",
  rulesText: "Buff a friendly unit.",
  timing: "action",
} as const;

/** P2's turn. P1's Fiora (4) holds bf1; P1 has [1] and En Garde in hand. P2 attacks with a 5-Might Duelist. */
function board() {
  return scenario()
    .turn(4)
    .active(P2)
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", FIORA_VICTORIOUS, "fiora")
    .hand(P1, EN_GARDE, "buff")
    .unit(P2, "base", { might: 5, name: "Duelist" }, "duelist");
}

/** Duelist attacks; P2 passes Focus; P1 (defender, with Focus) buffs Fiora; the spell resolves. */
async function buffedMidCombat(): Promise<Game> {
  const game = await board().build();
  expect(game.state("fiora")).toMatchObject({ isBuffed: false, might: 4 });
  expect(game.state("fiora").keywords).not.toContain("Shield");
  await game.p2.move("duelist", "bf1");
  expect(game.state("fiora")).toMatchObject({ combatRole: "defender", might: 4 }); // not Mighty: no Shield yet
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("buff", { targets: "fiora" });
  await game.p1.passPriority();
  await game.p2.passPriority(); // En Garde resolves
  expect(game.zoneOf("buff")).toBe("trash");
  return game;
}

describe("Ruling 0e91106a2a7c1033 — Fiora hitting 5 while defending instantly has Shield and reads 6; nothing to 'miss'", () => {
  test("the buff lands mid-combat: 4 + 1 = 5 ⇒ Mighty ⇒ she HAS Deflect/Ganking/Shield at once, and as the defender Shield's +1 applies immediately — 6 Might, with no trigger put on the chain", async () => {
    const game = await buffedMidCombat();
    expect(game.chain()).toEqual([]); // no "became Mighty" item — purely static
    const s = game.state("fiora");
    expect(s.isBuffed).toBe(true);
    expect(s.combatRole).toBe("defender");
    expect(s.keywords).toEqual(expect.arrayContaining(["Deflect", "Ganking", "Shield"]));
    expect(s.might).toBe(6);
  });

  test("and it counts where it matters: the 5-Might Duelist deals 5 < 6 — Fiora survives and kills it (6 ≥ 5); P1 keeps bf1", async () => {
    const game = await buffedMidCombat();
    await game.settle();
    expect(game.zoneOf("duelist")).toBe("trash");
    expect(game.state("fiora")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("after combat she is no longer a defender: Shield goes quiet (5 Might: 4 + buff) but she is still Mighty and still HAS the three keywords", async () => {
    const game = await buffedMidCombat();
    await game.settle();
    const s = game.state("fiora");
    expect(s.combatRole).toBeNull();
    expect(s.might).toBe(5);
    expect(s.keywords).toEqual(expect.arrayContaining(["Deflect", "Ganking", "Shield"]));
  });

  test("contrast — unbuffed she stays 4 (not Mighty, no Shield): the 5-Might Duelist kills her (5 ≥ 4) and survives her 4", async () => {
    const game = await board().build();
    await game.p2.move("duelist", "bf1");
    await game.settle();
    expect(game.zoneOf("fiora")).toBe("trash");
    expect(game.zoneOf("duelist")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
