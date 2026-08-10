/**
 * Ruling f94b24a99ec6f067 — Gust (OGN-169 → ogn-169-298) · Chaos Reaction · [1]
 *   "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Star-Crossed (UNL-128 → unl-128-219) · Chaos Reaction · [3][chaos] — "Return a friendly unit and an enemy unit
 *     to their owners' hands."
 *
 * Q: If I Gust a unit that Star-Crossed targeted, does Star-Crossed still resolve?
 * A: Yes. Gust (on top) resolves first and returns that unit; when Star-Crossed resolves that target is illegal (it left
 *    the board), so only that instruction is skipped — the OTHER target is still returned. It never fizzles entirely.
 *    Symmetric: whichever of the two was Gusted is ignored, the other goes home.
 * Rules: 340 (LIFO), 359.3.e.2 / 359.3.e.4 (target that changed zones is illegal), 359.3.e.8 (partial resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const STAR_CROSSED = "unl-128-219";

/**
 * P1's turn. P1's Ally (2) at P1's bf1; P2's Foe (3) at P2's bf2 — both Gust-sized and at battlefields.
 * P1: Star-Crossed + [3][chaos]. P2: Gust + [1].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "bf2", { might: 3, name: "Foe" }, "foe")
    .hand(P1, STAR_CROSSED, "sc")
    .hand(P2, GUST, "gust");
}

/** P1 casts Star-Crossed [Ally, Foe] and passes; P2 Gusts `gusted` in response. Chain = [sc, gust]. */
async function starCrossedThenGust(gusted: "ally" | "foe"): Promise<Game> {
  const game = await board().build();
  const pairs = game.p1.option("cast", "sc")?.fields.find((f) => f.arg === "targets")?.options ?? [];
  expect(pairs).toContainEqual(["ally", "foe"]); // [friendly, enemy] in card-text order
  await game.p1.cast("sc", { targets: ["ally", "foe"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sc", controller: P1, targets: ["ally", "foe"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "gust")).toBe(true);
  const gustTargets = (game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
  expect(gustTargets.sort()).toEqual(["ally", "foe"]);
  await game.p2.cast("gust", { targets: gusted });
  expect(game.chain().map((c) => c.cardId)).toEqual(["sc", "gust"]); // Gust on top
  return game;
}

describe("Ruling f94b24a99ec6f067 — Star-Crossed partially resolves when Gust removes one of its two targets", () => {
  test("control (no Gust): Star-Crossed returns BOTH Ally and Foe to their owners' hands", async () => {
    const game = await board().build();
    await game.p1.cast("sc", { targets: ["ally", "foe"] });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.zoneOf("foe")).toBe("hand");
    expect(game.p1.hand()).toEqual(["ally"]);
    expect(game.p2.hand().sort()).toEqual(["foe", "gust"]);
  });

  test("Gust on the ENEMY target: Gust resolves first (Foe → P2's hand); Star-Crossed then skips the illegal Foe instruction but still returns Ally", async () => {
    const game = await starCrossedThenGust("foe");
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["sc"]); // Star-Crossed still waiting — not countered/fizzled
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    await game.settle(); // Star-Crossed resolves
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.p1.hand()).toEqual(["ally"]);
    expect(game.p2.hand()).toEqual(["foe"]); // returned once (by Gust) — Star-Crossed did nothing more to it
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Gust on the FRIENDLY target: Ally goes home to P1's hand via Gust; Star-Crossed skips Ally and still returns Foe", async () => {
    const game = await starCrossedThenGust("ally");
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.zoneOf("foe")).toBe("battlefield-bf2");
    expect(game.chain().map((c) => c.cardId)).toEqual(["sc"]);
    await game.settle();
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("hand");
    expect(game.p1.hand()).toEqual(["ally"]);
    expect(game.p2.hand()).toEqual(["foe"]);
    expect(game.violations()).toEqual([]);
  });

  test("no re-targeting: with a second enemy unit available, Star-Crossed does not swap the Gusted Foe for it — Other stays put", async () => {
    const game = await board().unit(P2, "bf2", { might: 4, name: "Other" }, "other").build();
    await game.p1.cast("sc", { targets: ["ally", "foe"] });
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "foe" });
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      expect(d.kind).toBe("action"); // never a re-pick for P1
      await game.seat(d.seat).passPriority();
    }
    expect(game.zoneOf("foe")).toBe("hand");
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.zoneOf("other")).toBe("battlefield-bf2");
  });
});
