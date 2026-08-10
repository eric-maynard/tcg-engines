/**
 * Ruling ef07303d88f473c9 — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield · "When you defend here, you may move a
 *   friendly unit here to base."
 *   × Ezreal, Dashing (SFD-082 → sfd-082-221) · 4 Might · "When I attack or defend, deal damage equal to my Might to an enemy
 *     unit here. I don't deal combat damage. …"
 *
 * Q: If I use Reaver's Row to move the unit Ezreal's attack trigger targeted, does the damage fizzle?
 * A: Yes, effectively. Both triggers go on the initial combat chain — attacker's (Ezreal) first, then defender's (the Row) —
 *    so the Row resolves FIRST and moves the target to base; when Ezreal's ability resolves its target is no longer "here",
 *    the choice is invalid (mistargeted) and no damage is dealt.
 * Rules: 464.2 (initial chain: attacker triggers then defender triggers), 340 (LIFO), 356.3.e.9 / 359.3.e (a target moved
 *        out of "here" is invalid ⇒ instruction not executed).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

type Pick = Extract<Decision, { kind: "pick" }>;

const REAVERS_ROW = "ogn-285-298";
const EZREAL_DASHING = "sfd-082-221";

/** P1's turn. P2 holds the live Reaver's Row with Victim (3) + Buddy (5). Ezreal (4) ready in P1's base. */
function board() {
  return scenario()
    .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false })
    .battlefield("bf2", { controller: null })
    .unit(P2, "row", { might: 3, name: "Victim" }, "victim")
    .unit(P2, "row", { might: 5, name: "Buddy" }, "buddy")
    .unit(P1, "base", EZREAL_DASHING, "ezreal");
}

/** Ezreal attacks the Row naming Victim; P2 opts into the Row and picks Victim to send home. Chain = [Ezreal, Row]. */
async function ezrealAttacksRowAnswers(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("ezreal", "row");
  // 1. Attacker's trigger is finalized first: P1 names Ezreal's target.
  const first = game.decision();
  expect(first).toMatchObject({ kind: "pick", seat: P1 });
  expect((first as Pick).options.map((o) => o.card ?? o.key).sort()).toEqual(["buddy", "victim"]);
  await game.p1.pick("victim");
  expect(game.state("ezreal").combatRole).toBe("attacker");
  // 2. Then the defender's: P2 is asked "you may" (yes/no) and which friendly unit here to move.
  const ask = game.decision();
  expect(ask).toMatchObject({ kind: "yes-no", seat: P2 });
  await game.p2.yes();
  const pick = game.decision();
  expect(pick).toMatchObject({ kind: "pick", seat: P2 });
  expect((pick as Pick).options.map((o) => o.card ?? o.key).sort()).toEqual(["buddy", "victim"]);
  await game.p2.pick("victim");
  expect(game.chain()).toEqual([
    expect.objectContaining({ cardId: "ezreal", controller: P1, targets: ["victim"], triggered: true }),
    expect.objectContaining({ cardId: "row", controller: P2, targets: ["victim"], triggered: true }),
  ]);
  return game;
}

describe("Ruling ef07303d88f473c9 — Reaver's Row yanks Ezreal's target home before his trigger resolves: no damage", () => {
  test("1–2. timing: Ezreal's 'When I attack' goes on the chain first, the Row's 'When you defend here' on top of it (attacker → defender)", async () => {
    await ezrealAttacksRowAnswers();
  });

  test("3. LIFO — the Row resolves first: Victim moves to P2's base while Ezreal's trigger (→ Victim) still waits", async () => {
    const game = await ezrealAttacksRowAnswers();
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ezreal", targets: ["victim"], triggered: true })]);
  });

  test("4. Ezreal's trigger then resolves with its target no longer 'here': NO damage to Victim, none redirected to Buddy, nothing re-chosen", async () => {
    const game = await ezrealAttacksRowAnswers();
    await game.acting().passPriority();
    await game.acting().passPriority(); // Row
    await game.acting().passPriority();
    await game.acting().passPriority(); // Ezreal's trigger
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).not.toBe("pick"); // no re-target
    expect(game.state("victim")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("buddy")).toMatchObject({ damage: 0, zone: "battlefield-row" });
    expect((game.gameState.damageLog ?? []).filter((r) => !r.combat)).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control — P2 declines the Row: Ezreal's trigger resolves normally and Victim (3) takes 4 and dies", async () => {
    const game = await board().build();
    await game.p1.move("ezreal", "row");
    await game.p1.pick("victim");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.no();
    expect(game.chain().map((c) => c.cardId)).toEqual(["ezreal"]);
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.state("buddy").damage).toBe(0);
  });
});
