/**
 * Ruling 7a89dfa2ce04b516 — Jinx, Demolitionist (OGN-030 → ogn-030-298) · [3][fury] · 4 Might · "When you play me, discard 2."
 *   × Sun Disc (OGN-021 → ogn-021-298) · Gear "[Exhaust]: [Legion] — The next unit you play this turn enters ready."
 *   × Flame Chompers (OGN-006 → ogn-006-298) · 3 Might "When you discard me, you may pay [fury] to play me."
 *
 * Q: Sun Disc has been activated; Jinx is played and her trigger discards Flame Chompers. In what order do things resolve,
 *    and which unit is readied?
 * A: Sun Disc's pending "enters ready" is a passive/replacement — Jinx enters the board ALREADY READY, no chain involved. Then
 *    Jinx's "When you play me" trigger goes on the chain and resolves (discard 2 incl. Chompers); only AFTER it has fully
 *    resolved does Chompers' discard trigger go on the chain; paying [fury] plays Chompers (which enters exhausted as normal).
 * Rules: 366–373 (replacement effects don't use the chain), 383 (triggers from a resolving item are put on the chain after
 *        it finishes), 340 (LIFO), 143.4 (units enter exhausted unless replaced).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const JINX = "ogn-030-298";
const SUN_DISC = "ogn-021-298";
const FLAME_CHOMPERS = "ogn-006-298";

/**
 * P1's turn: 4 energy + 2 fury (1 for the Opener, [3][fury] for Jinx, [fury] for Chompers). Sun Disc ready in base.
 * Hand: Opener (1-cost, played first to turn on Legion), Jinx, Flame Chompers, Junk — so after Jinx the hand is exactly
 * Chompers + Junk and "discard 2" takes both.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 2 } })
    .gear(P1, SUN_DISC, "disc")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Opener" }, "opener")
    .hand(P1, JINX, "jinx")
    .hand(P1, FLAME_CHOMPERS, "chompers")
    .hand(P1, { cardType: "spell", energyCost: 9, name: "Junk" }, "junk");
}

/** Opener (Legion on) → activate Sun Disc and let it resolve → play Jinx (base cost, no Accelerate). */
async function discThenJinx(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.can("activate", "disc")).toBe(false); // Legion not yet met
  await game.p1.play("opener");
  await game.settle();
  expect(game.state("opener").isExhausted).toBe(true); // normal entry: exhausted
  expect(game.p1.can("activate", "disc")).toBe(true);
  await game.p1.activate("disc");
  await game.settle();
  expect(game.state("disc").isExhausted).toBe(true);
  expect(game.chain()).toEqual([]);
  await game.p1.play("jinx");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
  return game;
}

describe("Ruling 7a89dfa2ce04b516 — Sun Disc readies Jinx passively; Chompers' trigger waits for Jinx's play trigger to finish", () => {
  test("Jinx enters the board ALREADY READY (Sun Disc's effect is not a chain item), and the only thing on the chain is her own 'When you play me' trigger", async () => {
    const game = await discThenJinx();
    expect(game.zoneOf("jinx")).toBe("base");
    expect(game.state("jinx").isReady).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jinx", controller: P1, triggered: true })]);
    expect(game.chain().some((c) => c.cardId === "disc")).toBe(false);
    expect(game.zoneOf("chompers")).toBe("hand"); // nothing discarded yet
  });

  test("Jinx's trigger resolves: Chompers + Junk are discarded; only NOW is Flame Chompers' discard trigger put on the chain (Jinx's item is gone) with its 'pay [fury]?' opt-in for P1", async () => {
    const game = await discThenJinx();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("chompers")).toBe("trash");
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "chompers", controller: P1, triggered: true })]);
    expect(game.chain().some((c) => c.cardId === "jinx")).toBe(false);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(d?.kind === "yes-no" ? d.source?.cardId : undefined).toBe("chompers");
  });

  test("P1 pays [fury]: Flame Chompers is played from the trash — it enters EXHAUSTED (Sun Disc's one-shot was used on Jinx), while Jinx stays ready", async () => {
    const game = await discThenJinx();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.yes();
    expect(game.p1.power("fury")).toBe(0); // the [fury] was paid
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("chompers")).toBe("base");
    expect(game.state("chompers").isExhausted).toBe(true);
    expect(game.state("jinx").isReady).toBe(true);
    expect(game.p1.units().sort()).toEqual(["chompers", "jinx", "opener"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
