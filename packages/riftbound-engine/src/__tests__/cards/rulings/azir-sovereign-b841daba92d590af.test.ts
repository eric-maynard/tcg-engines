/**
 * Ruling b841daba92d590af — Azir, Sovereign (SFD-177 → sfd-177-221) · 4 Might
 *   "When I attack, you may move any number of your token units to this battlefield."
 *   × a [Reaction] that removes / recalls / relocates Azir while his trigger is on the chain (the ruling
 *     names "Fate's Fortune", which has no printed card in this pool — inline Reaction spells stand in).
 *
 * Q: Azir's attack trigger is on the chain and he is removed or moved before it resolves. Do the token
 *    units still move to the battlefield?
 * A: "This battlefield" is read from where Azir is NOW. Removed ⇒ the trigger whiffs. Moved to another
 *    battlefield ⇒ the tokens go to that NEW battlefield. Moved to base ⇒ it whiffs (he is at no
 *    battlefield). The "any number" targets are named as the trigger goes on the chain.
 * Rules: 402.2 (targets are chosen while the item is Finalized), 359.3.e.5/359.3.e.7 (a resolution re-reads
 *        its objects; an unidentifiable one does nothing), 383.3.a (a leading "you may" is opted into at
 *        Finalization).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AZIR_SOVEREIGN = "sfd-177-221";
const RECRUIT = "ogn-271-298"; // 1-Might Recruit unit token

const reaction = (name: string, effect: Record<string, unknown>) =>
  ({
    abilities: [{ effect, timing: "reaction", type: "spell" }],
    cardType: "spell",
    domain: "fury",
    energyCost: 1,
    name,
    timing: "reaction",
  }) as const;

const SNIPE = reaction("Snipe", { target: { type: "unit" }, type: "kill" });
const REWIND = reaction("Rewind", { target: { type: "unit" }, type: "recall" });
const SHIFT = reaction("Shift", { target: { type: "unit" }, to: "choose", type: "move" });

/**
 * P1's turn. P2 holds bf1 with a stunned 7-Might Guard (so the attack neither conquers nor kills anyone);
 * P1 also holds bf2 and has a Recruit token waiting in base. P2 holds one Reaction.
 */
function board(answer: Record<string, unknown>) {
  return scenario()
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 7, name: "Guard" }, "guard", { stunned: true })
    .unit(P1, "bf2", { might: 1, name: "Keeper" }, "keeper")
    .unit(P1, "base", AZIR_SOVEREIGN, "azir")
    .unit(P1, "base", RECRUIT, "token")
    .hand(P2, answer, "answer");
}

/** Azir attacks bf1, opts into the trigger, names the token, and hands priority to P2. */
async function azirAttacks(answer: Record<string, unknown>): Promise<Game> {
  const game = await board(answer).build();
  await game.p1.move("azir", "bf1");
  // RULING-CONFLICT: riftjudge b841daba92d590af says the "may" is decided on resolution and only the
  // "any number" targets at chain-add; CR 383.3.a says a leading "you may" is opted into while the item is
  // Finalized — engine follows CR, so BOTH questions are asked here, before anyone gets Priority.
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
  await game.p1.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
  await game.p1.pick("token");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "azir", targets: ["token"], triggered: true })]);
  await game.p1.passPriority();
  return game;
}

/** Resolve everything P2 added, leaving Azir's own trigger as the last item on the chain. */
async function resolveTheAnswer(game: Game): Promise<void> {
  while (game.chain().length > 1) {
    await game.acting().passPriority();
  }
}

describe("Ruling b841daba92d590af — Azir's attack trigger reads 'this battlefield' from where Azir is at resolution", () => {
  test("ruling: 'any number' is targeted as the trigger goes on the chain — the token is bound before anyone responds", async () => {
    const game = await azirAttacks(SNIPE);
    expect(game.chain()[0]?.targets).toEqual(["token"]);
    expect(game.locationOf("token")).toBe("base"); // bound, but nothing has moved yet
  });

  test("ruling: Azir removed in response ⇒ the trigger whiffs and the token stays in base", async () => {
    const game = await azirAttacks(SNIPE);
    await game.p2.cast("answer", { targets: "azir" });
    await resolveTheAnswer(game);
    expect(game.zoneOf("azir")).toBe("trash");

    await game.settle();
    expect(game.locationOf("token")).toBe("base");
    expect(game.zoneOf("token")).toBe("base");
  });

  test("ruling: Azir moved to a DIFFERENT battlefield ⇒ the token follows him to the new battlefield", async () => {
    const game = await azirAttacks(SHIFT);
    await game.p2.cast("answer", { targets: "azir" });
    expect(game.decision()).toMatchObject({ kind: "pick", semantics: "destination" });
    await game.acting().pick("battlefield-bf2");
    await resolveTheAnswer(game);
    expect(game.locationOf("azir")).toBe("bf2");

    await game.settle();
    expect(game.locationOf("token")).toBe("bf2");
    expect(game.locationOf("token")).not.toBe("bf1");
  });

  test("ruling: Azir recalled to base ⇒ the trigger whiffs, because he is at no battlefield", async () => {
    const game = await azirAttacks(REWIND);
    await game.p2.cast("answer", { targets: "azir" });
    await resolveTheAnswer(game);
    expect(game.locationOf("azir")).toBe("base");

    await game.settle();
    expect(game.locationOf("token")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("control: left alone, the trigger moves the token to Azir's battlefield", async () => {
    const game = await azirAttacks(SNIPE);
    await game.p2.passPriority(); // the trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("token")).toBe("bf1");
    expect(game.state("token").combatRole).toBe("attacker");
  });
});
