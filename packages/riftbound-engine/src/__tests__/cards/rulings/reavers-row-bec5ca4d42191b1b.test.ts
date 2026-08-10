/**
 * Ruling bec5ca4d42191b1b — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield
 *     "When you defend here, you may move a friendly unit here to base."
 *   × Leona, Determined (ogn-238-298) · 4 Might · "[Shield] When I attack, stun an enemy unit here."
 *   × Radiant Dawn (ogn-261-298, Leona legend) · "When you stun one or more enemy units, buff a friendly unit." (the "buff")
 *
 * Q: Leona attacks a unit at Reaver's Row and that unit is retreated by the Row — does Leona still stun it (and get the buff)?
 * A: No. Leona's item is added to the chain first, the Row's on top; the Row's move resolves first; once the unit is in base
 *    it is no longer a valid "enemy unit here" for Leona, so no stun happens (and hence nothing that keys off a stun).
 * Rules: 464.2 (attacker's triggers first), 340 (LIFO), 355.7 / 402 (targets at finalization), 359.3.e.5 (illegal target ⇒ skipped).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const LEONA_DETERMINED = "ogn-238-298";
const RADIANT_DAWN = "ogn-261-298";

/** P1's turn, Radiant Dawn legend. P2 holds the live Row with Target (3) and Anchor (5). P1's Leona (4) ready in base. */
function board() {
  return scenario()
    .legend(P1, RADIANT_DAWN, "dawn")
    .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false, owner: P2 })
    .unit(P2, "row", { might: 3, name: "Target" }, "target")
    .unit(P2, "row", { might: 5, name: "Anchor" }, "anchor")
    .unit(P1, "base", LEONA_DETERMINED, "leona");
}

const pickOptions = (game: Game) => {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
};

/** Leona attacks; P1 aims the stun at Target; P2 accepts the Row and retreats Target. */
async function leonaAttacksTargetRetreats(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("leona", "row");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "leona" }, timing: "FIN" });
  expect(pickOptions(game)).toEqual(["anchor", "target"]);
  await game.p1.pick("target");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "row" }, timing: "FIN" });
  await game.p2.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "row" }, timing: "FIN" });
  await game.p2.pick("target");
  return game;
}

describe("Ruling bec5ca4d42191b1b — Leona's stun misses a unit Reaver's Row moved to base", () => {
  test("chain order: Leona's 'When I attack' item (P1, → Target) is added first; the Row's item (P2, → Target) sits on top", async () => {
    const game = await leonaAttacksTargetRetreats();
    expect(game.chain().map((c) => [c.cardId, c.controller, c.targets])).toEqual([
      ["leona", P1, ["target"]],
      ["row", P2, ["target"]],
    ]);
    expect(game.state("target")).toMatchObject({ isStunned: false, zone: "battlefield-row" });
  });

  test("the Row's move resolves FIRST: Target goes to base while Leona's item is still waiting", async () => {
    const game = await leonaAttacksTargetRetreats();
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.locationOf("target")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["leona"]);
    expect(game.state("target").isStunned).toBe(false);
  });

  test("then Leona's item resolves: Target is no longer at Leona's battlefield ⇒ NOT stunned; Anchor is not re-targeted; no stun ⇒ Radiant Dawn never buffs anyone", async () => {
    const game = await leonaAttacksTargetRetreats();
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("target")).toMatchObject({ isStunned: false, zone: "base" });
    expect(game.state("anchor")).toMatchObject({ isStunned: false, zone: "battlefield-row" });
    expect(game.state("leona").isBuffed).toBe(false);
    expect(game.decision()?.source?.cardId).not.toBe("dawn");
    expect(game.violations()).toEqual([]);
  });

  test("contrast: if P2 declines the Row, Target stays 'here' and IS stunned — and Radiant Dawn's buff trigger follows", async () => {
    const game = await board().build();
    await game.p1.move("leona", "row");
    await game.p1.pick("target");
    await game.p2.no();
    expect(game.chain().map((c) => c.cardId)).toEqual(["leona"]);
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "leona"); i++) {
      await game.acting().passPriority();
    }
    expect(game.state("target")).toMatchObject({ isStunned: true, zone: "battlefield-row" });
    // Radiant Dawn: "buff a friendly unit" — Leona is the only friendly unit, so the target is forced; drain to it.
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("leona");
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.acting().passPriority();
      } else {
        break;
      }
    }
    expect(game.state("leona").isBuffed).toBe(true);
  });
});
