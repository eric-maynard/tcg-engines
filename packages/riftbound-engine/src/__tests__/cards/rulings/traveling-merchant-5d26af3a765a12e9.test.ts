/**
 * Ruling 5d26af3a765a12e9 — Traveling Merchant (OGN-185 → ogn-185-298) · 2 Might "When I move, discard 1, then draw 1."
 *   × Jinx, Rebel (OGN-202 → ogn-202-298) · 5 Might "When you discard one or more cards, ready me and give me +1 [Might] this turn."
 *
 * Q: Merchant moves to an occupied battlefield; its discard readies my exhausted Jinx. Can Jinx now move together with
 *    the Merchant into that attack?
 * A: No. The Merchant's trigger only happens after it has already moved; once that chain resolves the showdown begins —
 *    too late for Jinx to join. Units only move "together" when they move at the same time to the same destination.
 * Rules: 108.4 / 140 (standard move is one simultaneous action), 340–344 (move → chain → showdown), 383.3 (triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRAVELING_MERCHANT = "ogn-185-298";
const JINX_REBEL = "ogn-202-298";

/** P1's turn. P2 holds bf1 with a 1-Might Sentry. P1: ready Merchant + EXHAUSTED Jinx in base; one card in hand to discard. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Sentry" }, "sentry")
    .unit(P1, "base", TRAVELING_MERCHANT, "merchant")
    .unit(P1, "base", JINX_REBEL, "jinx", { exhausted: true })
    .hand(P1, { cardType: "unit", energyCost: 9, might: 9, name: "Fodder" }, "fodder")
    .deck(P1, ["ogn-175-298"], ["drawn"]);
}

/** Merchant attacks bf1 alone; its trigger resolves (discard Fodder, draw); Jinx's discard trigger resolves (ready, +1). */
async function merchantAttacksAndJinxReadies(): Promise<Game> {
  const game = await board().build();
  // Premise: Jinx is exhausted, so she cannot be part of the move right now.
  expect(game.state("jinx").isExhausted).toBe(true);
  const multi = await game.p1.try((p) => p.move(["merchant", "jinx"], "bf1"));
  expect(multi.ok).toBe(false);
  await game.p1.move("merchant", "bf1");
  expect(game.zoneOf("merchant")).toBe("battlefield-bf1");
  expect(game.zoneOf("jinx")).toBe("base");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", triggered: true })]);
  // Resolve the Merchant's trigger: discard the only hand card, draw 1.
  for (let i = 0; i < 4 && game.decision()?.kind === "action" && game.chain().some((c) => c.cardId === "merchant"); i++) {
    await game.acting().pass();
  }
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("fodder");
  }
  expect(game.zoneOf("fodder")).toBe("trash");
  expect(game.p1.hand()).toEqual(["drawn"]);
  // Jinx's "when you discard" trigger → resolve it too.
  for (let i = 0; i < 6 && game.decision()?.kind === "action" && game.chain().length > 0; i++) {
    await game.acting().pass();
  }
  expect(game.chain()).toEqual([]);
  expect(game.state("jinx").isReady).toBe(true);
  expect(game.state("jinx").might).toBe(6);
  return game;
}

describe("Ruling 5d26af3a765a12e9 — Jinx readied by the Merchant's move-discard cannot join that attack", () => {
  test("after the trigger chain resolves the showdown at bf1 is under way: Jinx is ready in base but P1 has NO move action available", async () => {
    const game = await merchantAttacksAndJinxReadies();
    expect(game.zoneOf("jinx")).toBe("base");
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd?.active).toBe(true);
    expect(sd?.battlefieldId).toBe("bf1");
    // Whatever P1 may do now (focus/priority in the showdown), a standard move is not among it.
    if (game.actingSeat() !== P1) {
      await game.acting().pass();
    }
    const d = game.p1.decision();
    expect(d?.kind).toBe("action");
    expect(d && d.kind === "action" ? d.context : undefined).not.toBe("main");
    expect(game.p1.can("move")).toBe(false);
    expect(game.p1.option("standardMove")).toBeUndefined();
    const r = await game.p1.try((p) => p.move("jinx", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("jinx")).toBe("base");
  });

  test("the combat then resolves with the Merchant as the ONLY attacker (2 vs 1): Sentry dies, P1 conquers bf1; Jinx never left base", async () => {
    const game = await merchantAttacksAndJinxReadies();
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.units("bf1")).toEqual(["merchant"]);
    expect(game.zoneOf("jinx")).toBe("base");
    expect(game.state("jinx").isReady).toBe(true); // she may move on her own later — a separate move
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("move")).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
