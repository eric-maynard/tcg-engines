/**
 * Ruling a408bcf313775419 — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield
 *     "When you defend here, you may move a friendly unit here to base."
 *   × Volibear, Furious (OGN-041 → ogn-041-298) · 9 Might · "[Deflect 2] When I attack, deal 5 damage split among any number
 *     of enemy units here."
 *
 * Q: Volibear attacks a unit at Reaver's Row and the defender uses the Row to retreat it — does Volibear's 5 damage still hit it?
 * A: No. Volibear's attack trigger goes on the chain first (recipients chosen at finalization), the Row's defend trigger on top;
 *    the Row resolves first and moves the unit to base; when Volibear's item resolves that unit is no longer "here" ⇒ no damage.
 *    Nuance: had Volibear named several recipients, the remaining valid ones still take the (whole) split.
 * Rules: 464.2 (initial combat chain: attacker's triggers first), 340 (LIFO), 355.14.b/e (split: targets at finalization,
 *        amounts at resolution), 359.3.e.5 (target no longer legal ⇒ skipped), 355.14.h.
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const VOLIBEAR_FURIOUS = "ogn-041-298";

/** P1's turn. P2 holds the LIVE Reaver's Row with Target (3) and Other (2). P1's Volibear (9) ready in base. */
function board() {
  return scenario()
    .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false, owner: P2 })
    .unit(P2, "row", { might: 3, name: "Target" }, "target")
    .unit(P2, "row", { might: 2, name: "Other" }, "other")
    .unit(P1, "base", VOLIBEAR_FURIOUS, "voli");
}

const pickOptions = (game: Game) => {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
};

/** Volibear attacks; P1 names `recipients` for the split; P2 accepts the Row and retreats Target. Chain = [voli, row]. */
async function attackAndRetreat(recipients: string[]): Promise<Game> {
  const game = await board().build();
  await game.p1.move("voli", "row");
  // Volibear's item is finalized first — the attacker names the split's recipient SET now (355.14.b).
  const d = game.decision() as PickDecision;
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "voli" }, targeting: "split-targets", timing: "FIN" });
  expect(pickOptions(game)).toEqual(["other", "target"]);
  await game.p1.pick(...recipients);
  // Then the Row's defend trigger: P2 opts in and names the unit to retreat.
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "row" }, timing: "FIN" });
  await game.p2.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "row" }, timing: "FIN" });
  expect(pickOptions(game)).toEqual(["other", "target"]);
  await game.p2.pick("target");
  expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([
    ["voli", P1],
    ["row", P2],
  ]);
  expect(game.chain()[0]?.targets?.slice().sort()).toEqual([...recipients].sort());
  expect(game.chain()[1]?.targets).toEqual(["target"]);
  return game;
}

describe("Ruling a408bcf313775419 — Volibear's split whiffs on a unit Reaver's Row retreats before it resolves", () => {
  test("designations exist once the showdown opens: Volibear is the attacker, the Row's units are defenders", async () => {
    const game = await board().build();
    expect(game.state("voli").combatRole).toBeNull();
    await game.p1.move("voli", "row");
    expect(game.state("voli").combatRole).toBe("attacker");
    expect(game.state("target").combatRole).toBe("defender");
  });

  test("chain order: Volibear's attack trigger (targets locked to Target) is added first, the Row's defend trigger sits on top", async () => {
    const game = await attackAndRetreat(["target"]);
    expect(game.state("target")).toMatchObject({ damage: 0, zone: "battlefield-row" }); // nothing resolved yet
  });

  test("both pass → the Row resolves FIRST and moves Target to base; Volibear's item still waits, still naming Target", async () => {
    const game = await attackAndRetreat(["target"]);
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.locationOf("target")).toBe("base");
    expect(game.chain().map((c) => [c.cardId, c.targets])).toEqual([["voli", ["target"]]]);
  });

  test("then Volibear's trigger resolves: Target is no longer 'here' ⇒ not a valid recipient ⇒ takes NO damage (no amount prompt, Other untouched)", async () => {
    const game = await attackAndRetreat(["target"]);
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).not.toBe("distribute");
    expect(game.state("target")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("other")).toMatchObject({ damage: 0, zone: "battlefield-row" });
    expect(game.violations()).toEqual([]);
  });

  test("nuance: naming BOTH units as recipients — after Target retreats, the remaining valid recipient (Other) still takes the split and dies", async () => {
    const game = await attackAndRetreat(["target", "other"]);
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "distribute") {
        break;
      }
      await game.acting().passPriority();
    }
    const d = game.decision();
    if (d?.kind === "distribute") {
      expect(d.seat).toBe(P1);
      expect(d.buckets.map((b) => b.card ?? b.key)).toEqual(["other"]); // Target dropped out
      await game.p1.distribute({ other: 5 });
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("target")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.zoneOf("other")).toBe("trash");
  });

  test("control: without the Row retreat, Target takes all 5 and dies", async () => {
    const game = await board().build();
    await game.p1.move("voli", "row");
    await game.p1.pick("target");
    await game.p2.no();
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "distribute") {
        await game.p1.distribute({ target: 5 });
        continue;
      }
      await game.acting().passPriority();
    }
    if (game.decision()?.kind === "distribute") {
      await game.p1.distribute({ target: 5 });
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("target")).toBe("trash");
  });
});
