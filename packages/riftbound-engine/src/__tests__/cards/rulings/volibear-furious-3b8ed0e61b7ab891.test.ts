/**
 * Ruling 3b8ed0e61b7ab891 — Volibear, Furious (OGN-041 → ogn-041-298) · 9 Might ·
 *   "[Deflect 2] / When I attack, deal 5 damage split among any number of enemy units here."
 *
 * Q: Is the 5 damage on top of Volibear's Might? And does it happen first?
 * A: Yes to both. The 5 is dealt by an EFFECT, entirely separate from his Might and from combat damage,
 *    and the trigger's chain item resolves before the Combat Damage Step. A unit it damages but does not
 *    kill still contributes its full Might to combat — it is just easier to finish off. Recipients are
 *    named when the trigger is finalized; the amounts are divided on resolution, and the opponent gets
 *    priority in between.
 * Rules: 383.4.e ("When I attack" is an attack trigger, finalized onto the Initial Chain), 355.14
 *        (split damage: recipients at finalization, amounts at resolution), 465 (Combat Damage Step comes
 *        after the chain empties), 715 (damage from an effect is not combat damage).
 */
import { describe, expect, test } from "bun:test";
import type { DistributeDecision, Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOLIBEAR_FURIOUS = "ogn-041-298";

/** P1's Volibear in base; P2 holds bf1 with a 5-Might Anchor and a 3-Might Scout. */
const board = () =>
  scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Anchor" }, "anchor")
    .unit(P2, "bf1", { might: 3, name: "Scout" }, "scout")
    .unit(P1, "base", VOLIBEAR_FURIOUS, "voli");

/** Volibear attacks; P1 names both defenders as recipients of the split. */
async function attack(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("voli", "bf1");
  const d = game.decision() as PickDecision;
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "voli" }, targeting: "split-targets" });
  expect((d.options.map((o) => o.card ?? o.key) as string[]).sort()).toEqual(["anchor", "scout"]);
  await game.p1.pick("anchor", "scout");
  return game;
}

describe("Ruling 3b8ed0e61b7ab891 — Volibear's 5 damage is an effect, dealt in addition to his Might and before combat damage", () => {
  test("the trigger is on the chain with its recipients locked, and the DEFENDER gets a priority window before any of it happens", async () => {
    const game = await attack();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "voli", triggered: true })]);
    expect(game.state("anchor").damage).toBe(0);
    expect(game.state("scout").damage).toBe(0);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("the 5 resolves BEFORE combat damage: 3 + 2 are marked while both defenders are still alive and Volibear is undamaged", async () => {
    const game = await attack();
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision() as DistributeDecision;
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 5 });
    await game.p1.distribute({ anchor: 3, scout: 2 });
    expect(game.chain()).toEqual([]);
    expect(game.state("anchor")).toMatchObject({ damage: 3, might: 5, zone: "battlefield-bf1" });
    expect(game.state("scout")).toMatchObject({ damage: 2, might: 3, zone: "battlefield-bf1" });
    expect(game.state("voli").damage).toBe(0); // no combat damage yet
    expect(game.state("voli").might).toBe(9); // and the 5 was never taken out of his Might
  });

  test("combat then happens on top: the damaged defenders still deal their FULL Might (5 + 3 = 8) and Volibear's 9 finishes them both", async () => {
    const game = await attack();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.distribute({ anchor: 3, scout: 2 });
    await game.settle();
    expect(game.zoneOf("anchor")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("voli")).toBe("battlefield-bf1"); // 8 combat damage on 9 Might — survives
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("proof that it precedes the damage step: all 5 into the 5-Might Anchor kills it on the chain, so Anchor never deals its combat damage", async () => {
    const game = await board().build();
    await game.p1.move("voli", "bf1");
    await game.p1.pick("anchor"); // "any number of enemy units here" — one recipient is a legal set
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    if (d?.kind === "distribute") {
      await game.p1.distribute({ anchor: 5 });
    }
    expect(game.zoneOf("anchor")).toBe("trash"); // dead before the Combat Damage Step
    expect(game.state("voli").damage).toBe(0);
    await game.settle();
    // Only the Scout's 3 ever reached him (and the Combat Cleanup heals it away, 466.1.a.1).
    expect(game.zoneOf("voli")).toBe("battlefield-bf1");
    expect(game.state("voli").damage).toBe(0);
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
