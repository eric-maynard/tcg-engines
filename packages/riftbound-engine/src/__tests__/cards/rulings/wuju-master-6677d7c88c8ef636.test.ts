/**
 * Ruling 6677d7c88c8ef636 — "Master Yi, Wuju Bladesman" legend passive × Fiora, Peerless (SFD-110 → sfd-110-221)
 *   The ruling is filed under Wuju Master (UNL-191 → unl-191-219), but the "+2 to a lone defender" passive it describes is
 *   the Yi legend Wuju Bladesman "While a friendly unit defends alone, it gets +2 [Might]" — in our pool ogs-019-024.
 *   Fiora, Peerless · 3 Might "When I attack or defend one on one, double my Might this combat."
 *
 * Q: Defending alone with Fiora under the Yi legend: is it (3 + 2) × 2 = 10, or 3 × 2 + 2 = 8?
 * A: 10. Yi's bonus is a PASSIVE (no chain) that applies the instant Fiora is designated the lone defender (3 → 5); Fiora's
 *    "When I defend" is a TRIGGER on the initial chain and doubles her current Might when it resolves: 5 × 2 = 10.
 * Rules: 364 (passives apply continuously), 383.4.f (defend trigger), 344 (initial chain), arithmetic layering.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WUJU_BLADESMAN = "ogs-019-024";
const FIORA_PEERLESS = "sfd-110-221";

/** P2's turn. P1 (Yi legend) holds bf1 with Fiora alone; P2's 7-Might Brute attacks alone (one on one). */
function board() {
  return scenario()
    .active(P2)
    .legend(P1, WUJU_BLADESMAN, "yi")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", FIORA_PEERLESS, "fiora")
    .unit(P2, "base", { might: 7, name: "Brute" }, "brute");
}

async function bruteAttacks(): Promise<Game> {
  const game = await board().build();
  expect(game.state("fiora").might).toBe(3); // no combat yet: no Yi bonus
  await game.p2.move("brute", "bf1");
  expect(game.state("fiora").combatRole).toBe("defender");
  return game;
}

describe("Ruling 6677d7c88c8ef636 — Yi's passive +2 lands first, then Fiora's trigger doubles: (3 + 2) × 2 = 10", () => {
  test("step 1 — the passive applies immediately on designation, with NO chain item of its own: Fiora is already 5 while her defend trigger is still pending on the initial chain", async () => {
    const game = await bruteAttacks();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fiora", controller: P1, triggered: true })]);
    expect(game.chain().some((c) => c.cardId === "yi")).toBe(false);
    expect(game.state("fiora")).toMatchObject({ baseMight: 3, might: 5 });
  });

  test("step 2–3 — Fiora's trigger resolves off the initial chain and doubles her CURRENT Might: 5 × 2 = 10 (not 8)", async () => {
    const game = await bruteAttacks();
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("fiora").might).toBe(10);
    expect(game.state("fiora").might).not.toBe(8);
    // Still in the showdown, before combat damage.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("the combat bears it out: Fiora (10) beats the 7-Might Brute — Brute dies, Fiora survives, P1 keeps bf1", async () => {
    const game = await bruteAttacks();
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("fiora")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    // After combat both the passive (+2 while defending) and "this combat" doubling are gone.
    expect(game.state("fiora").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("contrast without the legend: Fiora alone doubles 3 → 6 and would lose to the Brute", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", FIORA_PEERLESS, "fiora")
      .unit(P2, "base", { might: 7, name: "Brute" }, "brute")
      .build();
    await game.p2.move("brute", "bf1");
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.state("fiora").might).toBe(6);
    await game.settle();
    expect(game.zoneOf("fiora")).toBe("trash");
  });
});
