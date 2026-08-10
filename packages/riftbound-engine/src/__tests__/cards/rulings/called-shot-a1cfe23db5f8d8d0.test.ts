/**
 * Ruling a1cfe23db5f8d8d0 — Called Shot (SFD-122 → sfd-122-221) · Action · [0][chaos] · "[Repeat] [chaos] — Look at the top 2 cards
 *   of your Main Deck. Draw one and recycle the other."
 *   × Vex, Cheerless (sfd-146-221) · 5 Might · "While I'm in combat, friendly spells cost [1][rainbow] less to a minimum of [1], and
 *     enemy spells cost [1][rainbow] more."   (the ruling's other listed id, OGN-166, is just the Chaos Rune)
 *
 * Q: Does Vex reduce a 0-Power spell to -1 Power, and does she make Called Shot free?
 * A: A Power cost can't go below 0 (you never gain power / un-recycle runes). With Vex's discount Called Shot is free when cast
 *    without Repeat, but the Repeat still costs its [chaos].
 * Rules: 145.4/357 (cost modification floors at 0), 820 (Repeat is an additional cost paid while playing), 356 (additional
 *        costs are not part of the base cost being discounted).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CALLED_SHOT = "sfd-122-221";
const VEX_CHEERLESS = "sfd-146-221";

/** P1's turn with [0] and exactly 1 chaos. Vex in base; P2's 2-Might Blocker holds bf1. Known P1 deck top d1, d2, d3. */
function board(chaos = 1) {
  return scenario()
    .resources(P1, { energy: 0, power: { chaos } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Blocker" }, "blocker")
    .unit(P1, "base", VEX_CHEERLESS, "vex")
    .hand(P1, CALLED_SHOT, "shot")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** Vex attacks bf1: a combat showdown opens with P1 holding Focus and Vex "in combat". */
async function vexInCombat(chaos = 1): Promise<Game> {
  const game = await board(chaos).build();
  await game.p1.move("vex", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.state("vex").combatRole).toBe("attacker");
  return game;
}

/** Resolve Called Shot: pass around, then take d1 from the two revealed cards. */
async function resolveShot(game: Game): Promise<void> {
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
  await game.p1.pick("d1");
}

describe("Ruling a1cfe23db5f8d8d0 — Vex's discount floors Called Shot at 0 power; Repeat still costs [chaos]", () => {
  test("control (Vex NOT in combat, main phase): Called Shot costs its printed [chaos] — 1 chaos → 0; with only 1 chaos the Repeat isn't even affordable", async () => {
    const game = await board().build();
    expect(game.state("vex").combatRole).toBeNull();
    const repeat = game.p1.option("cast", "shot")?.fields.find((f) => f.arg === "repeat");
    expect(repeat).toBeUndefined();
    await game.p1.cast("shot");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await resolveShot(game);
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("Vex in combat, no Repeat: Called Shot is FREE — the pool stays at exactly 1 chaos (reduced to 0, never to -1 / no power gained)", async () => {
    const game = await vexInCombat();
    expect(game.p1.can("cast", "shot")).toBe(true);
    await game.p1.cast("shot", { repeat: 0 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shot", controller: P1 })]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 1 } });
    await resolveShot(game);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck().at(-1)).toBe("d2"); // the other one recycled to the bottom
    expect(game.zoneOf("shot")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("Vex in combat, even with 0 chaos the un-repeated Called Shot is castable (cost fully discounted to 0)", async () => {
    const game = await vexInCombat(0);
    expect(game.p1.can("cast", "shot")).toBe(true);
    await game.p1.cast("shot", { repeat: 0 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  test("Vex in combat WITH Repeat: the base cost is free but the Repeat's additional [chaos] must still be paid — 1 chaos → 0, and the effect runs twice", async () => {
    const game = await vexInCombat();
    const repeat = game.p1.option("cast", "shot")?.fields.find((f) => f.arg === "repeat");
    expect(repeat?.options).toEqual([1]);
    await game.p1.cast("shot", { repeat: 1 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
    await game.p1.pick("d1");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
    const second = game.decision();
    const keys = second?.kind === "pick" ? second.options.map((o) => o.key) : [];
    await game.p1.pick(keys.includes("d3") ? "d3" : (keys[0] as string));
    expect(game.p1.hand().sort()).toEqual(["d1", "d3"]);
  });

  test("Vex in combat with 0 chaos: the Repeat is NOT affordable (its [chaos] is not discounted away)", async () => {
    const game = await vexInCombat(0);
    const repeat = game.p1.option("cast", "shot")?.fields.find((f) => f.arg === "repeat");
    expect(repeat).toBeUndefined();
    expect((await game.p1.try((p) => p.cast("shot", { repeat: 1 }))).ok).toBe(false);
    expect(game.zoneOf("shot")).toBe("hand");
  });
});
