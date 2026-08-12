/**
 * rule 809.1.d / 429.3 — the snapshot's `unaffordableTargets`: play-time targets
 * the engine LISTS but the pool cannot pay for yet.
 *
 * A [Deflect]-surcharged candidate the pool cannot cover but a Reaction [Add]
 * still could is a legal choice the caster simply cannot afford this instant.
 * 809.1.d drops a candidate only when NOTHING could fund it, so it must reach
 * the client — dimmed, with what it needs — instead of vanishing from the target
 * glow. These are by construction NOT legal moves, so they ride on the snapshot
 * beside `moves` and the client keeps refusing to dispatch them.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "@tcg/riftbound/harness";
import type { GameSession } from "../state";
import { buildAvailableMoves, buildGameSnapshot, buildReachablePlays } from "../snapshot";

const HEISHO = "ven-158-166";
const POUTY_PORO = "ogn-013-298"; // [Deflect] — costs an extra [rainbow] to choose
const ROCKET = "ogn-252-298"; // 4 + [rainbow], "Deal 5 to a unit"

function sessionOf(engine: unknown): GameSession {
  return {
    clients: new Map(),
    engine: engine as GameSession["engine"],
    log: [],
    playerNames: { [P1]: "Alice", [P2]: "Bob" },
    players: [P1, P2],
    sandbox: true,
    seq: 0,
  };
}

/** P1 holds exactly the Rocket's base cost plus `runes` ready runes to recycle. */
function board(runes: number) {
  let s = scenario()
    .resources(P1, { energy: 4, power: { rainbow: 1 } })
    .battlefield("bfH", { controller: P2, def: HEISHO, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bfH", POUTY_PORO, "hereporo") // Heisho waives its Deflect instalment
    .unit(P2, "bf2", POUTY_PORO, "awayporo") // this one still charges [rainbow]
    .hand(P1, ROCKET, "rocket");
  for (let i = 0; i < runes; i++) {
    s = s.rune(P1, "fury", { alias: `k${i}` });
  }
  return s;
}

type Row = { cardId: string; targets: string[]; surcharge: number; needsAdd?: { power?: Record<string, number>; reason: string } };

describe("snapshot.unaffordableTargets — a reachable-but-unpaid [Deflect] target reaches the client", () => {
  test("the away Poro rides on the snapshot with its surcharge and pay line, and is NOT among the legal moves", async () => {
    const game = await board(1).build();
    const engine = (game as unknown as { engine: unknown }).engine;
    const session = sessionOf(engine);
    const rows = (buildGameSnapshot(session, P1).unaffordableTargets ?? []) as Row[];

    const away = rows.find((r) => r.targets.includes(game.card("awayporo")));
    expect(away).toBeDefined();
    expect(away?.surcharge).toBe(1);
    expect(away?.needsAdd?.power).toEqual({ rainbow: 1 });
    expect(away?.needsAdd?.reason).toContain("recycle");

    // 809.3 / 766 — Heisho waives the instalment here, so its Poro is payable
    // and never appears as unaffordable.
    expect(rows.some((r) => r.targets.includes(game.card("hereporo")))).toBe(false);

    // The dimmed candidate is NOT dispatchable: it is absent from the legal moves.
    const moves = buildAvailableMoves(session, P1);
    const targeted = moves
      .filter((m) => m.moveId === "playSpell")
      .map((m) => (m.params.targets as string[] | undefined) ?? []);
    expect(targeted.flat()).not.toContain(game.card("awayporo"));
    expect(targeted.flat()).toContain(game.card("hereporo"));
  });

  test("one recycle clears it: with the pip pooled the away Poro becomes a legal move and drops off the unaffordable list", async () => {
    const game = await board(1).build();
    await game.p1.recycleRune("k0");
    const session = sessionOf((game as unknown as { engine: unknown }).engine);
    expect((buildGameSnapshot(session, P1).unaffordableTargets ?? []).length).toBe(0);
    const targeted = buildAvailableMoves(session, P1)
      .filter((m) => m.moveId === "playSpell")
      .flatMap((m) => (m.params.targets as string[] | undefined) ?? []);
    expect(targeted).toContain(game.card("awayporo"));
  });

  test("nothing to add: with no runes and no Reaction [Add] the candidate is genuinely unfundable, so it is neither legal nor listed (809.1.d)", async () => {
    const game = await board(0).build();
    const session = sessionOf((game as unknown as { engine: unknown }).engine);
    const rows = (buildGameSnapshot(session, P1).unaffordableTargets ?? []) as Row[];
    expect(rows.some((r) => r.targets.includes(game.card("awayporo")))).toBe(false);
    const targeted = buildAvailableMoves(session, P1)
      .filter((m) => m.moveId === "playSpell")
      .flatMap((m) => (m.params.targets as string[] | undefined) ?? []);
    expect(targeted).not.toContain(game.card("awayporo"));
  });
});

/**
 * rule 357.1.a — the snapshot's `reachablePlays`: hand cards the seat could pay
 * for after ONE Reaction [Add]. The move itself stays refused (paying is
 * manual), so this is what stops the hand looking inert — the reported symptom
 * was Turn 1 Main with 1 Energy and a ready rune where every card was dead.
 */
describe("snapshot.reachablePlays — a card one Add away is shipped with its pay line", () => {
  const TWO_COST = { cardType: "unit", domain: "chaos", energyCost: 2, might: 2, name: "Filler Two Cost" };

  test("1 Energy + one ready rune: the 2-cost unit rides on the snapshot as one tap short, and is NOT a legal move", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .rune(P1, "chaos", { alias: "r1" })
      .hand(P1, TWO_COST, "u")
      .build();
    const session = sessionOf((game as unknown as { engine: unknown }).engine);
    const rows = buildReachablePlays(session, P1);
    expect(rows).toEqual([
      expect.objectContaining({ cardId: game.card("u"), moveId: "playUnit" }),
    ]);
    expect(rows[0]?.needsAdd).toMatchObject({ energy: 1 });
    expect(buildGameSnapshot(session, P1).reachablePlays).toHaveLength(1);
    expect(buildAvailableMoves(session, P1).some((m) => m.moveId === "playUnit")).toBe(false);
  });

  test("after the tap it moves from the pay line to the legal moves", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .rune(P1, "chaos", { alias: "r1" })
      .hand(P1, TWO_COST, "u")
      .build();
    await game.p1.tapRune("r1");
    const session = sessionOf((game as unknown as { engine: unknown }).engine);
    expect(buildReachablePlays(session, P1)).toEqual([]);
    expect(buildAvailableMoves(session, P1).some((m) => m.moveId === "playUnit")).toBe(true);
  });
});
