/**
 * Ruling 28d7cc36fe72ac58 — Hidden Blade (OGN-213 → ogn-213-298) · Action [2][order] "Kill a unit at a battlefield. Its
 *     controller draws 2."
 *   × Qiyana, Victorious (OGN-155 → ogn-155-298) · 4 Might · "[Deflect] (Opponents must pay [rainbow] to choose me with a
 *     spell or ability.) …"
 *   × Defy (OGN-045 → ogn-045-298) · Reaction [1][calm] "Counter a spell that costs no more than [4] …"
 *
 * Q: Opponent Hidden-Blades my Qiyana (Deflect); I Defy it. Did the opponent still have to pay the Deflect cost?
 * A: Yes. Deflect is paid when Hidden Blade goes on the chain — before Defy can even be played — and it is not refunded
 *    when the spell is later countered.
 * Rules: 809 (Deflect = additional cost paid on choosing), 356/357 (costs paid during finalize), 425.1.c (no refund).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const QIYANA = "ogn-155-298";
const DEFY = "ogn-045-298";

/**
 * P2's turn (the "opponent"). P1's Qiyana holds bf1; P1 has Defy + [1][calm]. P2 has Hidden Blade with exactly
 * [2] + order + ONE rainbow (the Deflect surcharge).
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { order: 1, rainbow: 1 } })
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", QIYANA, "qiyana")
    .hand(P2, HIDDEN_BLADE, "blade")
    .hand(P1, DEFY, "defy");
}

async function bladeOnQiyana(): Promise<Game> {
  const game = await board().build();
  expect(game.state("qiyana").keywords).toContain("Deflect");
  await game.p2.cast("blade", { targets: "qiyana" });
  return game;
}

describe("Ruling 28d7cc36fe72ac58 — Deflect is paid as Hidden Blade hits the chain; Defy later doesn't undo it", () => {
  test("the moment Hidden Blade is on the chain, P2 has paid [2] + order AND the [rainbow] Deflect surcharge — before anyone could respond", async () => {
    const game = await bladeOnQiyana();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P2, targets: ["qiyana"] })]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0, rainbow: 0 } });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // Defy not yet possible
    expect(game.p1.can("cast", "defy")).toBe(false);
  });

  test("without the [rainbow] for Deflect, P2 cannot aim Hidden Blade at Qiyana at all", async () => {
    const game = await board().resources(P2, { energy: 2, power: { order: 1, rainbow: 0 } }).build();
    const r = await game.p2.try((p) => p.cast("blade", { targets: "qiyana" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("blade")).toBe("hand");
  });

  test("only AFTER that does P1 get priority and Defy the Blade: Blade countered (Qiyana lives, nobody draws 2) and P2's Deflect payment stays spent", async () => {
    const game = await bladeOnQiyana();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "defy")).toBe(true);
    const p1Hand = game.p1.hand().length;
    await game.p1.cast("defy", { targets: "blade" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "defy"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("qiyana")).toBe("battlefield-bf1");
    expect(game.state("qiyana").damage).toBe(0);
    expect(game.p1.hand()).toHaveLength(p1Hand - 1); // Defy left; no "draws 2"
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0, rainbow: 0 } }); // nothing refunded
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
