/**
 * Ruling 3e8910b50e9acb69 — Piercing Light (SFD-023 → sfd-023-221) 2+[fury] "[Repeat] [2][fury] Deal 2 to a unit at a
 *   battlefield, then deal 2 to up to one other unit."
 *   × Wages of Pain (SFD-070 → sfd-070-221) [Hidden] [Action] "Deal 3 to a unit at a battlefield. Play a Gold gear token exhausted."
 *
 * Q: Opponent Piercing Lights my unit; can I respond with (hidden) Wages of Pain to kill that first target before Piercing
 *    Light resolves — and does Piercing Light then still deal its second 2 to the other unit?
 * A: Yes and yes. Both targets are locked when Piercing Light is played; Wages of Pain resolves first and kills the first
 *    target; Piercing Light then resolves: the first instance has no valid target, the second still deals 2 to the other unit.
 * Rules: 355.5 (choices locked on the chain), 338 (LIFO), 359.3.e.5 / e.8 (only instructions tied to the illegal target
 *        are skipped), 811 (Wages of Pain from facedown: target at that battlefield, cost 0).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PIERCING_LIGHT = "sfd-023-221";
const WAGES_OF_PAIN = "sfd-070-221";

/**
 * P1's turn 2. P2 holds bf1 with First (3 Might) and Other (4 Might), and has Wages of Pain hidden there since an earlier
 * turn. P1: Piercing Light + exactly 2+[fury] (no Repeat). P2 has no resources (the hidden play costs 0).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "First" }, "first")
    .unit(P2, "bf1", { might: 4, name: "Other" }, "other")
    .facedown(P2, "bf1", WAGES_OF_PAIN, "wages")
    .hand(P1, PIERCING_LIGHT, "pl");
}

/** P1 casts Piercing Light: First as the mandatory target, Other as the "up to one other"; passes priority to P2. */
async function piercingLightDeclared(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("pl", { targets: ["first", "other"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pl", controller: P1, targets: ["first", "other"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

/** P2 reveals Wages of Pain from bf1 on its own First; it resolves (LIFO). */
async function wagesKillsFirst(game: Game): Promise<void> {
  expect(game.p2.can("reveal", "wages")).toBe(true);
  await game.p2.reveal("wages", { answers: ["first"] });
  if (game.decision()?.kind === "pick") {
    expect(game.decision()?.seat).toBe(P2);
    await game.p2.pick("first");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["pl", "wages"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Wages resolves first
}

describe("Ruling 3e8910b50e9acb69 — Wages of Pain kills Piercing Light's first target; the second 2 damage still lands", () => {
  test("control: unanswered, Piercing Light deals 2 to First and 2 to Other", async () => {
    const game = await piercingLightDeclared();
    await game.settle();
    expect(game.state("first")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    expect(game.state("other")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
  });

  test("P2 can respond after the targets are declared: hidden Wages of Pain (for 0) on First resolves first — First (3 Might) takes 3 and dies, P2 gets an exhausted Gold token; Piercing Light still waits with its ORIGINAL choices", async () => {
    const game = await piercingLightDeclared();
    await wagesKillsFirst(game);
    expect(game.zoneOf("wages")).toBe("trash");
    expect(game.zoneOf("first")).toBe("trash");
    const gold = game.p2.gear().filter((id) => game.state(id).isToken && game.state(id).name === "Gold");
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0]!).isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pl", targets: ["first", "other"] })]); // locked in, no re-choice offered
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("Piercing Light then resolves in one go: the first instance has no valid target (nothing else is hit instead), the second still deals 2 to Other", async () => {
    const game = await piercingLightDeclared();
    await wagesKillsFirst(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("pl")).toBe("trash");
    expect(game.zoneOf("first")).toBe("trash");
    expect(game.state("other")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    // No redirection of the orphaned 2: nothing else on the board took damage.
    for (const id of [...game.p1.units(), ...game.p2.units()]) {
      if (id !== "other") {
        expect(game.state(id).damage).toBe(0);
      }
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
