/**
 * Ruling fed031d098c53c74 — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield
 *   "When you defend here, you may move a friendly unit here to base."
 *   × Yasuo, Remorseful (ogn-076-298) · 6 Might — "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Leona, Determined (ogn-238-298) · 4 Might — "[Shield] When I attack, stun an enemy unit here."
 *   × Call to Glory (OGN-207 → ogn-207-298) · Reaction [3] — "… Give a unit +3 [Might] this turn." (the defender's alternative)
 *
 * Q: Yasuo/Leona attacks a player holding Reaver's Row with a buffed unit — how do the attack triggers and the Row's
 *    exit ability interleave?
 * A: Triggers go on the chain attacker first, then defender, so the Row's item is on TOP and resolves first. Targets are
 *    chosen in the order the items were added: Yasuo/Leona picks first, then the Row player. The Row moves its unit to
 *    base before the damage/stun resolves; that unit is no longer "here", so it takes no damage / is not stunned. The
 *    Row player may instead decline and React (e.g. Call to Glory) on that same chain.
 * Rules: 383.3.d / 464.2.d (initial chain: turn player's triggers first), 340 (LIFO), 355.7 (targets at finalization,
 *        in chain order), 359.3.e.5 (target no longer meets "here" ⇒ instruction not performed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const YASUO = "ogn-076-298";
const LEONA = "ogn-238-298";
const CALL_TO_GLORY = "ogn-207-298";

/** P2's turn. P1 holds Reaver's Row (live) with a BUFFED Big (3+1) and Small (2), Call to Glory + [3]. P2's attacker ready in base. */
function board(attacker: string) {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 3 })
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .battlefield("bf2", { controller: null })
    .unit(P1, "row", { might: 3, name: "Big" }, "big", { buffed: true })
    .unit(P1, "row", { might: 2, name: "Small" }, "small")
    .hand(P1, CALL_TO_GLORY, "glory")
    .unit(P2, "base", attacker, "atk");
}

const pickOptions = (game: Game) => {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
};

/** Attack; P2 aims its trigger at Big; P1 accepts the Row and also names Big. Chain = [atk (bottom), row (top)], P1 has priority. */
async function bothAimAtBig(attacker: string): Promise<Game> {
  const game = await board(attacker).build();
  await game.p2.move("atk", "row");
  // Both triggers are queued attacker-first; finalization asks in that order: the ATTACKER chooses first…
  expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([
    ["atk", P2],
    ["row", P1],
  ]);
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "atk" }, timing: "FIN" });
  expect(pickOptions(game)).toEqual(["big", "small"]);
  await game.p2.pick("big");
  // …then the Row player decides (opt-in, then which friendly unit here).
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" }, timing: "FIN" });
  await game.p1.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "row" }, timing: "FIN" });
  expect(pickOptions(game)).toEqual(["big", "small"]);
  await game.p1.pick("big");
  expect(game.chain().map((c) => [c.cardId, c.targets])).toEqual([
    ["atk", ["big"]],
    ["row", ["big"]],
  ]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling fed031d098c53c74 — Yasuo: the Row (defender, on top) exits Big before Yasuo's damage resolves", () => {
  test("chain order and target order: Yasuo's item is added first and targets first; the Row's item sits on top", async () => {
    await bothAimAtBig(YASUO);
  });

  test("resolution top-down: the Row moves Big to base FIRST; Yasuo's 6 damage then finds Big no longer 'here' — Big takes nothing and survives; Small untouched", async () => {
    const game = await bothAimAtBig(YASUO);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Row resolves
    expect(game.locationOf("big")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["atk"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Yasuo's trigger resolves — no legal "here" target left for it
    expect(game.chain()).toEqual([]);
    expect(game.state("big")).toMatchObject({ damage: 0, isBuffed: true, zone: "base" });
    expect(game.state("small")).toMatchObject({ damage: 0, zone: "battlefield-row" }); // never re-aimed
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});

describe("Ruling fed031d098c53c74 — Leona: same timing, so the exited unit is NOT stunned", () => {
  test("the Row bounces Big home before Leona's stun resolves; Big is not stunned (not 'here'), Small is not stunned either", async () => {
    const game = await bothAimAtBig(LEONA);
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("big")).toMatchObject({ isStunned: false, zone: "base" });
    expect(game.state("small")).toMatchObject({ isStunned: false, zone: "battlefield-row" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });
});

describe("Ruling fed031d098c53c74 — nuance: the Row player may decline the retreat and React on the same chain instead", () => {
  test("P1 says NO to the Row; with Yasuo's trigger still on the chain P1 holds priority and may cast Call to Glory (Reaction) on Big — it lands above the attack trigger", async () => {
    const game = await board(YASUO).build();
    await game.p2.move("atk", "row");
    await game.p2.pick("big");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" } });
    await game.p1.no();
    expect(game.chain().map((c) => c.cardId)).toEqual(["atk"]);
    // Priority window on the initial chain: P1 can react before Yasuo's damage resolves.
    for (let i = 0; i < 2 && game.decision()?.seat !== P1; i++) {
      await game.acting().passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "glory")).toBe(true);
    await game.p1.cast("glory", { targets: "big" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["atk", "glory"]);
    await game.acting().passPriority();
    await game.acting().passPriority(); // Call to Glory resolves first
    expect(game.state("big").might).toBe(7); // 3 + buff 1 + 3
    expect(game.locationOf("big")).toBe("row"); // it stayed to fight
  });
});
