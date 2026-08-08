/**
 * Interaction: Switcheroo (sfd-145-221) — Chaos Action spell, [2]
 *     "[Hidden] (Hide now for [rainbow] to react with later for [0].) [Action]
 *      Swap the Might of two units at the same battlefield this turn."
 *   × Flash (ogs-011-024) — Chaos Reaction, [2]: "Move up to 2 friendly units to base."
 *   × Discipline (ogn-058-298) — Calm Reaction, [2]: "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Question: P1 controls bf1 with defender F (2 Might) and has Switcheroo facedown there. P2 attacks
 * with E (6 Might). In the combat showdown P1 flips Switcheroo (0 cost) choosing F and E.
 *   (a) P2 responds with Flash moving E to base. Does F still get +4 ("half a swap")?
 *   (b) P2 responds with Discipline on E (E=8). Mights after Switcheroo resolves — swap computed
 *       from play-time values (2 vs 6) or resolution-time values (2 vs 8)?
 *   (c) P2 Disciplines F instead (F=4). Result?
 *
 * Rules:
 *   355.5 / 811.1.d.2 — both targets are chosen when Switcheroo is finalized; from hidden both must
 *              be at bf1.
 *   359.3.e.2 / 359.3.e.5 — a target moved to base no longer meets "two units at the same
 *              battlefield" → illegal, unaffected.
 *   433.1.b / 359.3.e.12 — Swap is ONE calculation over both values (difference → +diff to the
 *              lower, −diff to the higher); an illegal target's Might reads null and every
 *              calculation based on it is ignored → no increase is created for F either
 *              (359.3.e.6 / 359.3.e.10: resolves with no effect). Contrast Facebreaker's per-target stun.
 *   359.3.f.2 / 433.1.b — the values swapped are the CURRENT Mights at resolution.
 *   466.1.a.1 — units heal at combat cleanup.
 *
 * Expected: (a) F stays 2, E (in base) stays 6; combat ends with no attackers, P1 holds bf1.
 *   (b) Discipline first (E=8, P2 draws 1), then diff 6 → F=8, E=2; combat: E dies, P1 holds.
 *   (c) F=4 vs E=6, diff 2 → F=6, E=4; combat 6 vs 4 → E dies, F survives (healed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SWITCHEROO = "sfd-145-221";
const FLASH = "ogs-011-024";
const DISCIPLINE = "ogn-058-298";

/**
 * Turn 3 (Switcheroo was hidden on an earlier turn), P2's turn. P1 controls bf1 with F (2);
 * Switcheroo facedown at bf1. P2 has E (6) in base, Flash + Discipline in hand and [4]+[calm]
 * (enough for exactly one of them).
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .resources(P2, { energy: 4, power: { calm: 1 } })
    .unit(P1, "bf1", { might: 2, name: "Friendly F" }, "F")
    .unit(P2, "base", { might: 6, name: "Enemy E" }, "E")
    .facedown(P1, "bf1", SWITCHEROO, "sw")
    .hand(P2, FLASH, "flash")
    .hand(P2, DISCIPLINE, "disc");
}

/** E attacks bf1; P2 (attacker, Focus) passes; P1 flips Switcheroo on {F, E} and passes priority to P2. */
async function flipped(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("E", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.p1.can("reveal", "sw")).toBe(true);
  await game.p1.reveal("sw");
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

/** Both players pass until the chain is empty (Switcheroo resolved), stopping before combat damage. */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
}

