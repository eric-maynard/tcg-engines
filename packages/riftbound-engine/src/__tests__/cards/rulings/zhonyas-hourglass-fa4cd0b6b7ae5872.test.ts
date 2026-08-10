/**
 * Ruling fa4cd0b6b7ae5872 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2] · [Hidden]
 *   "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: I control TWO Zhonya's and two of my units die simultaneously — can each Hourglass save one unit?
 * A: Yes: X Hourglasses save X simultaneously dying units. Each Hourglass sees both death events; the controller
 *    assigns each to a different death; each is killed instead and both units are saved.
 *    Nuance: if only ONE unit dies with two Hourglasses out, the controller picks which Hourglass replaces it; the
 *    other does nothing (a death already replaced cannot be replaced again).
 * Rules: 370.1.b / 370.2 (an event is replaced once), 372 (owner orders competing replacements), 373 (assigning a
 *        single-use replacement among simultaneous events).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";

type PickD = Extract<Decision, { kind: "pick" }>;

/** P2's turn. P1 holds bf1 with the listed units; two face-up Zhonya's in P1's base; P2's 8-Might Brute attacks. */
function board(units: readonly { alias: string; might: number }[]) {
  const b = scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 1, name: "Their Holder" }, "th")
    .gear(P1, ZHONYAS, "zh1")
    .gear(P1, ZHONYAS, "zh2")
    .unit(P2, "base", { might: 8, name: "Brute" }, "brute");
  for (const u of units) b.unit(P1, "bf1", { might: u.might, name: `Unit ${u.alias.toUpperCase()}` }, u.alias);
  return b;
}

async function attack(units: readonly { alias: string; might: number }[]): Promise<Game> {
  const game = await board(units).build();
  await game.p2.move("brute", "bf1");
  await game.settle();
  return game;
}

/** Answer every replacement prompt P1 is shown (first option), recording their semantics. */
async function answerAll(game: Game): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind !== "pick" || d.seat !== P1 || d.timing !== "RPL") break;
    seen.push(String(d.semantics));
    await game.p1.pick(d.options[0]?.key as string);
    await game.settle();
  }
  return seen;
}

describe("Ruling fa4cd0b6b7ae5872 — two Zhonya's, two simultaneous deaths: each Hourglass saves one unit", () => {
  test("two units (3 and 2) die together to the 8-Might Brute: P1 is walked through the replacement choices (all P1's, timing RPL, never a chain item) — including WHICH death a given Hourglass takes", async () => {
    const game = await attack([
      { alias: "a", might: 3 },
      { alias: "b", might: 2 },
    ]);
    expect(game.chain()).toEqual([]);
    const first = game.decision();
    expect(first).toMatchObject({ kind: "pick", seat: P1, timing: "RPL" });
    const seen = await answerAll(game);
    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen).toContain("replacement-assign"); // "the controller picks which death event each Zhonya's will replace"
  });

  test("outcome: BOTH Hourglasses are killed instead and BOTH units are saved — healed, exhausted, recalled to P1's base; nothing of P1's but the two gear in the trash", async () => {
    const game = await attack([
      { alias: "a", might: 3 },
      { alias: "b", might: 2 },
    ]);
    await answerAll(game);
    expect(game.zoneOf("zh1")).toBe("trash");
    expect(game.zoneOf("zh2")).toBe("trash");
    expect(game.state("a")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.state("b")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.p1.trash().sort()).toEqual(["zh1", "zh2"]);
    expect(game.p1.gear()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // the emptied battlefield still falls to the Brute
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance — ONE unit dies with two Hourglasses out: P1 is asked which Hourglass applies (a rule-372 ordering pick listing zh1 | zh2)…", async () => {
    const game = await attack([{ alias: "solo", might: 3 }]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "replacement-order", timing: "RPL" });
    expect((d as PickD).options.map((o) => o.card ?? o.key).sort()).toEqual(["zh1", "zh2"]);
  });

  test("…P1 names zh2: zh2 is killed instead and Solo is saved; zh1 does NOTHING (the death was already replaced) and stays in play", async () => {
    const game = await attack([{ alias: "solo", might: 3 }]);
    await game.p1.pick("zh2");
    await game.settle();
    // no second question about zh1 — straight back to P2's main phase
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.zoneOf("zh2")).toBe("trash");
    expect(game.zoneOf("zh1")).toBe("base");
    expect(game.p1.gear()).toEqual(["zh1"]);
    expect(game.state("solo")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.violations()).toEqual([]);
  });
});
