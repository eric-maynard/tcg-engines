/**
 * Ruling 1acded3be12088b8 — Promising Future (OGN-115 → ogn-115-298) · Spell · Mind · [5]+[mind]
 *     "Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles the rest. Starting with
 *      the next player, each player plays those cards, ignoring Energy costs. (They must still pay Power costs.)"
 *   × Singularity (OGN-105 → ogn-105-298) · Spell · [6]+[mind][mind] · "Deal 6 to each of up to two units."
 *   × Lady of Luminosity (ogs-021-024, Legend) · "When you play a spell that costs [5] or more, draw 1."
 *
 * Q: Timing when Promising Future's banished cards become pending plays: when does Lady of Luminosity's trigger (for
 *    Promising Future) hit the chain, and can the caster's Singularity target the opponent's freshly chosen unit?
 * A: As Promising Future resolves, LoL's trigger for it becomes pending on TOP of the chain before the banished cards
 *    finalize; the opponent (next player) finalizes their unit first — permanents resolve immediately — then Singularity
 *    finalizes and may target that unit. The chain then resolves top-down: LoL trigger → Singularity → (Singularity, cost 6,
 *    triggers LoL again).
 * Rules: 358 (playing cards during resolution; permanents resolve on finalization), 337 / 340 (pending items, LIFO),
 *        383 / 419.4 (play-triggers), 355.5 (targets chosen at finalization).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PROMISING_FUTURE = "ogn-115-298";
const SINGULARITY = "ogn-105-298";
const LADY_OF_LUMINOSITY = "ogs-021-024";
const U = (n: number) => ({ cardType: "unit", energyCost: 3, might: n, name: `Future ${n}` });

type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * P1's turn with Lady of Luminosity as legend and exactly [5] + 3 mind (Promising Future's pip + Singularity's two).
 * P1: Bystander (7) in base (so "up to two units" is a real choice). P1's top 5: Singularity + four units.
 * P2's top 5: Newcomer (3) + four units; P2 has no resources (Energy is ignored, the unit has no Power cost).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { mind: 3 } })
    .battlefield("bf1", { controller: null })
    .legend(P1, LADY_OF_LUMINOSITY, "lol")
    .unit(P1, "base", { might: 7, name: "Bystander" }, "mine")
    .deck(P1, [SINGULARITY, U(2), U(3), U(4), U(5), U(6)], ["sing", "a2", "a3", "a4", "a5", "a6"])
    .deck(P2, [{ cardType: "unit", energyCost: 3, might: 3, name: "Newcomer" }, U(2), U(1), U(4), U(5), U(6)], ["newcomer", "b2", "b1", "b4", "b5", "b6"])
    .hand(P1, PROMISING_FUTURE, "pf");
}

/** Cast Promising Future, resolve it, P1 banishes Singularity, P2 banishes the Newcomer; answer P2's placement if asked. */
async function futureResolvedBothChosen(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("pf");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 2 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  expect((game.decision() as Pick).options.map((o) => o.key).sort()).toEqual(["a2", "a3", "a4", "a5", "sing"]);
  await game.p1.pick("sing");
  expect(game.zoneOf("sing")).toBe("banishment");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
  expect((game.decision() as Pick).options.map((o) => o.key).sort()).toEqual(["b1", "b2", "b4", "b5", "newcomer"]);
  await game.p2.pick("newcomer");
  for (let i = 0; i < 3; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      await game.p2.answer({ keys: [d.options[0]!.key], kind: "pick" }); // where the Newcomer goes
    } else {
      break;
    }
  }
  return game;
}

/** Answer Singularity's "up to two units" whenever the engine asks: the Newcomer only. Returns the prompt if one was seen. */
async function answerSingularityTargets(game: Game): Promise<Pick | undefined> {
  let seen: Pick | undefined;
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind !== "pick" || d.seat !== P1) {
      break;
    }
    if (d.options.some((o) => (o.card ?? o.key) === "newcomer")) {
      seen ??= d;
      await game.p1.pick("newcomer");
    } else if (d.allowDecline) {
      await game.p1.decline(); // no second target
    } else {
      break;
    }
  }
  return seen;
}

