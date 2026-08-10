/**
 * Ruling 7f564002d55241a2 — Gust (OGN-169 → ogn-169-298) · Reaction · 1 "Return a unit at a battlefield with 3 [Might] or less to its
 *     owner's hand."
 *   × Vi, Peacekeeper (UNL-176 → unl-176-219) · 5+[order] · 5 Might "[Ambush] When I attack, [Stun] an enemy unit here."
 *
 * Q: I attack with Vi and her trigger would stun an enemy unit; the opponent responds with Gust. Does the stun still happen?
 * A: It depends on what is Gusted, but either way no:
 *    Outcome 1 — Gust returns Vi herself: when the trigger resolves its source is no longer at the battlefield, "here" can't be
 *      established, and the stun does not resolve.
 *    Outcome 2 — Gust returns the unit she chose: that unit is no longer there, so it is an illegal target and the stun fails
 *      (nothing else gets stunned instead).
 * Rules: 359.3.e.9 / 359.3.e.12 (target/source legality rechecked on resolution), 340 (LIFO), 376–378 (attack trigger on the chain).
 * (Gust needs ≤ 3 Might, so for Outcome 1 Vi carries a -2 Might modifier this turn — e.g. from an earlier debuff — making her 3.)
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const VI = "unl-176-219";

/** P1's turn. P2 holds bf1 with Target (3) and Other (2), Gust in hand + [1]. P1's Vi (5 − 2 = 3 this turn) in base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Target" }, "target")
    .unit(P2, "bf1", { might: 2, name: "Other" }, "other")
    .unit(P1, "base", VI, "vi", { mightModifier: -2 })
    .hand(P2, GUST, "gust")
    .resources(P2, { energy: 1 });
}

/** Vi attacks bf1; her "When I attack" trigger goes on the chain choosing Target; P1 passes priority to P2. */
async function viAttacksChoosingTarget(): Promise<Game> {
  const game = await board().build();
  expect(game.state("vi").might).toBe(3);
  await game.p1.move("vi", "bf1", { answers: ["target"] });
  if (game.decision()?.kind === "pick") {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("target");
  }
  expect(game.locationOf("vi")).toBe("bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", controller: P1, targets: ["target"], triggered: true })]);
  expect(game.state("target").isStunned).toBe(false);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "gust")).toBe(true);
  return game;
}

/** Cast Gust at `whom`, then resolve the whole chain (Gust first, then Vi's trigger). */
async function gustAndResolve(game: Game, whom: "vi" | "target"): Promise<void> {
  await game.p2.cast("gust", { targets: whom });
  expect(game.chain().map((c) => c.cardId)).toEqual(["vi", "gust"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Gust resolves
  expect(game.zoneOf("gust")).toBe("trash");
  expect(game.zoneOf(whom)).toBe("hand");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", triggered: true })]); // the stun still has to resolve
  for (let i = 0; i < 4 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d?.kind === "pick") {
      break; // (would be a re-target prompt — the assertions below catch it)
    } else {
      break;
    }
  }
}

describe("Ruling 7f564002d55241a2 — Gust in response to Vi, Peacekeeper's attack trigger: no stun either way", () => {
  test("Outcome 1 — Gust returns Vi: her trigger then resolves with its source gone from the battlefield ('here' undefined) → Target is NOT stunned (nor anything else)", async () => {
    const game = await viAttacksChoosingTarget();
    await gustAndResolve(game, "vi");
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).not.toBe("pick"); // nobody is asked to re-aim the stun
    expect(game.zoneOf("vi")).toBe("hand");
    expect(game.p1.hand()).toContain("vi");
    expect(game.state("target")).toMatchObject({ isStunned: false, zone: "battlefield-bf1" });
    expect(game.state("other")).toMatchObject({ isStunned: false, zone: "battlefield-bf1" });
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("Outcome 2 — Gust returns the chosen Target: the trigger resolves against an illegal (absent) target → the stun fails; Other is not stunned in its place", async () => {
    const game = await viAttacksChoosingTarget();
    await gustAndResolve(game, "target");
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).not.toBe("pick");
    expect(game.zoneOf("target")).toBe("hand");
    expect(game.p2.hand()).toContain("target");
    expect(game.state("target").isStunned).toBe(false);
    expect(game.state("other")).toMatchObject({ isStunned: false, zone: "battlefield-bf1" });
    expect(game.locationOf("vi")).toBe("bf1"); // Vi is still attacking; only her stun fizzled
    expect(game.violations()).toEqual([]);
  });

  test("control: unanswered, the trigger stuns the chosen Target", async () => {
    const game = await viAttacksChoosingTarget();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("target").isStunned).toBe(true);
    expect(game.state("other").isStunned).toBe(false);
  });
});
