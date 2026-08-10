/**
 * Ruling 921359bba6cb923a — Kai'Sa, Survivor (OGN-039 → ogn-039-298) · Unit · Fury · [4] · 4 Might
 *     "[Accelerate] … When I conquer, draw 1."
 *
 * Q: If two Kai'Sa, Survivors move to the same battlefield and conquer it, does the player draw 2?
 * A: Yes. Each Kai'Sa creates its own separate "When I conquer" trigger; the player draws 2 in total.
 * Rules: 383 (each triggered ability triggers separately), 467 / 441 (units present when the battlefield is conquered
 *        "conquer"), 383.3.d (same-controller simultaneous triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KAISA = "ogn-039-298";

/** P1's turn. Two ready Kai'Sas in P1's base; P2 holds bf1 with a 2-Might Guard; P1's deck top is known (d1, d2, d3). */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "base", KAISA, "kaisa1")
    .unit(P1, "base", KAISA, "kaisa2")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** Both Kai'Sas attack bf1 together; drive Focus passes / the Guard's damage split until combat has resolved and triggers are queued. */
async function conquerTogether(): Promise<{ game: Game; conquerItems: string[][] }> {
  const game = await board().build();
  await game.p1.move(["kaisa1", "kaisa2"], "bf1");
  const conquerItems: string[][] = [];
  for (let i = 0; i < 24; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    const triggered = game
      .chain()
      .filter((c) => c.triggered)
      .map((c) => c.cardId)
      .sort();
    if (triggered.length > 0) {
      conquerItems.push(triggered);
    }
    if (d.kind === "action" && d.context === "showdown") {
      await game.seat(d.seat).passFocus();
    } else if (d.kind === "distribute") {
      await game.seat(d.seat).distribute({ kaisa1: 2 });
    } else if (d.kind === "order") {
      await game.acceptTriggerOrder();
    } else if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  return { conquerItems, game };
}

describe("Ruling 921359bba6cb923a — two Kai'Sa, Survivors conquering together draw 2 (two separate triggers)", () => {
  test("both survive the Guard (2 damage onto one 4-Might Kai'Sa), P1 conquers bf1 — and TWO separate triggered items (one per Kai'Sa) hit the chain", async () => {
    const { game, conquerItems } = await conquerTogether();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("kaisa1")).toBe("battlefield-bf1");
    expect(game.zoneOf("kaisa2")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // one conquer of one battlefield
    // At some point both conquer triggers were on the chain at once, as distinct items.
    expect(conquerItems).toContainEqual(["kaisa1", "kaisa2"]);
  });

  test("each trigger draws 1: P1 ends with exactly 2 cards drawn (d1, d2) and d3 left on top", async () => {
    const { game } = await conquerTogether();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand().slice().sort()).toEqual(["d1", "d2"]);
    expect(game.p1.deck()[0]).toBe("d3");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("same on an EMPTY enemy battlefield: both walk in, P1 conquers, two triggers, two draws", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 2, name: "Elsewhere" }, "elsewhere")
      .unit(P1, "base", KAISA, "kaisa1")
      .unit(P1, "base", KAISA, "kaisa2")
      .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"])
      .build();
    await game.p1.move(["kaisa1", "kaisa2"], "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand().slice().sort()).toEqual(["d1", "d2"]);
    expect(game.violations()).toEqual([]);
  });
});
