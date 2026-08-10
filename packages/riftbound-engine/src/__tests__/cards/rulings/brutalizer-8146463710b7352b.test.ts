/**
 * Ruling 8146463710b7352b — Brutalizer (SFD-042 → sfd-042-221) · Equipment · +1 Might · [Equip] [calm]
 *     "If this was attached to me this turn, I have an additional +2 [Might]."
 *   × Grandmaster at Arms (SFD-193 → sfd-193-221, Jax legend) #1: "[Exhaust]: Attach an attached Equipment you
 *     control to a unit you control."
 *
 * Q: When I re-equip Brutalizer with Jax's legend ability from one unit to ANOTHER, does the new unit get the +2?
 * A: Yes. Detach: the first unit loses everything from Brutalizer. Attach: the new unit was "attached this turn",
 *    so it has +1 (bonus) +2 (effect) = +3. Note: this only works onto a DIFFERENT unit — attaching an Equipment
 *    to the unit it is already on has no effect (434.1.g), so the bonus can't be "refreshed" in place.
 * Rules: 434.1.f (attach to a new unit ⇒ detach first), 434.1.d/718.4 (bonus follows the attachment),
 *        435.1.e (detached ⇒ effect text inactive), 434.1.g (attach to current holder ⇒ no effect).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BRUTALIZER = "sfd-042-221";
const JAX = "sfd-193-221";

function board() {
  return scenario()
    .legend(P1, JAX, "jax")
    .resources(P1, { power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "First Holder" }, "first")
    .unit(P1, "base", { might: 4, name: "Second Holder" }, "second")
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .gear(P1, BRUTALIZER, "brut");
}

/**
 * Turn 2: Equip Brutalizer onto First ([calm]). Then pass two turns so it is P1's turn 4 and Brutalizer was NOT
 * attached this turn: First reads 2 + 1 = 3, Jax is ready.
 */
async function equippedOnAnEarlierTurn(): Promise<Game> {
  const game = await board().build();
  await game.p1.choose("equipCard", { params: { equipmentId: "brut", unitId: "first" } });
  await game.settle();
  expect(game.p1.power("calm")).toBe(0);
  expect(game.state("brut").attachedTo).toBe("first");
  expect(game.state("first").might).toBe(5); // 2 + 1 + 2 on the turn it was attached
  await game.advanceTurn();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.state("first")).toMatchObject({ attachments: ["brut"], might: 3 }); // the "this turn" +2 is gone
  expect(game.state("second").might).toBe(4);
  expect(game.state("jax").isReady).toBe(true);
  return game;
}

/** Activate Jax #1 (re-attach an attached Equipment), steering every prompt (all P1's) toward `wanted`. */
async function jaxMoveTo(game: Game, wanted: string[]): Promise<void> {
  const hasTargets = game.p1.option("activateAbility:jax#1")?.fields.some((f) => f.arg === "targets");
  await game.p1.activate("jax", 1, hasTargets ? { targets: wanted } : { answers: wanted });
  for (let i = 0; i < 4; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d?.kind !== "pick") {
      return;
    }
    expect(d.seat).toBe(P1); // P1 chooses both the Equipment and the unit
    const hit = d.options.find((o) => wanted.includes(o.card ?? o.key));
    await game.p1.pick(hit ? hit.key : (d.options[0]?.key as string));
  }
}

describe("Ruling 8146463710b7352b — Jax moving Brutalizer to a different unit re-arms its 'attached this turn' +2", () => {
  test("Jax #1 moves Brutalizer First → Second: First immediately drops to its bare 2; Second was attached THIS turn ⇒ 4 + 1 + 2 = 7", async () => {
    const game = await equippedOnAnEarlierTurn();
    await jaxMoveTo(game, ["brut", "second"]);
    expect(game.state("jax").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.state("brut").attachedTo).toBe("second");
    expect(game.state("first")).toMatchObject({ attachments: [], might: 2 }); // lost the +1 AND any +2
    expect(game.state("second")).toMatchObject({ attachments: ["brut"], baseMight: 4, might: 7 });
    expect(game.violations()).toEqual([]);
  });

  test("the +3 on Second is +1 permanent / +2 'this turn': next time it is P1's turn Second reads 4 + 1 = 5", async () => {
    const game = await equippedOnAnEarlierTurn();
    await jaxMoveTo(game, ["brut", "second"]);
    expect(game.state("second").might).toBe(7);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("second")).toMatchObject({ attachments: ["brut"], might: 5 });
  });

  // BUG (434.1.g): re-attaching Brutalizer to the unit it is ALREADY on must have no effect at all — First
  // should stay at 2 + 1 = 3. The engine treats it as a fresh attach and re-arms the +2 (First reads 5).
  test.failing("BUG: ruling 8146463710b7352b — Jax 'moving' Brutalizer onto its current holder refreshes the +2 (engine: 5) instead of doing nothing (rules: stays 3)", async () => {
    const game = await equippedOnAnEarlierTurn();
    await jaxMoveTo(game, ["brut", "first"]);
    expect(game.state("brut").attachedTo).toBe("first");
    expect(game.state("first")).toMatchObject({ attachments: ["brut"], baseMight: 2, might: 3 });
  });
});
