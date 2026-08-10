/**
 * Ruling 55d980416e472556 — Brynhir Thundersong (OGN-026 → ogn-026-298) · Unit · Fury · [6] · 5 Might
 *     "When you play me, opponents can't play cards this turn."
 *   × Star-Crossed (UNL-128 → unl-128-219) · Reaction · [3][chaos] · "Return a friendly unit and an enemy unit to their owners' hands."
 *   (+ Discipline ogn-058-298 · Reaction · [2] as the card P2 is later locked out of; Hextech Ray ogn-009-298 as P1's follow-up.)
 *
 * Q: Does Star-Crossed on Brynhir Thundersong prevent the Brynhir effect?
 * A: No. Once her play trigger is on the chain it is independent of her. Star-Crossed (LIFO) resolves first and returns her
 *    to hand, but the trigger still resolves right after and opponents can't play cards for the rest of the turn.
 * Rules: 383 / 359 (a triggered ability on the chain resolves regardless of its source leaving play), 336–340 (LIFO), FAQ #10679.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BRYNHIR = "ogn-026-298";
const STAR_CROSSED = "unl-128-219";
const DISCIPLINE = "ogn-058-298";
const HEXTECH_RAY = "ogn-009-298";

/**
 * P1's turn. P1: Brynhir + Hextech Ray in hand, [7] + [fury]. P2: Pal (2) at P2's bf1, Star-Crossed + Discipline in hand with
 * [5] + [chaos] (Star-Crossed [3][chaos] now, [2] left for Discipline later).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { fury: 1 } })
    .resources(P2, { energy: 5, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Pal" }, "pal")
    .unit(P2, "bf1", { might: 4, name: "Anchor" }, "anchor")
    .hand(P1, BRYNHIR, "brynhir")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P2, STAR_CROSSED, "sc")
    .hand(P2, DISCIPLINE, "disc");
}

/** P1 plays Brynhir; with her trigger on the chain P2 answers with Star-Crossed (Pal + Brynhir). */
async function starCrossedOnBrynhir(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("brynhir");
  expect(game.zoneOf("brynhir")).toBe("base");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "brynhir", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "sc")).toBe(true); // the lock is not in force yet — only on the chain
  await game.p2.cast("sc", { targets: ["pal", "brynhir"] });
  expect(game.p2.resources()).toEqual({ energy: 2, power: { chaos: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["brynhir", "sc"]);
  return game;
}

describe("Ruling 55d980416e472556 — bouncing Brynhir with Star-Crossed does not stop her trigger", () => {
  test("LIFO: Star-Crossed resolves first — Brynhir goes back to P1's hand and the Pal to P2's — while her trigger is STILL on the chain", async () => {
    const game = await starCrossedOnBrynhir();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Star-Crossed resolves
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("brynhir")).toBe("hand");
    expect(game.p1.hand()).toContain("brynhir");
    expect(game.zoneOf("pal")).toBe("hand");
    expect(game.p2.hand()).toContain("pal");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "brynhir", controller: P1, triggered: true })]); // independent of its source
  });

  test("the orphaned trigger then resolves anyway: for the rest of the turn P2 cannot play cards — given priority on P1's Hextech Ray, P2's affordable Discipline is illegal", async () => {
    const game = await starCrossedOnBrynhir();
    await game.settle(); // Star-Crossed, then the trigger
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("brynhir")).toBe("hand");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.p1.cast("ray", { targets: "anchor" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.energy()).toBe(2); // could afford Discipline [2] …
    expect(game.p2.can("cast", "disc")).toBe(false); // … but "opponents can't play cards this turn"
    const r = await game.p2.try((p) => p.cast("disc", { targets: "anchor" }));
    expect(r.ok).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("control: the lock is this turn only — on P2's own next turn Discipline is playable again", async () => {
    const game = await starCrossedOnBrynhir();
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.tapRunes(2);
    expect(game.p2.can("cast", "disc")).toBe(true);
  });
});
