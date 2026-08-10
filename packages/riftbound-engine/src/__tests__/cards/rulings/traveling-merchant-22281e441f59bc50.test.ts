/**
 * Ruling 22281e441f59bc50 — Traveling Merchant (OGN-185 → ogn-185-298) · 2 Might "When I move, discard 1, then draw 1."
 *   × Flame Chompers (OGN-006 → ogn-006-298) · 3 Might "When you discard me, you may pay [fury] to play me."
 *
 * Q: Merchant moves to an open battlefield and discards Flame Chompers — can Chompers be played directly to the
 *    battlefield the Merchant is moving to?
 * A: No. When the discard trigger resolves you do not control that battlefield yet — control is only established
 *    once the move fully resolves (the showdown/cleanup) — so Chompers can only go to base or a battlefield you
 *    already control.
 * Rules: 340.1 (units are played to base or a battlefield you control), 344.2/348.2 (control after the showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRAVELING_MERCHANT = "ogn-185-298";
const FLAME_CHOMPERS = "ogn-006-298";

/**
 * P1's turn. bf1 is open (no controller, no units); P1 already controls bf2 (a 1-Might Keeper there).
 * P1: Traveling Merchant in base, Flame Chompers the only card in hand, 1 fury for the Chompers payment.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf2", { might: 1, name: "Keeper" }, "keeper")
    .unit(P1, "base", TRAVELING_MERCHANT, "merchant")
    .hand(P1, FLAME_CHOMPERS, "chompers")
    .resources(P1, { energy: 0, power: { fury: 1 } });
}

/** Merchant moves to bf1; its trigger resolves (discard Chompers, draw 1); P1 pays [fury] for Chompers → up to the destination prompt. */
async function moveAndDiscard(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("merchant", "bf1");
  expect(game.zoneOf("merchant")).toBe("battlefield-bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Merchant's trigger resolves
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("chompers"); // the only card to discard
  }
  expect(game.zoneOf("chompers")).toBe("trash");
  expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "chompers" } });
  await game.p1.yes();
  for (let i = 0; i < 4 && game.decision()?.kind === "action"; i++) {
    await game.acting().passPriority(); // Chompers' trigger resolves
  }
  return game;
}

describe("Ruling 22281e441f59bc50 — Flame Chompers discarded to a moving Merchant can't be played to the battlefield being moved to", () => {
  test("while the discard trigger resolves, bf1 is merely CONTESTED by P1 — not controlled", async () => {
    const game = await board().build();
    await game.p1.move("merchant", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("chompers");
    }
    expect(game.zoneOf("chompers")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull(); // still not P1's
  });

  test("paying [fury]: the destination offer is base or the ALREADY-controlled bf2 — bf1 (where Merchant went) is not a choice", async () => {
    const game = await moveAndDiscard();
    expect(game.p1.power("fury")).toBe(0);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(keys).toContain("base");
    expect(keys).toContain("battlefield-bf2");
    expect(keys).not.toContain("battlefield-bf1");
    const r = await game.p1.try((p) => p.pick("battlefield-bf1"));
    expect(r.ok).toBe(false);
  });

  test("choosing base: Chompers lands in base; only after the showdown closes does P1 take control of bf1 (and conquer it)", async () => {
    const game = await moveAndDiscard();
    await game.p1.pick("base");
    expect(game.zoneOf("chompers")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull(); // still mid-showdown
    await game.settle(); // both pass Focus → non-combat showdown ends → control established
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.units("bf1")).toEqual(["merchant"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: had P1 ALREADY controlled bf1 before the move, it would be a legal Chompers destination", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 1, name: "Keeper" }, "keeper")
      .unit(P1, "base", TRAVELING_MERCHANT, "merchant")
      .hand(P1, FLAME_CHOMPERS, "chompers")
      .resources(P1, { energy: 0, power: { fury: 1 } })
      .build();
    await game.p1.move("merchant", "bf1");
    await game.settle(); // trigger resolves; forced single discard
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("chompers");
    }
    await game.p1.yes();
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(keys).toContain("battlefield-bf1");
    await game.p1.pick("battlefield-bf1");
    expect(game.zoneOf("chompers")).toBe("battlefield-bf1");
  });
});
