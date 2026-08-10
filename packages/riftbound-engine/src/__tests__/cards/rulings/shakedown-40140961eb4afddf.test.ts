/**
 * Ruling 40140961eb4afddf — Shakedown (OGN-033 → ogn-033-298) · Reaction spell · Fury · [2]+[fury]
 *     "Choose an enemy unit. Deal 6 to it unless its controller has you draw 2."
 *   × Retreat (OGN-104 → ogn-104-298) · Reaction · [1] · "Return a friendly unit to its owner's hand. Its owner channels 1
 *     rune exhausted."
 *
 * Q: My opponent Shakedowns my unit and I Retreat it in response — can they choose a different target?
 * A: No. The enemy unit was chosen when Shakedown was played; a response removing it does not reopen the choice.
 * Rules: 355.5 (targets are chosen as the spell is finalized), 359.3.f (illegal/missing target on resolution → no
 *        new choice is made; that part simply doesn't happen).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHAKEDOWN = "ogn-033-298";
const RETREAT = "ogn-104-298";

/** P1's turn with exactly [2] + fury and Shakedown. P2: Alpha + Bravo (7 Might each) in base, Retreat in hand with [1]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .resources(P2, { energy: 1 })
    .unit(P2, "base", { might: 7, name: "Alpha" }, "a")
    .unit(P2, "base", { might: 7, name: "Bravo" }, "b")
    .hand(P1, SHAKEDOWN, "shake")
    .hand(P2, RETREAT, "retreat");
}

/** Shakedown → Alpha; P2 Retreats Alpha in response; Retreat resolves (Alpha → hand), Shakedown still on the chain. */
async function shakedownThenRetreat(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("shake", { targets: "a" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shake", targets: ["a"] })]);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  await game.p1.passPriority();
  await game.p2.cast("retreat", { targets: "a" });
  await game.p2.passPriority();
  await game.p1.passPriority(); // Retreat resolves
  expect(game.zoneOf("a")).toBe("hand");
  return game;
}

/** Drain to the open main phase, recording prompts; answers any P2 "unless" mode prompt with "Deal 6 to it". */
async function drain(game: Game): Promise<Decision[]> {
  const prompts: Decision[] = [];
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    prompts.push(d);
    if (d.kind === "pick" && d.seat === P2 && d.semantics === "mode") {
      const deal = d.options.find((o) => /deal 6/i.test(o.label)) ?? d.options[0];
      await game.p2.pick(deal?.key as string);
    } else {
      break;
    }
  }
  return prompts;
}

describe("Ruling 40140961eb4afddf — Retreating Shakedown's chosen unit does not let the caster pick a new one", () => {
  test("after Retreat resolves, Shakedown still records its ORIGINAL choice (Alpha) and the next window is plain priority — not a re-targeting prompt for P1", async () => {
    const game = await shakedownThenRetreat();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shake", targets: ["a"] })]);
    const d = game.decision();
    expect(d?.kind).toBe("action");
    expect(d && d.kind === "action" ? d.context : undefined).toBe("chain");
  });

  test("Shakedown resolves without P1 ever being offered Bravo (or anything) as a replacement; Bravo is untouched, Alpha sits safely in hand, nothing was refunded", async () => {
    const game = await shakedownThenRetreat();
    const prompts = await drain(game);
    const p1Retarget = prompts.filter((p) => p.seat === P1 && p.kind === "pick");
    expect(p1Retarget).toEqual([]);
    expect(prompts.some((p) => p.kind === "pick" && p.options.some((o) => (o.card ?? o.key) === "b"))).toBe(false);
    expect(game.zoneOf("shake")).toBe("trash");
    expect(game.zoneOf("b")).toBe("base");
    expect(game.state("b").damage).toBe(0);
    expect(game.zoneOf("a")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // Expected: with its only chosen unit gone (in hand), Shakedown resolves doing nothing — no "unless" choice for
  // Alpha's controller and certainly no damage marked on a card in hand (359.3.f). Actual: the engine still asks P2
  // to choose the mode and, on "Deal 6 to it", marks 6 damage on Alpha while it sits in P2's hand.
  test("ruling 40140961eb4afddf — engine still asks the 'unless' mode and marks 6 damage on the Retreated card in hand", async () => {
    const game = await shakedownThenRetreat();
    const prompts = await drain(game);
    expect(game.zoneOf("shake")).toBe("trash");
    expect(prompts.filter((p) => p.kind === "pick" && p.semantics === "mode")).toEqual([]);
    expect(game.zoneOf("a")).toBe("hand");
    expect(game.state("a").damage).toBe(0);
  });

  test("control — no response: Alpha's controller P2 is the one who chooses (deal 6 vs let P1 draw 2); choosing damage puts 6 on Alpha", async () => {
    const game = await board().build();
    await game.p1.cast("shake", { targets: "a" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "mode" });
    const deal = d?.kind === "pick" ? d.options.find((o) => /deal 6/i.test(o.label)) : undefined;
    expect(deal).toBeDefined();
    await game.p2.pick(deal?.key as string);
    await game.settle();
    expect(game.state("a").damage).toBe(6);
    expect(game.state("b").damage).toBe(0);
  });
});
