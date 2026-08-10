/**
 * Ruling d3e6b73224699870 — Retreat (OGN-104 → ogn-104-298) · Reaction · [1] "Return a friendly unit to its owner's hand.
 *     Its owner channels 1 rune exhausted."
 *   × Super Mega Death Rocket! (OGN-252 → ogn-252-298) · Action-speed spell · [4][fury][chaos] "Deal 5 to a unit. …"
 *
 * Q: A targeted spell's target becomes invalid while it is on the chain (removed by Retreat) — does the spell fizzle,
 *    or does the caster choose a new target?
 * A: It whiffs: SMDR is played at the 5-Might unit; Retreat in reaction returns that unit; the chain resolves backwards
 *    and SMDR resolves with an invalid target and does nothing. It does NOT retarget (not even to the caster's own unit).
 * Rules: 340.1 (LIFO), 359.3.e.2 / 359.3.e.5 (a target that left the board is illegal ⇒ unaffected), 359.3.e.1 (the
 *        spell still resolves), no re-declaration of targets after finalization.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RETREAT = "ogn-104-298";
const SMDR = "ogn-252-298";

/** P1 (Jinx player)'s turn: SMDR + [4][fury][chaos]; a 3-Might unit of P1's own in base. P2: 5-Might Bruiser at bf1, Retreat + [1]. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 1, fury: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Bruiser" }, "bruiser")
    .unit(P1, "base", { might: 3, name: "Jinx Pal" }, "pal")
    .hand(P1, SMDR, "rocket")
    .hand(P2, RETREAT, "retreat");
}

async function rocketThenRetreat(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("rocket", { targets: "bruiser" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rocket", controller: P1, targets: ["bruiser"] })]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  expect(game.p2.can("cast", "retreat")).toBe(true);
  await game.p2.cast("retreat", { targets: "bruiser" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["rocket", "retreat"]);
  return game;
}

describe("Ruling d3e6b73224699870 — SMDR's target Retreated in response: the Rocket resolves and does nothing, no retarget", () => {
  test("control: unanswered, SMDR deals 5 to the 5-Might Bruiser and kills it", async () => {
    const game = await board().build();
    await game.p1.cast("rocket", { targets: "bruiser" });
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.zoneOf("rocket")).toBe("trash");
  });

  test("Retreat resolves first (LIFO): the Bruiser returns to P2's hand and P2 channels 1 rune exhausted, SMDR still waiting on the chain naming it", async () => {
    const game = await rocketThenRetreat();
    const p2Runes = game.p2.runes().length;
    await game.p2.passPriority();
    await game.p1.passPriority(); // Retreat resolves
    expect(game.zoneOf("bruiser")).toBe("hand");
    expect(game.p2.runes()).toHaveLength(p2Runes + 1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rocket", targets: ["bruiser"] })]);
  });

  test("SMDR then resolves with an invalid target: nobody is asked to pick a new target, P1's own Jinx Pal is untouched, the Rocket goes to trash having done nothing", async () => {
    const game = await rocketThenRetreat();
    const r = await game.settle();
    expect(r.reason).toBe("open"); // no retarget prompt stalled the settle
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("rocket")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("hand");
    expect(game.state("pal")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.p1.units()).toEqual(["pal"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
