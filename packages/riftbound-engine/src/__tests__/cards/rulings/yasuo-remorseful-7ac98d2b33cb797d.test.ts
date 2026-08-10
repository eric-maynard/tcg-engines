/**
 * Ruling 7ac98d2b33cb797d — Yasuo, Remorseful (OGN-076 → ogn-076-298) · 6 Might · "When I attack, deal damage equal to my Might to an
 *     enemy unit here."
 *   × Reaver's Row (OGN-285 → ogn-285-298, Battlefield) "When you defend here, you may move a friendly unit here to base."
 *
 * Q: When Yasuo's attack trigger and a defender trigger (Reaver's Row) both trigger, must Yasuo choose his target BEFORE the defender
 *    chooses which unit to retreat?
 * A: Yes. Attacker triggers go on the chain first with all their choices (targets) finalized; only then are the defender's triggers
 *    added and their choices made. The chain then resolves in reverse: defender's ability first, attacker's second.
 * Rules: 464 / 383.4.e–f (initial combat chain: attacker triggers, then defender triggers), 355.7 (targets chosen at finalization),
 *        383 (LIFO resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";
const REAVERS_ROW = "ogn-285-298";

/** P1's turn. P2 holds Reaver's Row (live text) with Runner (3) and Anchor (2); P1's Yasuo (6) attacks from base. */
function board() {
  return scenario()
    .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false })
    .unit(P2, "row", { might: 3, name: "Runner" }, "runner")
    .unit(P2, "row", { might: 2, name: "Anchor" }, "anchor")
    .unit(P1, "base", YASUO, "yasuo");
}

async function yasuoAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("yasuo", "row");
  return game;
}

describe("Ruling 7ac98d2b33cb797d — the attacker (Yasuo) locks his target before the defender (Reaver's Row) makes any choice", () => {
  test("first decision after the attack is P1's TARGET pick for Yasuo's trigger (both enemy units here offered) — P2 has not been asked anything yet", async () => {
    const game = await yasuoAttacks();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "yasuo" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["anchor", "runner"]);
    expect(game.actingSeat()).toBe(P1);
    // The Row's item may already be listed as pending, but it has no target and P2 has made no choice.
    const row = game.chain().find((c) => c.cardId === "row");
    expect(row?.targets ?? []).toEqual([]);
  });

  test("only AFTER P1 finalizes (picks Runner) is the defender asked: P2 gets the Row's opt-in, then its target pick — and can see Yasuo's locked target on the chain while choosing", async () => {
    const game = await yasuoAttacks();
    await game.p1.pick("runner");
    expect(game.chain().find((c) => c.cardId === "yasuo")).toMatchObject({ controller: P1, targets: ["runner"], triggered: true });
    let d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "row" } });
    await game.p2.yes();
    d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "row" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["anchor", "runner"]);
    // Yasuo's choice is public information at this point — P2 retreats exactly the unit Yasuo aimed at.
    expect(game.view(P2).chain.find((c) => c.cardId === "yasuo")?.targets).toEqual(["runner"]);
    await game.p2.pick("runner");
    expect(game.chain().map((c) => [c.cardId, c.controller, c.targets])).toEqual([
      ["yasuo", P1, ["runner"]],
      ["row", P2, ["runner"]],
    ]);
  });

  test("resolution is reversed: the Row (defender, added second) resolves first and retreats Runner; Yasuo's trigger (added first) resolves second and finds its target gone — 0 damage, no re-target onto Anchor", async () => {
    const game = await yasuoAttacks();
    await game.p1.pick("runner");
    await game.p2.yes();
    await game.p2.pick("runner");
    for (let i = 0; i < 4 && game.chain().length > 1; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo"]);
    expect(game.zoneOf("runner")).toBe("base");
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("runner")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("anchor").damage).toBe(0);
    await game.settle();
    expect(game.zoneOf("anchor")).toBe("trash"); // ordinary combat: 6 into 2
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("P1 cannot wait to see the defender's choice: trying to answer the Row's prompt as P1, or to defer Yasuo's pick, is not possible — the only open decision is P1's target pick", async () => {
    const game = await yasuoAttacks();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "yasuo" } });
    expect((await game.p2.try((p) => p.yes())).ok).toBe(false); // P2 has nothing to answer yet
    expect((await game.p1.try((p) => p.passPriority())).ok).toBe(false); // P1 must choose now
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "yasuo" } });
  });
});
