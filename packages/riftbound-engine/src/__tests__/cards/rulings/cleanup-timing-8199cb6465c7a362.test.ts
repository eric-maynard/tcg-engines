/**
 * Ruling 8199cb6465c7a362 — (general Cleanup timing; exercised with Ruined Rex, UNL-067 → unl-067-219 ·
 *   6 Might · "[Deathknell][>] Deal 4 to an enemy unit. (When I die, get the effect.)")
 *
 * Q: Can a Cleanup happen while I am finalizing a card or ability?
 * A: No. Finalizing is a step of FEPR (Finalize, Execute, Pass, Resolve). Cleanups run BETWEEN the steps —
 *    after an item is added to the chain, after it is finalized and after it resolves — and each one pauses
 *    FEPR until it is done. None ever runs inside a step, so nothing is swept away while a finalization choice
 *    is still open.
 * Rules: 320 / 320.1 (Cleanups run between steps, never inside one), 337 (FEPR), 383.3.a-b / 402 (a triggered
 *        item is finalized — its choices made — when it is queued), 323.6 / 190.4 (control lapses at a Cleanup
 *        in an OPEN State: an unanswered prompt or a live chain is not one).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUINED_REX = "unl-067-219";

/** [Action] "Kill a unit." */
const CULL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  name: "Test Cull",
  powerCost: [],
  rulesText: "[Action] Kill a unit.",
  timing: "action",
} as const;

/** P1's turn: P1 holds bf1 with a lone Ruined Rex; P2 has two units at bf2 so the Deathknell's choice is real. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", RUINED_REX, "rex")
    .unit(P2, "bf2", { might: 5, name: "Sentry" }, "sentry")
    .unit(P2, "bf2", { might: 5, name: "Warden" }, "warden")
    .hand(P1, CULL, "cull");
}

/** Kill my own Rex and stop the moment its Deathknell asks which enemy unit to burn. */
async function atFinalizationPrompt(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("cull", { targets: "rex" });
  await game.p1.passPriority();
  await game.p2.passPriority(); // the Cull resolves
  return game;
}

describe("Ruling 8199cb6465c7a362 — Cleanups run between the FEPR steps, never during one", () => {
  test("after the spell resolves a Cleanup HAS run — the dead unit is already in the trash — and the Deathknell is being finalized", async () => {
    const game = await atFinalizationPrompt();
    expect(game.zoneOf("rex")).toBe("trash");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["sentry", "warden"]);
    }
  });

  test("while that finalization choice is open, no Cleanup runs: bf1 has no unit of mine left, yet control has NOT lapsed", async () => {
    const game = await atFinalizationPrompt();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("answering it does not run a Cleanup either — the finalized item goes on the chain and control is still mine", async () => {
    const game = await atFinalizationPrompt();
    await game.p1.pick("sentry");
    expect(game.chain().map((c) => c.cardId)).toEqual(["rex"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("only once the chain has emptied does the next Cleanup run in an Open State — then the empty battlefield is lost", async () => {
    const game = await atFinalizationPrompt();
    await game.p1.pick("sentry");
    await game.settle();
    expect(game.state("sentry").damage).toBe(4); // the Deathknell resolved
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
