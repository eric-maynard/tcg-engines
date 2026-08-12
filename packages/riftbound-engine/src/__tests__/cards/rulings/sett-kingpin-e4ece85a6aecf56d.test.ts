/**
 * Ruling e4ece85a6aecf56d — Sett, Kingpin (OGN-240 → ogn-240-298) · 5 Might · [Tank]
 *   "I get +1 [Might] for each buffed friendly unit at my battlefield."
 *   × The Boss (ogn-269-298), Sett's Legend: "If a buffed unit you control would die, you may pay
 *     [rainbow], exhaust me, and spend its buff to heal it, exhaust it, and recall it instead."
 *   × Vanguard Helm (ogn-228-298): "When a buffed friendly unit dies, buff another friendly unit."
 *
 * Q: When Sett is saved by his Legend after a combat that would kill everything, does his buff vanish
 *    before or after the other units die — and can Vanguard Helm move a buff from the dying unit onto
 *    the recalled Sett?
 * A: Yes, it can. Replacing Sett's death with a recall and the other unit's death happen at the same
 *    time; Vanguard Helm sees a buffed friendly unit die, its trigger goes on the chain, and you may
 *    announce the (already recalled, now unbuffed) Sett as its target. If it resolves, Sett is buffed.
 * Rules: 370–373 (death replacement, applied to the lethal batch as one event), 383.2 (the Helm's
 *        trigger is put on the chain afterwards and targets the board as it then stands).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SETT = "ogn-240-298";
const THE_BOSS = "ogn-269-298";
const VANGUARD_HELM = "ogn-228-298";

/**
 * P1 holds bf1 with a buffed Sett and a buffed Ally, owns The Boss + Vanguard Helm and can pay the
 * Legend's [rainbow]. It is P2's turn and a 12-Might Warlord attacks — enough to kill both.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .legend(P1, THE_BOSS, "boss")
    .gear(P1, VANGUARD_HELM, "helm")
    .unit(P1, "bf1", SETT, "sett", { buffed: true })
    .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally", { buffed: true })
    .unit(P1, "base", { might: 1, name: "Reserve" }, "reserve")
    .unit(P2, "base", { might: 12, name: "Warlord" }, "warlord");
}

/** Attack into bf1 and assign the combat damage the engine offers (Tank forces Sett first). */
async function attackAndAssign(game: Game): Promise<void> {
  await game.p2.move("warlord", "bf1");
  await game.p2.passFocus();
  await game.p1.passFocus();
  const d = game.decision() as Extract<Decision, { kind: "distribute" }>;
  expect(d).toMatchObject({ kind: "distribute", seat: P2 });
  await game.p2.distribute(d.defaultAllocation!);
}

describe("Ruling e4ece85a6aecf56d — Sett's recall and the other unit's death are simultaneous, so Vanguard Helm can buff the recalled Sett", () => {
  test("setup: buffed Sett is an 8-Might [Tank] (5 + his own buff + 1 per buffed friendly here)", async () => {
    const game = await board().build();
    expect(game.state("sett").might).toBe(8);
    expect(game.state("ally").might).toBe(3);
    expect(game.state("sett").keywords).toContain("Tank");
  });

  test("lethal combat damage offers The Boss's replacement to P1 before anything dies", async () => {
    const game = await board().build();
    await attackAndAssign(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    expect((d as { prompt: string }).prompt).toMatch(/The Boss/);
    expect(game.zoneOf("sett")).not.toBe("trash");
    expect(game.zoneOf("ally")).not.toBe("trash");
  });

  test("taking the replacement: the Ally dies while Sett is recalled to base, healed, exhausted and with his buff spent", async () => {
    const game = await board().build();
    await attackAndAssign(game);
    await game.p1.yes();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.locationOf("sett")).toBe("base");
    expect(game.state("sett").isBuffed).toBe(false); // the buff was the cost
    expect(game.state("sett").isExhausted).toBe(true);
    expect(game.state("sett").damage).toBe(0);
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.state("boss").isExhausted).toBe(true);
  });

  test("Vanguard Helm's trigger then offers the recalled Sett as a target, and choosing him buffs him", async () => {
    const game = await board().build();
    await attackAndAssign(game);
    await game.p1.yes();
    const d = game.decision() as Extract<Decision, { kind: "pick" }>;
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect((d.prompt ?? "").toLowerCase()).toContain("vanguard helm");
    expect(d.options.map((o) => o.card).sort()).toEqual(["reserve", "sett"]);
    await game.p1.pick("sett");
    await game.settle();
    expect(game.state("sett").isBuffed).toBe(true);
    expect(game.state("reserve").isBuffed).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("choosing the Reserve instead leaves Sett unbuffed — the Helm buffs exactly one unit", async () => {
    const game = await board().build();
    await attackAndAssign(game);
    await game.p1.yes();
    await game.p1.pick("reserve");
    await game.settle();
    expect(game.state("reserve").isBuffed).toBe(true);
    expect(game.state("sett").isBuffed).toBe(false);
  });

  test("declining the Legend: Sett dies with the Ally, so he is not there for the Helm to buff", async () => {
    const game = await board().build();
    await attackAndAssign(game);
    // Both dying units are buffed, so the Legend is offered once for each; decline both.
    for (let i = 0; i < 4 && game.decision()?.kind === "yes-no"; i++) {
      await game.p1.no();
    }
    await game.settle();
    expect(game.zoneOf("sett")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.state("boss").isExhausted).toBe(false); // cost never paid
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.state("reserve").isBuffed).toBe(true); // the only friendly unit left to buff
  });
});