async function passBoth(game: Game): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    await game.seat(d!.seat).passPriority();
  }
}

describe("Ruling 1acded3be12088b8 — Promising Future: LoL trigger on top, opponent's unit lands first, Singularity can target it", () => {
  test("second pass starts with the NEXT player: P2's Newcomer is finalized first and — being a permanent — is already on the board (Energy ignored) while P1's Singularity becomes a chain item paid with [mind][mind] only", async () => {
    const game = await futureResolvedBothChosen();
    await answerSingularityTargets(game);
    expect(game.zoneOf("newcomer")).toBe("base");
    expect(game.state("newcomer")).toMatchObject({ controller: P2, location: "base" });
    expect(game.p2.energy()).toBe(0);
    expect(game.zoneOf("sing")).toBe("chain");
    expect(game.chain().find((c) => c.cardId === "sing")).toMatchObject({ controller: P1, triggered: false, type: "spell" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // [6] ignored, two mind paid
  });

  test("chain shape once everything is finalized: Singularity BELOW, Lady of Luminosity's trigger (for Promising Future) on TOP — P1 gets priority", async () => {
    const game = await futureResolvedBothChosen();
    await answerSingularityTargets(game);
    expect(game.chain().map((c) => c.cardId)).toEqual(["sing", "lol"]);
    expect(game.chain()[1]).toMatchObject({ cardId: "lol", controller: P1, triggered: true });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  // Expected (ruling / 355.5): Singularity's "up to two units" are chosen as it FINALIZES — right after the Newcomer landed
  // and before anyone gets priority — so P1 is asked then (Newcomer + Bystander offered) and the chain item carries its
  // targets while LoL's trigger is still above it.
  test("ruling 1acded3be12088b8 — Singularity's targets are asked when it finalizes under the pending LoL trigger, not at resolution", async () => {
    const game = await futureResolvedBothChosen();
    const prompt = await answerSingularityTargets(game);
    expect(prompt).toBeDefined();
    expect(prompt!.options.map((o) => o.card ?? o.key).sort()).toEqual(["mine", "newcomer"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["sing", "lol"]);
    expect(game.chain()[0]!.targets ?? []).toEqual(["newcomer"]);
  });

  test("resolution runs top-down: LoL trigger (P1 draws 1) → Singularity (the Newcomer IS a legal choice; 6 kills it, Bystander untouched) → Singularity itself ([6] ≥ [5]) triggers LoL again (P1 draws 1 more)", async () => {
    const game = await futureResolvedBothChosen();
    await answerSingularityTargets(game);
    const hand = game.p1.hand().length;
    await passBoth(game); // LoL trigger
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["sing"]);
    expect(game.zoneOf("newcomer")).toBe("base");
    await passBoth(game); // Singularity
    const prompt = await answerSingularityTargets(game); // (engine asks here — see BUG above)
    if (prompt) {
      expect(prompt.options.map((o) => o.card ?? o.key).sort()).toEqual(["mine", "newcomer"]);
    }
    expect(game.zoneOf("newcomer")).toBe("trash");
    expect(game.zoneOf("sing")).toBe("trash");
    expect(game.state("mine").damage).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lol", triggered: true })]); // LoL again, for Singularity
    await passBoth(game);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand + 2);
    expect(game.zoneOf("pf")).toBe("trash");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
    // The unchosen four were recycled to the bottom (P1 has since drawn a6 + one more off the top).
    expect(game.p1.hand()).toContain("a6");
    expect(game.p1.deck().slice(-4).sort()).toEqual(["a2", "a3", "a4", "a5"]);
    expect(game.p2.deck()[0]).toBe("b6");
    expect(game.p2.deck().slice(-4).sort()).toEqual(["b1", "b2", "b4", "b5"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
