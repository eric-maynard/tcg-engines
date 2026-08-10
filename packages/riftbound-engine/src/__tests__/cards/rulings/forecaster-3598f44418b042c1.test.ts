/**
 * Ruling 3598f44418b042c1 — Forecaster (SFD-065 → sfd-065-221) · Unit · Mind · 2 · 2 Might · Mech
 *     "Your Mechs have [Vision]. (When you play us, look at the top card of your Main Deck. You may recycle it.)"
 *   (Rumble legend sfd-026-221 listed in the scrape is context only.)
 *
 * Q: How does Forecaster work — multiple Vision procs every turn?
 * A: No per-turn procs: Vision is a PLAY trigger, so it fires each time you play a Mech (Forecaster included — it is a
 *    Mech and its own grant covers it). It STACKS: with two Forecasters out a Mech enters with two instances of Vision,
 *    each a separate trigger; you may recycle on the first and then see the new top card on the second, or decline
 *    and see the same card again.
 * Rules: 817.2 / 817.2.a / 817.2.b (multiple Vision instances trigger separately, chosen independently), 817.1 / 436
 *        (Vision = predict on play; may recycle), 383 (each triggered ability is its own chain item).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const FORECASTER = "sfd-065-221";
const FILLER = "ogn-175-298";
const MECH = { cardType: "unit", domain: "mind", energyCost: 1, might: 3, name: "Test Mech", tags: ["Mech"] } as const;

/** Count Vision look prompts for P1 while draining the chain; `recycle[i]` says whether to recycle on the i-th look. */
async function drainLooks(game: Game, recycle: readonly boolean[]): Promise<string[][]> {
  const seen: string[][] = [];
  for (let i = 0; i < 12; i++) {
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
    const cards = d.options.map((o) => o.card ?? o.key);
    seen.push(cards);
    if (recycle[seen.length - 1]) {
      await game.p1.pick(d.options[0]?.key as string);
    } else {
      await game.p1.decline();
    }
  }
  return seen;
}

describe("Ruling 3598f44418b042c1 — Forecaster's Vision fires per Mech PLAYED (itself included) and stacks per Forecaster", () => {
  test("Forecaster played alone predicts for itself: it is a Mech, its own grant covers it → one look at the top card", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, FORECASTER, "fc").deck(P1, [FILLER, FILLER], ["top", "second"]).build();
    await game.p1.play("fc", { to: "base" });
    const looks = await drainLooks(game, [false]);
    expect(looks).toEqual([["top"]]);
    expect(game.state("fc").keywords).toContain("Vision");
    expect(game.p1.deck().slice(0, 2)).toEqual(["top", "second"]); // declined: stays on top
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("one Forecaster out: playing a Mech gives exactly ONE Vision trigger / one look", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", FORECASTER, "fc").hand(P1, MECH, "mech").deck(P1, [FILLER, FILLER], ["top", "second"]).build();
    await game.p1.play("mech", { to: "base" });
    expect(game.chain().filter((c) => c.cardId === "mech" && c.triggered)).toHaveLength(1);
    const looks = await drainLooks(game, [true]);
    expect(looks).toEqual([["top"]]);
    expect(game.p1.deck()[0]).toBe("second"); // recycled to the bottom
    expect(game.p1.deck().at(-1)).toBe("top");
    expect(game.p1.hand()).toEqual([]); // predict never draws
  });

  // rule 817.2: two Forecasters = two Vision instances on the new Mech = two separate triggers/looks.
  test("ruling 3598f44418b042c1 — TWO Forecasters out: the new Mech enters with two Vision instances → two separate triggers on the chain (P1's, orderable)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", FORECASTER, "fc1")
      .unit(P1, "base", FORECASTER, "fc2")
      .hand(P1, MECH, "mech")
      .deck(P1, [FILLER, FILLER, FILLER], ["top", "second", "third"])
      .build();
    await game.p1.play("mech", { to: "base" });
    const d = game.decision();
    if (d?.kind === "order") {
      expect(d.seat).toBe(P1);
      await game.acceptTriggerOrder();
    }
    expect(game.chain().filter((c) => c.cardId === "mech" && c.triggered && c.controller === P1)).toHaveLength(2);
  });

  test("ruling 3598f44418b042c1 — recycling on the first look shows the NEW top card on the second look (top → bottom, then 'second' is seen)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", FORECASTER, "fc1")
      .unit(P1, "base", FORECASTER, "fc2")
      .hand(P1, MECH, "mech")
      .deck(P1, [FILLER, FILLER, FILLER], ["top", "second", "third"])
      .build();
    await game.p1.play("mech", { to: "base" });
    const looks = await drainLooks(game, [true, false]);
    expect(looks).toEqual([["top"], ["second"]]);
    expect(game.p1.deck()[0]).toBe("second");
    expect(game.p1.deck().at(-1)).toBe("top");
    expect(game.p1.hand()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("ruling 3598f44418b042c1 — declining the first look shows the SAME card again on the second (each instance chooses independently, rule 817.2.b)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", FORECASTER, "fc1")
      .unit(P1, "base", FORECASTER, "fc2")
      .hand(P1, MECH, "mech")
      .deck(P1, [FILLER, FILLER, FILLER], ["top", "second", "third"])
      .build();
    await game.p1.play("mech", { to: "base" });
    const looks = await drainLooks(game, [false, true]);
    expect(looks).toEqual([["top"], ["top"]]);
    expect(game.p1.deck()[0]).toBe("second"); // recycled on the second look
    expect(game.p1.deck().at(-1)).toBe("top");
  });

  test("no automatic procs 'every turn': with Forecaster + a Mech on the board, a full turn cycle asks P1 nothing about the top card", async () => {
    const game = await scenario().unit(P1, "base", FORECASTER, "fc").unit(P1, "base", MECH, "mech").build();
    let looks = 0;
    game.script(P1, [
      (d) => {
        if (d.kind === "pick" && /recycle/i.test(d.prompt)) {
          looks += 1;
        }
        return undefined;
      },
    ]);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 (beginning phase, draw, …)
    expect(game.turnPlayer()).toBe(P1);
    expect(looks).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
