/**
 * Interaction: Eclipse Herald (ogn-059-298) · Unit · Calm · 7 + [calm] · 7 Might
 *     "When you stun an enemy unit, ready me and give me +1 [Might] this turn."       — P1's, EXHAUSTED in base
 *   × Solari Shieldbearer (ogn-051-298) · Unit · Calm · 3 · 2 Might
 *     "When you play me, stun a unit."                                                — in P1's hand
 *   × Rune Prison (ogn-050-298) · Spell · Calm · 2 + [calm] · [Action] "Stun a unit."  — in P1's hand
 *   P2 has two unstunned units X and Y at bf1.
 *
 * Question. On P1's turn: (a) P1 plays Shieldbearer, its play trigger stuns X — does the Herald ready and
 * go to 8? (b) P1 then casts Rune Prison choosing X AGAIN (already stunned) — is X a legal target, does
 * anything happen to X, does the Herald trigger a second time (re-ready after being re-exhausted / 9)?
 * (c) Control: Rune Prison on Y instead — Herald triggers again (8 → 9). End of turn: stuns and +1s expire.
 *
 * Rules: 423.1 (stunning), 423.1.a (binary), 423.1.a.1 (a stunned unit can't be stunned again — the rule's
 * own Eclipse Herald example: an already-stunned unit MAY be chosen but the Herald does not trigger),
 * 423.1.a.2 (stun drops at end-of-turn 3d), 415.1.c (ready an already-ready unit: nothing happens),
 * 383.3 (triggered abilities go on the chain), 317.2.c ('this turn' effects expire at 3d).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ECLIPSE_HERALD = "ogn-059-298";
const SOLARI_SHIELDBEARER = "ogn-051-298";
const RUNE_PRISON = "ogn-050-298";

function targetsOffered(game: Game, alias: string): string[] {
  const opt = game.p1.option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** P1's turn. Herald exhausted in base; Shieldbearer + Rune Prison in hand with exactly enough to pay both. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 + 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", ECLIPSE_HERALD, "herald", { exhausted: true })
    .unit(P2, "bf1", { might: 3, name: "X" }, "x")
    .unit(P2, "bf1", { might: 3, name: "Y" }, "y")
    .hand(P1, SOLARI_SHIELDBEARER, "solari")
    .hand(P1, RUNE_PRISON, "prison");
}

/** (a) Play Shieldbearer to base and stun X with its play trigger; settle everything. */
async function afterShieldbearerStunsX(): Promise<Game> {
  const game = await board().build();
  expect(game.state("herald")).toMatchObject({ isExhausted: true, might: 7 });
  await game.p1.play("solari", { answers: ["x"] });
  const stop = await game.settle();
  if (stop.reason === "unanswered") {
    await game.p1.pick("x");
    await game.settle();
  }
  return game;
}

