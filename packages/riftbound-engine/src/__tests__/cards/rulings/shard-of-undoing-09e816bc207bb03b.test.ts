/**
 * Ruling 09e816bc207bb03b — Shard of Undoing (UNL-174 → unl-174-219) · Gear · [6]
 *   "The first time a friendly unit dies during your Beginning Phase each turn, each opponent must kill one of their units."
 *
 * Q: With three Shards of Undoing and three [Temporary] units that die (simultaneously, at the start of my Beginning Phase),
 *    does the opponent have to kill three units?
 * A: Yes. The three deaths are one simultaneous event; for a "the first time" trigger met several times at once the ability
 *    triggers only ONCE (its controller picks the instance) — but each Shard is its own ability, so each of the three Shards
 *    triggers exactly once ⇒ three triggers on the chain ⇒ the opponent kills three of their units (one per resolution).
 * Rules: 383.1.b ("the Nth time" met simultaneously ⇒ triggers once), 816 (Temporary kills at the start of the Beginning
 *        Phase), 315 (Beginning Phase).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHARD = "unl-174-219";
const TEMPORARY = { grantedKeywords: [{ duration: "permanent" as const, keyword: "Temporary" }] };

type PickD = Extract<Decision, { kind: "pick" }>;

/** P2's turn, about to end. P1: `shards` Shards of Undoing and three Temporary 1-Might units in base. P2: four 2-Might units. */
function board(shards: number) {
  let s = scenario()
    .turn(2)
    .active(P2)
    .unit(P1, "base", { might: 1, name: "Temp A" }, "tA", TEMPORARY)
    .unit(P1, "base", { might: 1, name: "Temp B" }, "tB", TEMPORARY)
    .unit(P1, "base", { might: 1, name: "Temp C" }, "tC", TEMPORARY)
    .unit(P2, "base", { might: 2, name: "E1" }, "e1")
    .unit(P2, "base", { might: 2, name: "E2" }, "e2")
    .unit(P2, "base", { might: 2, name: "E3" }, "e3")
    .unit(P2, "base", { might: 2, name: "E4" }, "e4");
  for (let i = 0; i < shards; i++) {
    s = s.gear(P1, SHARD, `shard${i + 1}`);
  }
  return s;
}

/** P2 ends the turn; pass priority (taking any soft order offer) until the three Temporary units are dead. */
async function temporaryUnitsDie(game: Game): Promise<void> {
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  expect(game.chain().map((c) => c.cardId).toSorted()).toEqual(["tA", "tB", "tC"]); // the Temporary kill triggers
  for (let i = 0; i < 8 && game.p1.trash().length < 3; i++) {
    const d = game.decision();
    if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (d?.kind === "action") {
      await game.acting().pass();
    } else {
      break;
    }
  }
  expect(game.p1.trash().toSorted()).toEqual(["tA", "tB", "tC"]); // all three died at once
}

/** Drive the rest of the Beginning Phase, recording every "kill one of your units" prompt P2 must answer. */
async function playOut(game: Game): Promise<string[][]> {
  const p2Prompts: string[][] = [];
  for (let i = 0; i < 40 && game.phase() !== "main"; i++) {
    const d = game.decision();
    if (!d) break;
    if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick") {
      expect(d.seat).toBe(P2); // the OPPONENT chooses which of their units dies
      const offered = (d as PickD).options.map((o) => (o.card ?? o.key) as string);
      p2Prompts.push(offered);
      await game.p2.pick(offered[0]!);
    } else {
      break;
    }
  }
  return p2Prompts;
}

describe("Ruling 09e816bc207bb03b — three Shards × three simultaneous Temporary deaths ⇒ three triggers ⇒ opponent kills three units", () => {
  test("the three Temporary deaths are ONE simultaneous event, after which exactly THREE Shard triggers are on the chain — one per Shard, each triggering only once for the simultaneous 'first time' (383.1.b)", async () => {
    const game = await board(3).build();
    await temporaryUnitsDie(game);
    const shardItems = game.chain().filter((c) => c.triggered && c.cardId.startsWith("shard"));
    expect(shardItems.map((c) => c.cardId).toSorted()).toEqual(["shard1", "shard2", "shard3"]);
    expect(shardItems.every((c) => c.controller === P1)).toBe(true);
    expect(game.p2.units()).toHaveLength(4); // nothing killed yet
  });

  test("each trigger resolves separately and P2 must kill one of THEIR units each time (P2 picks which): three prompts to P2, three of P2's four units end in the trash", async () => {
    const game = await board(3).build();
    await temporaryUnitsDie(game);
    const prompts = await playOut(game);
    expect(prompts).toHaveLength(3);
    expect(prompts[0]!.toSorted()).toEqual(["e1", "e2", "e3", "e4"]);
    expect(prompts[1]).toHaveLength(3);
    expect(prompts[2]).toHaveLength(2);
    expect(game.p2.units()).toHaveLength(1);
    expect(game.p2.trash()).toHaveLength(3);
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("reference — ONE Shard with the same three simultaneous deaths triggers exactly once (not three times): P2 kills one unit", async () => {
    const game = await board(1).build();
    await temporaryUnitsDie(game);
    expect(game.chain().filter((c) => c.triggered && c.cardId === "shard1")).toHaveLength(1);
    const prompts = await playOut(game);
    expect(prompts).toHaveLength(1);
    expect(game.p2.units()).toHaveLength(3);
    expect(game.p2.trash()).toHaveLength(1);
  });
});
