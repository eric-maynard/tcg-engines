/**
 * Ruling d8af0bd2f01ed2c3 — Forecaster (SFD-065 → sfd-065-221) · Unit · Mind · [2] · 2 Might · Mech
 *     "Your Mechs have [Vision]. (When you play us, look at the top card of your Main Deck. You may recycle it.)"
 *   (Rumble, Hotheaded SFD-026 in the scrape is context only; "Bison" = any Mech — here the vanilla Mega-Mech OGN-088.)
 *
 * Q: Do multiple Forecasters on the field make Vision trigger multiple times when I play a Mech?
 * A: Yes, they stack: each Forecaster grants its own Vision instance, each triggers separately; on each resolution you
 *    look at the top card and independently choose whether to recycle. Declining shows the same card again; recycling
 *    lets you cycle through several.
 * Rules: 817.2 / 817.2.a–b (multiple Vision instances trigger and choose separately), 817.1 (Vision), 383 (each trigger
 *        is its own chain item).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const FORECASTER = "sfd-065-221";
const MEGA_MECH = "ogn-088-298"; // vanilla 8-Might Mech, [7]
const FILLER = "ogn-175-298";

function board(forecasters: 1 | 2 | 3) {
  let s = scenario().resources(P1, { energy: 7 }).hand(P1, MEGA_MECH, "mech").deck(P1, [FILLER, FILLER, FILLER, FILLER], ["c1", "c2", "c3", "c4"]);
  for (let i = 1; i <= forecasters; i++) {
    s = s.unit(P1, "base", FORECASTER, `fc${i}`);
  }
  return s;
}

/** Play the Mech, accept the (soft) trigger order, and count the Vision triggers on the chain. */
async function playMech(game: Game): Promise<number> {
  await game.p1.play("mech", { to: "base" });
  const d = game.decision();
  if (d?.kind === "order") {
    expect(d.seat).toBe(P1);
    await game.acceptTriggerOrder();
  }
  return game.chain().filter((c) => c.cardId === "mech" && c.triggered && c.controller === P1).length;
}

/** Drain the chain answering each Vision look: recycle[i] for the i-th look. Returns the card seen at each look. */
async function looks(game: Game, recycle: readonly boolean[]): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < 16; i++) {
    const r = await game.settle();
    if (r.reason !== "unanswered") {
      break;
    }
    const d = game.decision();
    if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
      continue;
    }
    if (d?.kind !== "pick" || d.seat !== P1) {
      break;
    }
    expect(d.options).toHaveLength(1); // ONE top card per look
    seen.push((d.options[0]?.card ?? d.options[0]?.key) as string);
    if (recycle[seen.length - 1]) {
      await game.p1.pick(d.options[0]?.key as string);
    } else {
      await game.p1.decline();
    }
  }
  return seen;
}

describe("Ruling d8af0bd2f01ed2c3 — multiple Forecasters stack: one Vision trigger per Forecaster when a Mech is played", () => {
  test("one Forecaster: playing Mega-Mech puts exactly ONE Vision trigger on the chain → one look", async () => {
    const game = await board(1).build();
    expect(await playMech(game)).toBe(1);
    expect(await looks(game, [false])).toEqual(["c1"]);
    expect(game.p1.deck()[0]).toBe("c1");
  });

  test("two Forecasters: TWO separate Vision triggers on the chain (P1 may order them), each resolving as its own look", async () => {
    const game = await board(2).build();
    expect(game.state("fc1").keywords).toContain("Vision");
    expect(await playMech(game)).toBe(2);
    expect(await looks(game, [false, false])).toHaveLength(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("three Forecasters: three triggers / three looks", async () => {
    const game = await board(3).build();
    expect(await playMech(game)).toBe(3);
    expect(await looks(game, [false, false, false])).toHaveLength(3);
  });

  test("declining every time: each instance sees the SAME top card (nothing happened in between)", async () => {
    const game = await board(2).build();
    await playMech(game);
    expect(await looks(game, [false, false])).toEqual(["c1", "c1"]);
    expect(game.p1.deck().slice(0, 2)).toEqual(["c1", "c2"]);
    expect(game.p1.hand()).toEqual([]); // Vision never draws
  });

  test("recycling each time cycles through the library: look 1 sees c1 (→ bottom), look 2 sees c2 (→ bottom); c3 is now on top", async () => {
    const game = await board(2).build();
    await playMech(game);
    expect(await looks(game, [true, true])).toEqual(["c1", "c2"]);
    const deck = game.p1.deck();
    expect(deck[0]).toBe("c3");
    expect(deck.slice(-2)).toEqual(["c1", "c2"]);
    expect(game.zoneOf("mech")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
