/**
 * Ruling eb9a7f822cbbe276 — (scraped under "Shadow" UNL-194; the unit meant is the) Shadow Clone token (rule 187.11) · 0 Might ·
 *     "When I attack, you may banish a unit from your trash. If you do, give me [Assault 4] this turn." — minted by Death Mark
 *     (ven-144-166).
 *   × Switcheroo (SFD-145 → sfd-145-221) · Action · "Swap the Might of two units at the same battlefield this turn."
 *
 * Q: Switcheroo on my attacking Shadow Clone (Assault 4 → Might 4) and an enemy 7-Might unit — what happens?
 * A: A full swap of the numbers: Switcheroo snapshots current Mights (4 vs 7), applies +3 to the clone and −3 to the enemy. Assault
 *    is part of the snapshot and keeps applying (not re-added): clone 0+4+3 = 7, enemy 4. The clone's 7 kills the enemy; the
 *    enemy's 4 doesn't kill the clone. After combat Assault drops off and the clone sits at 3 (0 + the +3, until end of turn).
 * Rules: 807 (Assault only while attacking), 432.1.a (swap = fixed modifiers from a snapshot), 465 (combat damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SWITCHEROO = "sfd-145-221";
const DEATH_MARK = "ven-144-166";
const SKULKER = "ogn-175-298";

/** P1's turn 2. P2 holds bf2 with a 7-Might Brute. P1: Death Mark ([2][rainbow]) now, Switcheroo kept for later; deck top = units. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 7, name: "Brute" }, "brute")
    .deck(P1, [SKULKER, SKULKER, SKULKER, SKULKER], ["u1", "u2", "u3", "u4"])
    .hand(P1, DEATH_MARK, "dm")
    .hand(P1, SWITCHEROO, "sw");
}

/** Death Mark → Shadow Clone; two turns on it is ready; it attacks bf2 and takes Assault 4 (banishing u1). P1 then holds Focus. */
async function cloneAttacksWithAssault(): Promise<{ game: Game; clone: string }> {
  const game = await board().build();
  await game.p1.cast("dm");
  await game.p1.passPriority();
  await game.p2.passPriority();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("base");
  }
  const clone = game.p1.units().find((u) => game.state(u).isToken) as string;
  expect(game.state(clone)).toMatchObject({ might: 0, name: "Shadow Clone" });
  await game.advanceToTurnOf(P2);
  await game.advanceToTurnOf(P1);
  await game.p1.do("addResources", { energy: 2, power: { chaos: 2 } }); // Switcheroo money for this turn
  await game.p1.move(clone, "bf2");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  await game.p1.pick("u1");
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.state(clone)).toMatchObject({ combatRole: "attacker", mightModifier: 0 });
  expect(game.state(clone).grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 4 }]);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return { clone, game };
}

/** Cast Switcheroo [clone, brute] in the showdown and resolve just the spell. */
async function switcheroo(game: Game, clone: string): Promise<void> {
  expect(game.p1.can("cast", "sw")).toBe(true);
  await game.p1.cast("sw", { targets: [clone, "brute"] });
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.zoneOf("sw")).toBe("trash");
}

describe("Ruling eb9a7f822cbbe276 — Switcheroo between an Assault-4 Shadow Clone (4) and a 7-Might enemy", () => {
  // Expected: snapshot 4 (0 + Assault 4 while attacking) vs 7 → clone +3, Brute −3. Actual: the swap helper treats a PRINTED-0-Might
  // unit as "not a unit" and reads the clone as 0 (Assault ignored) → clone +7 / Brute −7 (Brute 0).
  test("ruling eb9a7f822cbbe276 — swap-might snapshots a 0-Might token at 0, ignoring its live Assault 4 (+7/−7 instead of +3/−3)", async () => {
    const { game, clone } = await cloneAttacksWithAssault();
    await switcheroo(game, clone);
    expect(game.state(clone).mightModifier).toBe(3);
    expect(game.state("brute")).toMatchObject({ might: 4, mightModifier: -3 });
    expect(game.state(clone).grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 4 }]);
    expect(game.state(clone).combatRole).toBe("attacker");
  });

  test("combat: the clone hits for 0 + 4 + 3 = 7 (lethal to the 4-Might Brute) and takes only 4 (< 7) — Brute dies, clone survives and conquers bf2", async () => {
    const { game, clone } = await cloneAttacksWithAssault();
    await switcheroo(game, clone);
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf(clone)).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  // Expected: after combat the clone reads 3 (0 + the +3). Actual: 7 (0 + the engine's +7, see the BUG above).
  test("ruling eb9a7f822cbbe276 — after combat the swapped clone should sit at 3 Might; engine leaves it at 7", async () => {
    const { game, clone } = await cloneAttacksWithAssault();
    await switcheroo(game, clone);
    await game.settle();
    expect(game.state(clone)).toMatchObject({ combatRole: null, damage: 0, might: 3, mightModifier: 3 });
    await game.advanceTurn();
    expect(game.state(clone)).toMatchObject({ might: 0, mightModifier: 0 });
    expect(game.state(clone).grantedKeywords).toEqual([]);
  });

  test("control (no Switcheroo): the 4-Might attacking clone dies to the 7-Might Brute", async () => {
    const { game, clone } = await cloneAttacksWithAssault();
    await game.settle();
    expect(game.zoneOf(clone)).toBe("gone");
    expect(game.zoneOf("brute")).toBe("battlefield-bf2");
  });
});
