/**
 * Ruling 402031de6b634c8c — Yasuo, Remorseful (ogn-076-298) × Reaver's Row (ogn-285-298)
 *   Yasuo: 6 Might, "When I attack, deal damage equal to my Might to an enemy unit here."
 *   Reaver's Row (battlefield): "When you defend here, you may move a friendly unit here to base."
 *
 * Q: Yasuo attacks Reaver's Row and aims his trigger at a unit there; the defender uses the Row to retreat that unit.
 *    Does it still take Yasuo's damage?
 * A: No damage. In the initial chain the defender's trigger (Row retreat) resolves before the attacker's; the unit leaves,
 *    and when Yasuo's ability resolves the target is no longer "here", so it resolves with no effect (it does resolve — it
 *    just does nothing).
 * Rules: 464 (initial combat chain; defender's triggers added after attacker's → resolve first, LIFO), 355.11 (target must
 *        still satisfy "here" on resolution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";
const REAVERS_ROW = "ogn-285-298";

function board() {
  return scenario()
    .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false })
    .unit(P2, "row", { might: 3, name: "Runner" }, "runner")
    .unit(P2, "row", { might: 2, name: "Anchor" }, "anchor")
    .unit(P1, "base", YASUO, "yasuo");
}

describe("Ruling 402031de6b634c8c — Reaver's Row retreat resolves before Yasuo's attack trigger; the retreated target takes no damage", () => {
  test("initial chain = [Yasuo's attack trigger, Row's defend trigger]; P1 targets Runner, P2 retreats Runner; Row resolves first, then Yasuo's trigger resolves for 0 damage to a Runner now in base", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "row");

    // Both triggers are pending: attacker's first (bottom), defender's on top.
    expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([
      ["yasuo", P1],
      ["row", P2],
    ]);
    // Yasuo's trigger CHOOSES its enemy unit "here" now — P1 picks the Runner.
    let d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target" });
    expect(d?.source?.cardId).toBe("yasuo");
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).toSorted() : []).toEqual(["anchor", "runner"]);
    await game.p1.pick("runner");
    // Reaver's Row: P2 (the defender) may retreat a friendly unit here — P2 opts in and picks the same Runner.
    d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P2 });
    expect(d?.source?.cardId).toBe("row");
    await game.p2.yes();
    d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    await game.p2.pick("runner");
    expect(game.chain().map((c) => [c.cardId, c.targets])).toEqual([
      ["yasuo", ["runner"]],
      ["row", ["runner"]],
    ]);

    // Resolve the top item only (both pass once each): the Row's retreat.
    for (let i = 0; i < 2; i++) {
      const cur = game.decision();
      expect(cur).toMatchObject({ context: "chain", kind: "action" });
      await game.seat(cur!.seat).passPriority();
    }
    expect(game.zoneOf("runner")).toBe("base");
    // Yasuo's trigger is STILL on the chain (it did not fizzle away early) with its locked target.
    expect(game.chain().map((c) => [c.cardId, c.targets])).toEqual([["yasuo", ["runner"]]]);

    // Now it resolves — and does nothing: Runner is not "here" any more.
    for (let i = 0; i < 2; i++) {
      const cur = game.decision();
      expect(cur).toMatchObject({ context: "chain", kind: "action" });
      await game.seat(cur!.seat).passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("runner")).toBe("base");
    expect(game.state("runner").damage).toBe(0);
    expect(game.state("anchor").damage).toBe(0); // the damage did not retarget to the other unit here
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });

    // Combat proceeds normally afterwards: Yasuo (6) kills the Anchor (2) and conquers.
    await game.settle();
    expect(game.zoneOf("anchor")).toBe("trash");
    expect(game.zoneOf("runner")).toBe("base");
    expect(game.locationOf("yasuo")).toBe("row");
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("control: if P2 declines the Row (Runner stays 'here'), Yasuo's trigger deals 6 and kills the 3-Might Runner before combat damage", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "row");
    await game.p1.pick("runner");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.no();
    for (let i = 0; i < 6; i++) {
      const cur = game.decision();
      if (cur?.kind !== "action" || cur.context !== "chain") {
        break;
      }
      await game.seat(cur.seat).passPriority();
    }
    expect(game.zoneOf("runner")).toBe("trash");
    expect(game.zoneOf("anchor")).toBe("battlefield-row"); // untouched until combat damage
  });
});
