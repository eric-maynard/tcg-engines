/**
 * Ruling d6394e558cb9128d — Forecaster (SFD-065 → sfd-065-221) · Unit · Mind · [2] · 2 · Mech
 *   "Your Mechs have [Vision]. (When you play us, look at the top card of your Main Deck. You may recycle it.)"
 *   (Rumble, Hotheaded sfd-026-221 in the scrape is context only.)
 *
 * Q: With a second Forecaster on the field, is that Vision 2 or two separate instances of Vision 1?
 * A: Two separate instances. Multiple instances of Vision trigger separately (743.2): playing a Mech puts one trigger per
 *    instance on the chain; each resolves as its own look with its own recycle decision — decline the first and the second
 *    look shows the same card again.
 * Rules: 743.2 / 817.2 (multiple Vision instances trigger separately), 383 (each trigger is its own chain item).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const FORECASTER = "sfd-065-221";
const FILLER = "ogn-175-298";
const MECH = { cardType: "unit", domain: "mind", energyCost: 1, might: 3, name: "Test Mech", tags: ["Mech"] } as const;

/** Drain the chain, answering each Vision look for P1 per `recycle[i]`; returns the card shown at each look. */
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
    seen.push(d.options.map((o) => o.card ?? o.key));
    if (recycle[seen.length - 1]) {
      await game.p1.pick(d.options[0]?.key as string);
    } else {
      await game.p1.decline();
    }
  }
  return seen;
}

/** P1's turn, one Forecaster already out; the second Forecaster and a Test Mech in hand; [3]; known deck top. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1")
    .unit(P1, "base", FORECASTER, "fc1")
    .hand(P1, FORECASTER, "fc2")
    .hand(P1, MECH, "mech")
    .deck(P1, [FILLER, FILLER, FILLER], ["top", "second", "third"]);
}

/** Play the second Forecaster and resolve its own Vision looks (declining), leaving both Forecasters out. */
async function twoForecastersOut(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("fc2", { to: "base" });
  await drainLooks(game, [false, false, false]);
  expect(game.p1.units("base").toSorted()).toEqual(["fc1", "fc2"]);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

describe("Ruling d6394e558cb9128d — two Forecasters = two separate Vision instances, not 'Vision 2'", () => {
  test("playing the second Forecaster with the first out: it is itself a Mech with TWO Vision instances (its own grant + fc1's) → two separate triggers, two looks at the same top card when both are declined", async () => {
    const game = await board().build();
    await game.p1.play("fc2", { to: "base" });
    if (game.decision()?.kind === "order") {
      expect(game.decision()).toMatchObject({ kind: "order", seat: P1 });
      await game.acceptTriggerOrder();
    }
    expect(game.chain().filter((c) => c.cardId === "fc2" && c.triggered)).toHaveLength(2); // two chain items, not one
    const looks = await drainLooks(game, [false, false]);
    expect(looks).toEqual([["top"], ["top"]]);
    expect(game.p1.deck().slice(0, 3)).toEqual(["top", "second", "third"]);
  });

  test("with both Forecasters out, playing a Mech puts TWO independent Vision triggers on the chain (both P1's)", async () => {
    const game = await twoForecastersOut();
    await game.p1.play("mech", { to: "base" });
    if (game.decision()?.kind === "order") {
      expect(game.decision()).toMatchObject({ kind: "order", seat: P1 });
      await game.acceptTriggerOrder();
    }
    expect(game.state("mech").keywords).toContain("Vision");
    const triggers = game.chain().filter((c) => c.cardId === "mech" && c.triggered && c.controller === P1);
    expect(triggers).toHaveLength(2);
  });

  test("each trigger is its own look with its own choice: recycle on the first → the second look shows the NEW top card", async () => {
    const game = await twoForecastersOut();
    await game.p1.play("mech", { to: "base" });
    const looks = await drainLooks(game, [true, false]);
    expect(looks).toEqual([["top"], ["second"]]);
    expect(game.p1.deck()[0]).toBe("second");
    expect(game.p1.deck().at(-1)).toBe("top");
    expect(game.p1.hand()).toEqual([]); // Vision never draws
  });

  test("…decline the first → the second look sees the SAME card again (and may recycle it then)", async () => {
    const game = await twoForecastersOut();
    await game.p1.play("mech", { to: "base" });
    const looks = await drainLooks(game, [false, true]);
    expect(looks).toEqual([["top"], ["top"]]);
    expect(game.p1.deck()[0]).toBe("second");
    expect(game.p1.deck().at(-1)).toBe("top");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
