/**
 * Ruling 1590a1371c7ef428 — Raging Soul (OGN-019 → ogn-019-298) · Unit · Fury · [4] · 4 Might
 *     "If you've discarded a card this turn, I have [Assault] and [Ganking]."
 *   × Chemtech Enforcer (ogn-003-298) "When you play me, discard 1." — the discard outlet.
 *
 * Q: Do the Assault/Ganking apply only on the turn a card is discarded, or persist across turns?
 * A: It is a passive checked continuously: after you discard, Raging Soul has Assault + Ganking until THAT turn ends
 *    (through the end-of-turn phase); it is off when the next turn starts and must be re-earned by discarding again
 *    on a later turn.
 * Rules: 364.3 (conditional passives re-evaluated continuously), "this turn" bookkeeping lapses at 317 (Expiration),
 *        719 Assault / 726 Ganking.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RAGING_SOUL = "ogn-019-298";
const CHEMTECH_ENFORCER = "ogn-003-298"; // [2] fury unit · "When you play me, discard 1."
const FILLER = "ogn-175-298";

/** P1's turn 2. Soul on P1's bf1; P2 holds bf2 with a 6-Might Wall (Soul never wants to fight it). Two Enforcers + a filler in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", RAGING_SOUL, "soul")
    .unit(P2, "bf2", { might: 6, name: "Wall" }, "wall")
    .hand(P1, CHEMTECH_ENFORCER, "ce1")
    .hand(P1, CHEMTECH_ENFORCER, "ce2")
    .hand(P1, FILLER, "toss");
}

/** Play an Enforcer; its trigger discards `toss` (or, if that is gone, whatever else is offered first that is not an Enforcer). */
async function discardVia(game: Game, enforcer: string, prefer = "toss"): Promise<string> {
  const trashBefore = game.p1.trash();
  await game.p1.play(enforcer, { to: "base" });
  await game.settle();
  let discarded = prefer;
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    const keys = d.options.map((o) => o.card ?? o.key);
    discarded = keys.includes(prefer) ? prefer : (keys.find((k) => k !== "ce1" && k !== "ce2") ?? keys[0]!);
    await game.p1.pick(discarded);
    await game.settle();
  } else {
    discarded = game.p1.trash().find((c) => !trashBefore.includes(c)) ?? prefer;
  }
  expect(game.p1.trash()).toContain(discarded);
  return discarded;
}

const kw = (game: Game) => [...game.state("soul").keywords].sort();

describe("Ruling 1590a1371c7ef428 — Raging Soul's Assault/Ganking last until the end of the discard turn, then switch off", () => {
  test("before any discard this turn: no keywords, no battlefield→battlefield move", async () => {
    const game = await board().build();
    expect(kw(game)).toEqual([]);
    expect(game.p1.can("gank", "soul")).toBe(false);
  });

  test("discard a card during your turn → Raging Soul immediately has Assault and Ganking (and may gank bf1 → bf2)", async () => {
    const game = await board().build();
    await discardVia(game, "ce1");
    expect(kw(game)).toEqual(["Assault", "Ganking"]);
    expect(game.p1.can("gank", "soul")).toBe(true);
  });

  test("the ability stays on for the rest of that turn (a later, unrelated action does not turn it off)", async () => {
    const game = await board().resources(P1, { energy: 4 }).build();
    await discardVia(game, "ce1");
    await game.p1.play("ce2", { to: "base" }); // second Enforcer: another discard prompt (or nothing left) — either way still on
    await game.settle();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick((game.decision() as { options: { key: string }[] }).options[0]!.key);
      await game.settle();
    }
    expect(kw(game)).toEqual(["Assault", "Ganking"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("it turns OFF when the next turn starts: on P2's turn, and on P1's following turn before any discard, Raging Soul is a plain 4 with no Ganking", async () => {
    const game = await board().build();
    await discardVia(game, "ce1");
    expect(kw(game)).toEqual(["Assault", "Ganking"]);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(kw(game)).toEqual([]);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(kw(game)).toEqual([]);
    expect(game.state("soul").might).toBe(4);
    expect(game.p1.can("gank", "soul")).toBe(false);
  });

  test("must discard AGAIN on a future turn to reactivate it: on P1's next turn a fresh Enforcer discard switches Assault + Ganking back on", async () => {
    const game = await board().build();
    await discardVia(game, "ce1");
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(kw(game)).toEqual([]);
    await game.p1.tapRunes(2); // P1 channelled runes across the turn starts; the Enforcer costs [2]
    await discardVia(game, "ce2");
    expect(kw(game)).toEqual(["Assault", "Ganking"]);
    expect(game.p1.can("gank", "soul")).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
