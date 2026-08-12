/**
 * Ruling 953d558f714aca57 — The Boss (OGN-269 → ogn-269-298, the Sett legend)
 *     "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and spend its buff to heal it,
 *      exhaust it, and recall it instead."
 *   × Thousand-Tailed Watcher (OGN-116 → ogn-116-298) "When you play me, give enemy units -3 [Might] this turn,
 *      to a minimum of 1 [Might]."
 *
 * Q: Does Sett's recall heal away the Watcher's effect too?
 * A: No. Heal removes DAMAGE and nothing else; the recalled unit keeps every other effect on it, so the
 *    Watcher's -3 [Might] is still there (it wears off only at end of turn, like any "this turn" effect).
 * Rules: 159/162 (Heal removes damage), 190 (Recall = relocation to base), 317.2 (Expiration Step).
 */
import { describe, expect, test } from "bun:test";
import type { Game, InlineCardDef } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_BOSS = "ogn-269-298";
const WATCHER = "ogn-116-298";

/** Filler so the debuffed unit can be pushed to lethal without another printed card's text mattering. */
const BOLT4: InlineCardDef = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Filler Bolt 4",
  rulesText: "Deal 4 to a unit.",
  timing: "standard",
};

/**
 * P1's turn with the Watcher (7 + [mind]) and a filler bolt. P2 holds bf1 with a BUFFED 6-Might unit
 * (effective 7) and has The Boss ready plus a [body] rune's power for the [rainbow].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { mind: 1 } })
    .resources(P2, { energy: 0, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .legend(P2, THE_BOSS, "boss")
    .unit(P2, "bf1", { might: 6, name: "Sentry" }, "sentry", { buffed: true })
    .hand(P1, WATCHER, "watcher")
    .hand(P1, BOLT4, "bolt");
}

/** P1 plays the Watcher; its play trigger resolves and the Sentry drops to 4 effective Might. */
async function watcherDown(): Promise<Game> {
  const game = await board().build();
  expect(game.state("sentry").might).toBe(7); // 6 + buff
  await game.p1.play("watcher");
  await game.settle();
  expect(game.state("sentry")).toMatchObject({ mightModifier: -3, might: 4 });
  return game;
}

describe("Ruling 953d558f714aca57 — Sett's recall heals damage only; the Watcher's -3 [Might] rides along", () => {
  test("4 damage is lethal on the debuffed 4 Might, and The Boss offers its replacement to P2", async () => {
    const game = await watcherDown();
    await game.p1.cast("bolt", { targets: "sentry" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "boss" } });
  });

  test("after the save the unit is in base with NO damage — but still carries the Watcher's -3", async () => {
    const game = await watcherDown();
    await game.p1.cast("bolt", { targets: "sentry" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p2.yes();
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("base");
    expect(game.locationOf("sentry")).toBe("base");
    expect(game.state("sentry").damage).toBe(0); // heal did its one job
    expect(game.state("sentry").isBuffed).toBe(false); // the buff was the cost
    expect(game.state("sentry").mightModifier).toBe(-3); // the Watcher's effect is NOT healed away
    expect(game.state("sentry").might).toBe(3); // printed 6, no buff, -3
    expect(game.state("sentry").isExhausted).toBe(true);
  });

  test("the -3 goes away only where it always would — at the end of the turn", async () => {
    const game = await watcherDown();
    await game.p1.cast("bolt", { targets: "sentry" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p2.yes();
    await game.settle();
    expect(game.state("sentry").might).toBe(3);
    await game.advanceTurn();
    expect(game.state("sentry")).toMatchObject({ mightModifier: 0, might: 6 });
    expect(game.violations()).toEqual([]);
  });

  test("control check: with the buff spent and the -3 still on, a second 3-damage hit would be lethal again", async () => {
    const game = await watcherDown();
    await game.p1.cast("bolt", { targets: "sentry" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p2.yes();
    await game.settle();
    expect(game.state("sentry").might).toBe(3); // i.e. the debuff genuinely survived the recall
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p2.power("body")).toBe(0);
  });
});
