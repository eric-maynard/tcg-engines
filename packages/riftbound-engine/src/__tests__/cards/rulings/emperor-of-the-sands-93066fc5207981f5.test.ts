/**
 * Ruling 93066fc5207981f5 — Emperor of the Sands (SFD-197 → sfd-197-221, Azir legend)
 *     "Your Sand Soldiers have [Weaponmaster]. [1], [Exhaust]: Play a 2 [Might] Sand Soldier unit token to your base. Use only if
 *      you've played an Equipment this turn."
 *   × Ravenbloom Prefect (VEN-102 → ven-102-166) · 3 Might "When an opponent plays a gear, you may banish me to banish it."
 *   (Defy ogn-045-298 is only cited as the counter contrast; Brutalizer sfd-042-221 is the Equipment played.)
 *
 * Q: I play a gear and the opponent's Ravenbloom Prefect banishes it — can I still make a Sand Soldier with Azir?
 * A: Yes. The Prefect's trigger only fires after the gear has been fully played; banishing it afterwards does not undo that an
 *    Equipment was played this turn. Azir's "Use only if…" is a non-triggered look-back check that stays satisfied wherever the gear
 *    ended up. Activate it once the chain is empty and the state is Open.
 * Rules: 419.4.a (play-triggers fire after the play completes), 419.4.b (non-triggered checks reference Finalization), 427 (banish).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EMPEROR_OF_THE_SANDS = "sfd-197-221";
const RAVENBLOOM_PREFECT = "ven-102-166";
const BRUTALIZER = "sfd-042-221";

/** P1's turn with exactly [3] (Brutalizer [2] + Azir [1]). Azir legend ready. P2's Ravenbloom Prefect in base. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 3 })
    .legend(P1, EMPEROR_OF_THE_SANDS, "azir")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "base", RAVENBLOOM_PREFECT, "prefect")
    .hand(P1, BRUTALIZER, "brut");
}

/** P1 plays Brutalizer; P2 accepts the Prefect's "banish me to banish it"; the trigger resolves. */
async function gearPlayedAndBanished(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.can("activateAbility:azir#1")).toBe(false); // no Equipment played yet this turn
  await game.p1.play("brut");
  expect(game.p1.energy()).toBe(1);
  // 419.4.a — the gear is already ON THE BOARD (fully played) when the Prefect's trigger asks P2.
  expect(game.zoneOf("brut")).toBe("base");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "prefect" } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "prefect", controller: P2, triggered: true })]);
  await game.p2.yes();
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("prefect")).toBe("banishment");
  expect(game.zoneOf("brut")).toBe("banishment");
  return game;
}

describe("Ruling 93066fc5207981f5 — a played-then-banished Equipment still unlocks Azir's Sand Soldier", () => {
  test("premise: before any Equipment is played this turn, Azir's ability is not usable", async () => {
    const game = await board().build();
    expect(game.p1.legal().map((o) => o.key)).not.toContain("activateAbility:azir#1");
    const r = await game.p1.try((p) => p.activate("azir", 1));
    expect(r.ok).toBe(false);
  });

  test("Brutalizer is fully played (on the board) BEFORE the Prefect's trigger resolves; P2 banishes the Prefect to banish it — both end in banishment", async () => {
    await gearPlayedAndBanished();
  });

  test("with the chain empty and the state Open again, 'you've played an Equipment this turn' is still true: Azir activates for [1] + exhaust and a 2-Might Sand Soldier token lands in P1's base", async () => {
    const game = await gearPlayedAndBanished();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activateAbility:azir#1")).toBe(true);
    const before = game.p1.base();
    await game.p1.activate("azir", 1);
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.state("azir").isExhausted).toBe(true);
    const fresh = game.p1.base().filter((id) => !before.includes(id));
    expect(fresh).toHaveLength(1);
    expect(game.state(fresh[0] as string)).toMatchObject({ isToken: true, might: 2, name: "Sand Soldier", zone: "base" });
    expect(game.state(fresh[0] as string).keywords).toContain("Weaponmaster");
    expect(game.zoneOf("brut")).toBe("banishment"); // where the gear ended up is irrelevant
    expect(game.violations()).toEqual([]);
  });
});
