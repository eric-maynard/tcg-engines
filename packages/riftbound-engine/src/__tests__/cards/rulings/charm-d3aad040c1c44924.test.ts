/**
 * Ruling d3aad040c1c44924 — Charm (OGN-043 → ogn-043-298) · Spell · Calm · 1 + [calm] · "Move an enemy unit."
 *   × Ride the Wind (OGN-173 → ogn-173-298) "Move a friendly unit and ready it." (cited for "unless the effect readies it")
 *
 * Q: Can Charm move a unit even if it's exhausted, including between battlefields?
 * A: Yes. Exhaustion only gates the Standard Move; effect moves ignore it (and Ganking limits). Base → battlefield and
 *    battlefield → battlefield are fine. Moving it into an occupied battlefield opens a showdown with the moved unit as
 *    the ATTACKER; if that happens on your turn and they win, they score (conquer) on your turn and then the hold point
 *    at the start of their own turn. Ready units stay ready, exhausted ones stay exhausted (unless the effect readies).
 * Rules: 144.2 (exhausting is the cost of the STANDARD Move only), 144.4.c / 810 (Ganking concerns the Standard Move),
 *        447 (moves by effects), 460 / 464.2 (a unit arriving at an enemy-held battlefield stages combat as attacker),
 *        441–446 (conquer on any turn; hold at start of the controller's turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";

/**
 * P1's turn. P1 holds bf1 with Guard (2). P2: Brute (5, EXHAUSTED) and Scout (1, ready) in base, Sitter (2, no Ganking)
 * at P2's bf2. P1: Charm + exactly 1 + [calm]. Victory far away.
 */
function board() {
  return scenario()
    .victoryScore(8)
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 5, name: "Brute" }, "brute", { exhausted: true })
    .unit(P2, "base", { might: 1, name: "Scout" }, "scout")
    .unit(P2, "bf2", { might: 2, name: "Sitter" }, "sitter")
    .hand(P1, CHARM, "charm");
}

async function charm(game: Game, target: string, to: string): Promise<void> {
  await game.p1.cast("charm", { targets: target });
  const d = game.decision() as PickDecision;
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  expect(d.options.map((o) => o.key)).toContain(to);
  await game.p1.pick(to);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("charm")).toBe("trash");
}

describe("Ruling d3aad040c1c44924 — Charm moves exhausted units, anywhere a move may go; the moved unit attacks", () => {
  test("Charm targets the EXHAUSTED Brute (exhaustion is no obstacle) and may send it from P2's base to a battlefield (bf1 or bf2 offered)", async () => {
    const game = await board().build();
    expect(game.state("brute").isExhausted).toBe(true);
    const offered = (game.p1.option("cast", "charm")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(expect.arrayContaining(["brute", "scout", "sitter"]));
    await game.p1.cast("charm", { targets: "brute" });
    const d = game.decision() as PickDecision;
    expect(d.options.map((o) => o.key).sort()).toEqual(["battlefield-bf1", "battlefield-bf2"]);
  });

  test("moved into P1's occupied bf1 the Brute becomes the ATTACKER (Guard defends) and stays exhausted; P2 wins the combat and CONQUERS bf1 on P1's turn: P2 0 → 1", async () => {
    const game = await board().build();
    await charm(game, "brute", "battlefield-bf1");
    expect(game.locationOf("brute")).toBe("bf1");
    expect(game.state("brute")).toMatchObject({ combatRole: "attacker", isExhausted: true });
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    await game.settle(); // both pass focus → 5 vs 2
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.turnPlayer()).toBe(P1); // scored on P1's turn
    expect(game.p2.points()).toBe(1);
    expect(game.state("brute").isExhausted).toBe(true); // moved while exhausted → still exhausted
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("…and P2 then gets the HOLD point for bf1 at the start of P2's own turn (plus bf2's): 1 → 3", async () => {
    const game = await board().build();
    await charm(game, "brute", "battlefield-bf1");
    await game.settle();
    expect(game.p2.points()).toBe(1);
    await game.advanceTurn(); // → P2: holds bf1 and bf2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(3);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("battlefield → battlefield with no Ganking: Charm moves the Sitter from bf2 straight into bf1 (Ganking limits only the Standard Move); it arrives as attacker and stays READY (moved while ready)", async () => {
    const game = await board().build();
    expect(game.state("sitter").keywords).not.toContain("Ganking");
    expect(game.state("sitter").isReady).toBe(true);
    await charm(game, "sitter", "battlefield-bf1");
    expect(game.locationOf("sitter")).toBe("bf1");
    expect(game.state("sitter")).toMatchObject({ combatRole: "attacker", isReady: true });
    expect(game.state("guard").combatRole).toBe("defender");
    await game.settle(); // 2 vs 2: both die
    expect(game.zoneOf("sitter")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