describe("(a) Shieldbearer's play trigger stuns X → Herald readies and goes to 8", () => {
  test("X becomes Stunned (423.1), Y does not; Shieldbearer is in base", async () => {
    const game = await afterShieldbearerStunsX();
    expect(game.zoneOf("solari")).toBe("base");
    expect(game.state("x").isStunned).toBe(true);
    expect(game.state("y").isStunned).toBe(false);
  });

  test("that stun is by P1 on an ENEMY unit → Herald's trigger resolves: exhausted → ready, 7 → 8", async () => {
    const game = await afterShieldbearerStunsX();
    expect(game.chain()).toEqual([]);
    expect(game.state("herald")).toMatchObject({ isReady: true, might: 8 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

describe("(b) Rune Prison on the ALREADY-stunned X: legal target, resolves, but no stun event → Herald does NOT trigger", () => {
  test("X (stunned) is still 'a unit' — Rune Prison offers X alongside Y, the Herald and Shieldbearer, and is castable on X", async () => {
    const game = await afterShieldbearerStunsX();
    expect(game.p1.can("cast", "prison")).toBe(true);
    const offered = targetsOffered(game, "prison").sort();
    expect(offered).toEqual(["herald", "solari", "x", "y"].sort());
  });

  test("casting it on X pays 2 + [calm], puts it on the chain targeting X, and it resolves to the trash (counts as played)", async () => {
    const game = await afterShieldbearerStunsX();
    await game.p1.cast("prison", { targets: "x" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "prison", controller: P1, targets: ["x"], triggered: false })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("prison")).toBe("trash");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2); // Shieldbearer + Rune Prison
  });

  test("X stays stunned (single binary flag, 423.1.a) — nothing else about X changes", async () => {
    const game = await afterShieldbearerStunsX();
    const before = game.state("x");
    await game.p1.cast("prison", { targets: "x" });
    await game.settle();
    expect(game.state("x")).toMatchObject({ damage: before.damage, isExhausted: before.isExhausted, isStunned: true, might: before.might, zone: before.zone });
  });

  test("no stun occurred (423.1.a.1) → the Herald's trigger never goes on the chain: Herald stays ready and stays at 8 (not 9)", async () => {
    const game = await afterShieldbearerStunsX();
    await game.p1.cast("prison", { targets: "x" });
    // Watch the chain while it resolves: only Rune Prison itself, never a Herald trigger.
    const seen = new Set<string>();
    for (let i = 0; i < 10 && game.chain().length > 0; i++) {
      for (const item of game.chain()) {
        seen.add(`${item.cardId}${item.triggered ? ":trigger" : ""}`);
      }
      await game.acting().pass();
    }
    await game.settle();
    expect([...seen]).toEqual(["prison"]);
    expect(game.state("herald")).toMatchObject({ isReady: true, might: 8 });
  });

  test("…and if the Herald had been re-exhausted before the re-'stun', it is NOT readied again", async () => {
    const game = await board()
      .battlefield("bf2", { controller: null })
      .build();
    await game.p1.play("solari", { answers: ["x"] });
    let stop = await game.settle();
    if (stop.reason === "unanswered") {
      await game.p1.pick("x");
      stop = await game.settle();
    }
    expect(game.state("herald")).toMatchObject({ isReady: true, might: 8 });
    // Re-exhaust the Herald by moving it to the empty bf2 (standard move exhausts, rule 141.3).
    await game.p1.move("herald", "bf2");
    await game.settle();
    expect(game.state("herald")).toMatchObject({ isExhausted: true, might: 8, zone: "battlefield-bf2" });
    await game.p1.cast("prison", { targets: "x" });
    await game.settle();
    expect(game.state("x").isStunned).toBe(true);
    expect(game.state("herald")).toMatchObject({ isExhausted: true, might: 8 });
  });
});

describe("(c) control — Rune Prison on the UNSTUNNED Y: a real stun → Herald triggers a second time this turn", () => {
  test("Y becomes stunned; Herald trigger resolves again: ready (no-op, 415.1.c) and 8 → 9", async () => {
    const game = await afterShieldbearerStunsX();
    await game.p1.cast("prison", { targets: "y" });
    await game.settle();
    expect(game.state("y").isStunned).toBe(true);
    expect(game.state("x").isStunned).toBe(true);
    expect(game.state("herald")).toMatchObject({ isReady: true, might: 9 });
  });

  test("re-exhausted Herald + Rune Prison on Y: this time it DOES ready again (contrast with (b))", async () => {
    const game = await board()
      .battlefield("bf2", { controller: null })
      .build();
    await game.p1.play("solari", { answers: ["x"] });
    let stop = await game.settle();
    if (stop.reason === "unanswered") {
      await game.p1.pick("x");
      stop = await game.settle();
    }
    await game.p1.move("herald", "bf2");
    await game.settle();
    expect(game.state("herald")).toMatchObject({ isExhausted: true, might: 8 });
    await game.p1.cast("prison", { targets: "y" });
    await game.settle();
    expect(game.state("y").isStunned).toBe(true);
    expect(game.state("herald")).toMatchObject({ isReady: true, might: 9 });
  });

  test("end of turn 3d: both stuns and both +1s expire simultaneously (423.1.a.2, 317.2.c) — Herald back to 7, X and Y un-stunned", async () => {
    const game = await afterShieldbearerStunsX();
    await game.p1.cast("prison", { targets: "y" });
    await game.settle();
    expect(game.state("herald").might).toBe(9);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("herald").might).toBe(7);
    expect(game.state("x").isStunned).toBe(false);
    expect(game.state("y").isStunned).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
