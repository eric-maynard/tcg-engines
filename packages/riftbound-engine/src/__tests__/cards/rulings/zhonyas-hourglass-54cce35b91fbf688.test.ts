/**
 * Ruling 54cce35b91fbf688 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2 · [Hidden]
 *   "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Machine Evangel (ogn-239-298) · 4 Might "[Deathknell] — Play three 1 [Might] Recruit unit tokens into your base."
 *   (+ Void Seeker ogn-024-298 "Deal 4 to a unit at a battlefield. Draw 1." as the lethal hit.)
 *
 * Q: Do Deathknells trigger when the unit is saved by Zhonya's Hourglass (or another replacement effect)?
 * A: No. Zhonya's replaces the "killed" event with a recall, so the unit is never sent to the trash — it did not die and
 *    its Deathknell does not occur.
 * Rules: 808.1.c/808.1.d/808.1.d.1 (Deathknell = "when I die" = killed AND sent to trash; replaced ⇒ no Deathknell),
 *        369.1/370 (replacement effects).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const MACHINE_EVANGEL = "ogn-239-298";
const VOID_SEEKER = "ogn-024-298";

/** P2's turn with Void Seeker paid. P1's Machine Evangel (4) holds bf1; optionally a face-up Zhonya's in P1's base. */
function board(withZhonyas: boolean) {
  const s = scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", MACHINE_EVANGEL, "evangel")
    .hand(P2, VOID_SEEKER, "vs");
  return withZhonyas ? s.gear(P1, ZHONYAS, "zh") : s;
}

const recruits = (game: Game) => game.findAll({ owner: P1 }).filter((id) => game.has(id) && game.state(id).isToken && game.zoneOf(id) === "base");

async function seekerHitsEvangel(withZhonyas: boolean): Promise<Game> {
  const game = await board(withZhonyas).build();
  await game.p2.cast("vs", { targets: "evangel" });
  await game.settle();
  expect(game.zoneOf("vs")).toBe("trash");
  return game;
}

describe("Ruling 54cce35b91fbf688 — a unit saved by Zhonya's did not die: no Deathknell", () => {
  test("control (no Zhonya's): 4 damage kills Machine Evangel → its Deathknell resolves and P1 gets three Recruit tokens in base", async () => {
    const game = await seekerHitsEvangel(false);
    expect(game.zoneOf("evangel")).toBe("trash");
    expect(recruits(game)).toHaveLength(3);
  });

  test("with Zhonya's: the death is REPLACED — Hourglass killed instead, Evangel healed/exhausted/recalled to base — and the Deathknell never triggers: no chain item for it, no Recruit tokens", async () => {
    const game = await board(true).build();
    await game.p2.cast("vs", { targets: "evangel" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Void Seeker resolves; the replacement applies in the Cleanup
    expect(game.chain().some((c) => c.cardId === "evangel")).toBe(false);
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("evangel")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.p1.trash()).not.toContain("evangel");
    expect(recruits(game)).toHaveLength(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
