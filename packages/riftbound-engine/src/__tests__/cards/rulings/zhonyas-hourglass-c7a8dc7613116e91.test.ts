/**
 * Ruling c7a8dc7613116e91 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2] · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: When in combat can the defender "activate" (flip) a hidden Zhonya's, and can the attacker force them to commit before
 *    damage assignment so as to aim at a different unit?
 * A: It must be played BEFORE damage assignment — there is no reaction window between assignment and units dying. Once it
 *    is in play the attacker assigns damage knowing that; Zhonya's saves whichever unit would die from the assignment (the
 *    attacker may aim elsewhere and that unit is saved instead); a unit assigned no lethal damage survives anyway.
 * Rules: 465.2 (combat damage: assign, then deal simultaneously — no priority in between), 811 (hidden ⇒ Reaction with
 *        Focus), 366–373 (die replacement applies as the death would happen).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";

type DistD = Extract<Decision, { kind: "distribute" }>;

/** P1's turn. P2 holds bf1 with A (3) + B (3) and Zhonya's FACEDOWN there. P1's Brute (4) in base attacks. Auto-procedures on. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Defender A" }, "a")
    .unit(P2, "bf1", { might: 3, name: "Defender B" }, "b")
    .facedown(P2, "bf1", ZHONYAS, "zh")
    .unit(P1, "base", { might: 4, name: "Brute" }, "brute");
}

/** Brute attacks; P1 passes Focus; optionally P2 flips Zhonya's with its Focus; everybody passes until P1's damage assignment. */
async function toAssignment(flip: boolean): Promise<{ game: Game; d: DistD }> {
  const game = await board().build();
  await game.p1.move("brute", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p2.can("reveal", "zh")).toBe(true); // THIS is the window: before any damage is assigned
  if (flip) {
    await game.p2.reveal("zh");
    expect(game.zoneOf("zh")).toBe("base");
  }
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "action" && (d.context === "showdown" || d.context === "chain")) {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  const d = game.decision();
  expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 4 });
  return { d: d as DistD, game };
}

describe("Ruling c7a8dc7613116e91 — Zhonya's must be flipped before combat damage is assigned; it then saves whichever unit the assignment would kill", () => {
  test("NOT flipped: at the moment of damage assignment the decision is the ATTACKER's split; P2 has no action there (cannot flip now), and once P1 assigns 3 to A + 1 to B, A is dead with no P2 decision in between", async () => {
    const { game, d } = await toAssignment(false);
    expect(d.buckets.map((b) => b.card ?? b.key).sort()).toEqual(["a", "b"]);
    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.can("reveal", "zh")).toBe(false);
    await game.p1.distribute({ a: 3, b: 1 });
    // Whatever comes next, A already died — P2 never got to act between assignment and the death.
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("facedown-bf1"); // never played; B still holds bf1 so it stays hidden there
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash"); // 3 + 3 = 6 ≥ 4
    expect(game.state("b")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("flipped with Focus BEFORE assignment: P1 then aims the lethal 3 at B (1 at A) → Zhonya's is killed instead, B is healed/exhausted/recalled to base; A (no lethal damage) survives anyway", async () => {
    const { game } = await toAssignment(true);
    await game.p1.distribute({ a: 1, b: 3 });
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("b")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.state("a")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // healed after combat
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("…the attacker may just as well aim at A instead — then Zhonya's saves A: the defender committed first and cannot pick which unit it protects", async () => {
    const { game } = await toAssignment(true);
    await game.p1.distribute({ a: 3, b: 1 });
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("a")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.state("b")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });

  test("465.2.c.3–4: the only legal assignments are 'lethal 3 to one, the remaining 1 to the other' — the attacker's real choice is WHICH unit gets the lethal share", async () => {
    const { d } = await toAssignment(true);
    expect(d.buckets.map((b) => [b.card ?? b.key, b.lethal]).sort()).toEqual([
      ["a", 3],
      ["b", 3],
    ]);
  });
});
