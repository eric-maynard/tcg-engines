/**
 * Ruling 05fd3c531b424283 — Ruined Rex (UNL-067 → unl-067-219) · 6 Might · "[Deathknell] Deal 4 to an enemy unit. (When I die, get the effect.)"
 *
 * Q: If Ruined Rex dies, do I have to use the Deathknell or can I opt out?
 * A: You can't opt out. Deathknell is a triggered ability and Rex's text has no "may": when he dies it triggers automatically; if there is a legal
 *    target you MUST choose one and the 4 damage is dealt. With no legal target at all it triggers but simply does nothing.
 * Rules: 808.1 (Deathknell = "When I die, …"), 383 / 402.4.b (choices for a trigger are compulsory), 402.4 (no legal option → the pending
 *        item is removed, doing nothing).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUINED_REX = "unl-067-219";
/** P2's removal: a plain 1-cost "Kill a unit." spell. */
const EXECUTE = { abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }], cardType: "spell", domain: "order", energyCost: 1, name: "Execute", timing: "action" } as const;

/** P2's turn. P1's Rex sits in P1's base; P2 holds Execute + [1] and has `enemies` units (5 Might each) in its base. */
function board(enemies: number) {
  let b = scenario().active(P2).resources(P2, { energy: 1 }).unit(P1, "base", RUINED_REX, "rex").hand(P2, EXECUTE, "execute");
  for (let i = 0; i < enemies; i++) {
    b = b.unit(P2, "base", { might: 5, name: `Target ${i}` }, `t${i}`);
  }
  return b;
}

/** P2 Executes Rex; both pass so it resolves and Rex dies. Returns every prompt seen afterwards up to (not including) the next priority window. */
async function killRex(game: Game): Promise<Decision[]> {
  await game.p2.cast("execute", { targets: "rex" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("rex")).toBe("trash");
  const prompts: Decision[] = [];
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (!d || d.kind === "action") {
      break;
    }
    prompts.push(d);
    if (d.kind === "pick") {
      await game.seat(d.seat).pick(d.options[0]!.key);
    } else {
      break; // a yes/no here would be the "opt out" the ruling denies — leave it for the assertions
    }
  }
  return prompts;
}

describe("Ruling 05fd3c531b424283 — Ruined Rex's Deathknell is compulsory", () => {
  test("two enemy units: Rex dies → the Deathknell is on the chain for P1 with NO yes/no; P1 gets a FORCED target pick (min 1, no decline) between the enemy units, and the pick takes 4", async () => {
    const game = await board(2).build();
    const prompts = await killRex(game);
    expect(prompts.some((p) => p.kind === "yes-no")).toBe(false);
    const pick = prompts.find((p) => p.kind === "pick");
    expect(pick).toMatchObject({ allowDecline: false, kind: "pick", min: 1, seat: P1, source: { cardId: "rex" } });
    expect(pick?.kind === "pick" ? pick.options.map((o) => o.card).sort() : []).toEqual(["t0", "t1"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rex", controller: P1, targets: ["t0"], triggered: true })]);
    await game.settle();
    expect(game.state("t0").damage).toBe(4);
    expect(game.state("t1").damage).toBe(0);
  });

  test("exactly one enemy unit: nothing is even asked — the lone legal target is bound automatically and takes the 4; there is no way to decline", async () => {
    const game = await board(1).build();
    const prompts = await killRex(game);
    expect(prompts).toEqual([]); // no yes/no, no pick
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rex", controller: P1, targets: ["t0"], triggered: true })]);
    // P1 cannot make it go away: passing just resolves it.
    await game.settle();
    expect(game.state("t0").damage).toBe(4);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("a lethal case shows it is not optional even when it matters: a lone 4-Might enemy unit simply dies to the Deathknell", async () => {
    const game = await scenario().active(P2).resources(P2, { energy: 1 }).unit(P1, "base", RUINED_REX, "rex").hand(P2, EXECUTE, "execute").unit(P2, "base", { might: 4, name: "Fragile" }, "fragile").build();
    await killRex(game);
    await game.settle();
    expect(game.zoneOf("fragile")).toBe("trash");
  });

  test("no enemy unit anywhere: it still triggers but has nothing to choose — no prompt, no finalized chain item, nothing happens (402.4)", async () => {
    const game = await board(0).build();
    const prompts = await killRex(game);
    expect(prompts).toEqual([]);
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.trash()).toContain("rex");
  });
});
