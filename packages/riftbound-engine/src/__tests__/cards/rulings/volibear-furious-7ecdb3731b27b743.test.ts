/**
 * Ruling 7ecdb3731b27b743 — Volibear, Furious (OGN-041 → ogn-041-298) · 9 Might · "[Deflect 2] When I attack, deal 5
 *     damage split among any number of enemy units here."
 *   × a hidden unit at the defending battlefield (Teemo, Scout ogn-197-298 "[Hidden] When you play me, give me +3
 *     [Might] this turn"); Falling Comet ogn-085-298 is only cited in the answer's aside.
 *
 * Q: When Volibear's attack trigger goes on the chain, can the defender flip hidden units in response and have them
 *    become recipients of the 5 split damage?
 * A: No. The recipients are chosen as the trigger is put on the chain and are locked; the defender only gets priority
 *    afterwards (and may then play hidden cards), so a freshly revealed unit is never among the recipients.
 * Rules: 355.14 (split damage: recipients chosen at finalization, amounts on resolution), 811 (hidden plays need
 *        priority), 337/340 (priority order, LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { DistributeDecision, Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOLIBEAR_FURIOUS = "ogn-041-298";
const TEEMO_SCOUT = "ogn-197-298";

/** Turn 3, P1 active. P2 holds bf1 with a 5-Might Anchor and Teemo hidden there since an earlier turn. Volibear in P1's base. */
function board() {
  return scenario()
    .turn(3)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Anchor" }, "anchor")
    .facedown(P2, "bf1", TEEMO_SCOUT, "teemo")
    .unit(P1, "base", VOLIBEAR_FURIOUS, "voli");
}

/** Volibear attacks bf1; P1 locks the split recipients (only Anchor is offered) and passes priority to P2. */
async function attackAndLock(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("voli", "bf1");
  expect(game.state("voli").combatRole).toBe("attacker");
  const d = game.decision() as PickDecision;
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "voli" }, targeting: "split-targets" });
  expect(d.options.map((o) => o.card ?? o.key)).toEqual(["anchor"]); // the hidden card is not a unit "here"
  await game.p1.pick("anchor");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "voli", targets: ["anchor"], triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  return game;
}

describe("Ruling 7ecdb3731b27b743 — Volibear's split recipients are locked before the defender can flip hidden units", () => {
  test("sequence: recipients are chosen the moment the trigger hits the chain (P1's pick comes BEFORE any P2 window); only then does P2 get priority — and may now play the hidden Teemo", async () => {
    const game = await attackAndLock();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "teemo")).toBe(true);
    await game.p2.reveal("teemo");
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.state("teemo").isHidden).toBe(false);
    // Volibear's item is unchanged: still exactly [anchor].
    expect(game.chain()[0]).toMatchObject({ cardId: "voli", targets: ["anchor"] });
  });

  test("when Volibear's trigger resolves the amounts are distributed among the LOCKED recipients only — Teemo (now a 4-Might defender here) is not a bucket and takes 0; all 5 go to Anchor, which dies", async () => {
    const game = await attackAndLock();
    await game.p2.reveal("teemo");
    // Teemo's own +3 trigger sits above Volibear's; resolve it first.
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("teemo")).toMatchObject({ might: 4, zone: "battlefield-bf1" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["voli"]);
    // Now Volibear's split: if the engine asks for amounts, only Anchor is offered.
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    if (d?.kind === "distribute") {
      const dist = d as DistributeDecision;
      expect(dist.seat).toBe(P1);
      expect(dist.total).toBe(5);
      expect(dist.buckets.map((b) => b.card ?? b.key)).toEqual(["anchor"]);
      await game.p1.distribute({ anchor: 5 });
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("anchor")).toBe("trash");
    expect(game.state("teemo")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    // Combat continues: Teemo is the remaining defender.
    expect(game.state("teemo").combatRole).toBe("defender");
    expect(game.violations()).toEqual([]);
  });

  test("control: had Teemo NOT been flipped, the outcome for Anchor is identical (5 → dies) — the flip changed nothing about the split", async () => {
    const game = await attackAndLock();
    await game.p2.passPriority();
    const d = game.decision();
    if (d?.kind === "distribute") {
      await game.p1.distribute({ anchor: 5 });
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("anchor")).toBe("trash");
    expect(game.state("teemo")).toMatchObject({ isHidden: true, zone: "facedown-bf1" });
  });
});