describe("Switcheroo from facedown × Flash / Discipline in response", () => {
  test("setup: flipping Switcheroo from facedown costs [0]; both targets are fixed at play time — the only two units at bf1, F and E (355.5, 811.1.d.2)", async () => {
    const game = await flipped();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sw", controller: P1, targets: ["F", "E"] })]);
    expect(game.state("F").combatRole).toBe("defender");
    expect(game.state("E").combatRole).toBe("attacker");
  });

  // ── (a) Flash E to base ───────────────────────────────────────────────────────────────

  test("(a) P2 may respond with Flash; it resolves first (LIFO) — E is in base while Switcheroo is still on the chain", async () => {
    const game = await flipped();
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: "E" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sw", "flash"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.zoneOf("E")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["sw"]);
  });

  // Expected (359.3.e.5, 359.3.e.12, 433.1.b): E is an illegal target, its Might reads null, the
  // single difference calculation is ignored → neither the +diff on F nor the −diff on E is
  // created; Switcheroo resolves with no effect. Actual: the engine still computes 6−2 = 4 and
  // applies "half a swap" — F becomes 6 and E (in base) becomes 2.
  test("(a) after Flash, Switcheroo resolves with NO effect — F stays 2 and E stays 6; no 'half swap' (359.3.e.12, 433.1.b)", async () => {
    const game = await flipped();
    await game.p2.cast("flash", { targets: "E" });
    await resolveChain(game);
    expect(game.zoneOf("sw")).toBe("trash");
    expect(game.state("F").might).toBe(2);
    expect(game.state("E").might).toBe(6);
  });

  test("(a) with E gone there are no attackers left — the combat ends, P1 keeps bf1 uncontested and F is still there", async () => {
    const game = await flipped();
    await game.p2.cast("flash", { targets: "E" });
    await resolveChain(game);
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.zoneOf("F")).toBe("battlefield-bf1");
    expect(game.zoneOf("E")).toBe("base");
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // ── (b) Discipline on E ───────────────────────────────────────────────────────────────

  test("(b) Discipline on E resolves first: E = 8 and P2 draws 1 while Switcheroo waits", async () => {
    const game = await flipped();
    const hand = game.p2.hand().length;
    await game.p2.cast("disc", { targets: "E" });
    expect(game.p2.energy()).toBe(2); // Discipline is [2], no power pip
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("E").might).toBe(8);
    expect(game.p2.hand()).toHaveLength(hand - 1 + 1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["sw"]);
  });

  test("(b) the swap uses CURRENT Might at resolution (2 vs 8, diff 6): F becomes 8, E becomes 2 (433.1.b, 359.3.f.2)", async () => {
    const game = await flipped();
    await game.p2.cast("disc", { targets: "E" });
    await resolveChain(game);
    expect(game.zoneOf("sw")).toBe("trash");
    expect(game.state("F").might).toBe(8);
    expect(game.state("E").might).toBe(2);
  });

  test("(b) combat: F 8 vs E 2 → E dies, F survives, P1 holds bf1", async () => {
    const game = await flipped();
    await game.p2.cast("disc", { targets: "E" });
    await resolveChain(game);
    await game.settle();
    expect(game.zoneOf("E")).toBe("trash");
    expect(game.zoneOf("F")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) Discipline on F ───────────────────────────────────────────────────────────────

  test("(c) Discipline on F (F=4), then swap 4 vs 6 (diff 2): F becomes 6, E becomes 4", async () => {
    const game = await flipped();
    await game.p2.cast("disc", { targets: "F" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("F").might).toBe(4);
    await resolveChain(game);
    expect(game.state("F").might).toBe(6);
    expect(game.state("E").might).toBe(4);
  });

  test("(c) combat 6 vs 4: E dies, F survives (4 damage < 6, healed at combat cleanup 466.1.a.1), P1 holds bf1", async () => {
    const game = await flipped();
    await game.p2.cast("disc", { targets: "F" });
    await resolveChain(game);
    await game.settle();
    expect(game.zoneOf("E")).toBe("trash");
    expect(game.zoneOf("F")).toBe("battlefield-bf1");
    expect(game.state("F").damage).toBe(0);
    expect(game.state("F").might).toBe(6); // still "this turn"
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("the swap lasts 'this turn' only — after the turn passes F is back to 2", async () => {
    const game = await flipped();
    await game.p2.cast("disc", { targets: "F" });
    await resolveChain(game);
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("F").might).toBe(2);
  });
});
