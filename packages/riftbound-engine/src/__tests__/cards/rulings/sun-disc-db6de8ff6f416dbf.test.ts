/**
 * Ruling db6de8ff6f416dbf — Sun Disc (OGN-021 → ogn-021-298) · Gear · Fury · [2]
 *     "[Exhaust]: [Legion] — The next unit you play this turn enters ready."
 *   × Jinx, Demolitionist (OGN-030 → ogn-030-298) · [3][fury] · 4 Might · "When you play me, discard 2."
 *   × Flame Chompers (OGN-006 → ogn-006-298) · 3 Might · "When you discard me, you may pay [fury] to play me."
 *
 * Q: Can Sun Disc be flipped BETWEEN playing Jinx and summoning the Flame Chompers her trigger discards, so the Chompers
 *    enter ready?
 * A: No — Sun Disc's ability is not a Reaction, so it can't be used while Jinx's trigger / Chompers' trigger are on the
 *    chain. If it is flipped before Jinx, it affects Jinx (the "next unit"), and the Chompers played afterwards enter
 *    exhausted — the one-shot was already used.
 * Rules: 812 (Legion), 336–337 (Closed State: only Reactions), 419 (activated abilities default to Action speed),
 *        140.5/143.4 (units enter exhausted), 383 (triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SUN_DISC = "ogn-021-298";
const JINX = "ogn-030-298";
const FLAME_CHOMPERS = "ogn-006-298";
const OPENER = { cardType: "unit", energyCost: 1, might: 1, name: "Opener" } as const;
const JUNK = { cardType: "spell", energyCost: 9, name: "Junk" } as const;

/**
 * P1's turn: 4 energy + 2 fury (Opener 1, Jinx [3][fury], Chompers' [fury]). Sun Disc ready in base. Hand: Opener (turns
 * Legion on), Jinx, Flame Chompers, Junk — after Jinx the hand is exactly Chompers + Junk, so "discard 2" takes both.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 2 } })
    .gear(P1, SUN_DISC, "disc")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, OPENER, "opener")
    .hand(P1, JINX, "jinx")
    .hand(P1, FLAME_CHOMPERS, "chompers")
    .hand(P1, JUNK, "junk");
}

/** Opener played (Legion live), Sun Disc NOT used, Jinx played: her play trigger is on the chain, P1 has priority. */
async function jinxWithoutDisc(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("opener");
  await game.settle();
  expect(game.p1.can("activate", "disc")).toBe(true); // Legion is on — the disc WOULD be usable in an open state
  await game.p1.play("jinx");
  expect(game.zoneOf("jinx")).toBe("base");
  expect(game.state("jinx").isExhausted).toBe(true); // no Sun Disc: normal exhausted entry
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jinx", controller: P1, triggered: true })]);
  return game;
}

describe("Ruling db6de8ff6f416dbf — Sun Disc can't be slipped in between Jinx and the Chompers she discards", () => {
  test("while Jinx's 'When you play me' trigger is on the chain (Closed State), Sun Disc's non-Reaction ability is NOT legal for P1", async () => {
    const game = await jinxWithoutDisc();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "disc")).toBe(false);
    const r = await game.p1.try((p) => p.activate("disc"));
    expect(r.ok).toBe(false);
    expect(game.state("disc").isReady).toBe(true);
  });

  test("…nor while Flame Chompers' discard trigger is on the chain: its opt-in and the following priority window are still a Closed State", async () => {
    const game = await jinxWithoutDisc();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("chompers")).toBe("trash");
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "chompers", controller: P1, triggered: true })]);
    // The opt-in prompt itself offers no Sun Disc activation…
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.p1.legal().some((o) => o.card === "disc")).toBe(false);
    await game.p1.yes(); // pay [fury]
    expect(game.p1.power("fury")).toBe(0);
    // …and neither does any chain priority window before the Chompers actually enter.
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action") {
        expect(game.seat(d.seat).can("activate", "disc")).toBe(false);
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("chompers")).toBe("base");
    expect(game.state("chompers").isExhausted).toBe(true); // never readied
    expect(game.state("disc").isReady).toBe(true); // the disc was never usable in that stretch
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("flipped BEFORE Jinx instead: Jinx (the next unit) enters READY, and the Chompers played by the discard trigger enter EXHAUSTED", async () => {
    const game = await board().build();
    await game.p1.play("opener");
    await game.settle();
    await game.p1.activate("disc");
    await game.settle();
    expect(game.state("disc").isExhausted).toBe(true);
    await game.p1.play("jinx");
    expect(game.state("jinx").isReady).toBe(true); // Sun Disc consumed here
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("chompers")).toBe("base");
    expect(game.state("chompers").isExhausted).toBe(true);
    expect(game.state("jinx").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
