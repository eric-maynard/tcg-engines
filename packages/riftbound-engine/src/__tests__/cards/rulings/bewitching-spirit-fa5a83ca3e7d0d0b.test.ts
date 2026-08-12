/**
 * Ruling fa5a83ca3e7d0d0b — Bewitching Spirit (UNL-121 → unl-121-219) · [3] 2 [Might]
 *   "When you play me, choose a player. They discard 1."
 *
 * Q: Can my opponent react to the DISCARD?
 * A: No. The unit entering the board uses no chain; its "when you play me" ability does go on the chain and
 *    THAT can be answered with a Reaction. But once the ability resolves, the discard happens inside that
 *    resolution — discarding is not playing a card, nothing triggers off it, and no priority window opens.
 * Rules: 340 (priority only between chain items), 383 (triggered ability on the chain), 421 (discard is a
 *        game action performed during resolution), RiftJudge FAQ #10064 / #9894.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BEWITCHING_SPIRIT = "unl-121-219";

/** A [Reaction] "draw 1" P2 holds so we can prove there IS a window on the trigger and none on the discard. */
const REFLEX = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  name: "Reflex",
  timing: "reaction",
} as const;

/** P1's turn. P1 has [3] and the Spirit; P2 holds two cards (one is the Reaction) and [1]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 1 })
    .hand(P1, BEWITCHING_SPIRIT, "spirit")
    .hand(P2, REFLEX, "reflex")
    .hand(P2, { cardType: "spell", energyCost: 1, name: "Doomed" }, "doomed");
}

/**
 * Play the Spirit; it enters the board and its trigger sits on the chain. "Choose a player" is a mode picked when
 * the trigger is FINALIZED (rule 355.3 / 402), before anyone gets priority — so it is answered here.
 */
async function playSpirit(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("spirit", { to: "base" });
  expect(game.zoneOf("spirit")).toBe("base"); // the unit itself never used the chain
  expect(game.chain().map((c) => c.cardId)).toEqual(["spirit"]);
  expect(game.chain()[0]).toMatchObject({ triggered: true });
  const mode = game.decision();
  expect(mode).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
  await game.p1.chooseMode(0); // "Opponent discards 1"
  return game;
}

describe("Ruling fa5a83ca3e7d0d0b — the trigger is answerable, the discard inside it is not", () => {
  test("the unit enters without the chain; only its 'when you play me' ability goes on the chain", async () => {
    const game = await playSpirit();
    expect(game.p1.base()).toContain("spirit");
    expect(game.chain()).toHaveLength(1);
  });

  test("there IS a priority window on the trigger — P2 may answer it with a Reaction", async () => {
    const game = await playSpirit();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "reflex")).toBe(true);
  });

  test("once both pass, the ability resolves and P2 is asked WHICH card — a resolution pick, not a priority window", async () => {
    const game = await playSpirit();
    await game.p1.passPriority();
    await game.p2.passPriority();
    const which = game.decision();
    expect(which).toMatchObject({ kind: "pick", seat: P2, timing: "RES" });
    expect(which?.kind === "action").toBe(false); // no menu of plays: the discard is mid-resolution
    expect(game.p2.can("cast", "reflex")).toBe(false); // the Reaction window has closed
    expect(game.zoneOf("reflex")).toBe("hand");
  });

  test("answering that pick performs the discard immediately — chain empty, straight back to P1's main phase", async () => {
    const game = await playSpirit();
    await game.p1.passPriority();
    await game.p2.passPriority();
    const p2HandBefore = game.p2.hand().length;
    await game.p2.pick("doomed");
    expect(game.p2.hand()).toHaveLength(p2HandBefore - 1);
    expect(game.p2.trash()).toEqual(["doomed"]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
