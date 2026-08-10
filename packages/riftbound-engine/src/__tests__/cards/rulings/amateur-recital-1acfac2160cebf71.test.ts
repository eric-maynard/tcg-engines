/**
 * Ruling 1acfac2160cebf71 — Amateur Recital (UNL-207 → unl-207-219, Battlefield)
 *   "When you hold here, you may move a unit at a battlefield to its base."
 *   × Not So Fast (sfd-045-221, Reaction, 2 + [calm]) "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *
 * Q: Can Not So Fast counter Amateur Recital's hold ability?
 * A: Yes — if it picks one of YOUR units. Selecting the unit to move is "choosing" it, so an enemy Recital trigger
 *    aimed at your unit is "an enemy ability that chooses a friendly unit". NSF resolves first and counters it; the
 *    countered ability does nothing and leaves the chain (425.1.a).
 * Rules: 355 (choosing = targeting even without the word "choose"), 425.1.a (a countered item does nothing), 340.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AMATEUR_RECITAL = "unl-207-219";
const NOT_SO_FAST = "sfd-045-221";

/**
 * End of P1's turn 2. P2 controls the live Amateur Recital (bf1) with a Holder on it → P2 will HOLD it at the start of
 * their turn. P1's Sentry (3) stands at P1's bf2. P1 has three calm runes (pools empty at turn end, so NSF's 2 + [calm]
 * is produced from runes in response) and Not So Fast in hand.
 */
function board() {
  return scenario()
    .runes(P1, "calm", 3)
    .battlefield("bf1", { controller: P2, def: AMATEUR_RECITAL, inert: false })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "bf2", { might: 3, name: "Sentry" }, "sentry")
    .hand(P1, NOT_SO_FAST, "nsf");
}

/** P1 ends the turn; P2 holds the Recital, opts in and picks P1's Sentry; P2 then passes priority to P1. */
async function recitalPicksSentry(): Promise<Game> {
  const game = await board().build();
  await game.p1.endTurn();
  expect(game.turnPlayer()).toBe(P2);
  // "you may": P2's opt-in, then P2 CHOOSES the unit — both are P2's decisions.
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
  expect(game.decision()?.prompt).toMatch(/Amateur Recital/);
  await game.p2.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
  const pick = game.decision() as Extract<ReturnType<Game["decision"]>, { kind: "pick" }>;
  expect(pick.options.map((o) => o.card ?? o.key).sort()).toEqual(["holder", "sentry"]); // "a unit at a battlefield" — either side's
  await game.p2.pick("sentry");
  expect(game.chain()).toEqual([
    expect.objectContaining({
      cardId: "bf1",
      controller: P2,
      targets: ["sentry"],
      triggered: true,
      type: "ability",
    }),
  ]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 1acfac2160cebf71 — Not So Fast counters an enemy Amateur Recital trigger that picks your unit", () => {
  test("control: unanswered, the hold trigger moves P1's Sentry from bf2 back to P1's base", async () => {
    const game = await recitalPicksSentry();
    await game.p1.passPriority();
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("base");
    expect(game.p1.units("base")).toContain("sentry");
  });

  test("the Recital trigger 'chooses' the Sentry, so it is a legal Not So Fast target: P1 (in response, off runes) casts NSF naming that ability", async () => {
    const game = await recitalPicksSentry();
    await game.p1.tapRune();
    await game.p1.tapRune();
    await game.p1.recycleRune(undefined, "calm");
    expect(game.p1.resources()).toMatchObject({ energy: 2, power: { calm: 1 } });
    const offered =
      game.p1.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(offered.flat()).toContain("bf1"); // the Recital's chain item
    await game.p1.cast("nsf", { targets: "bf1" });
    expect(game.p1.resources()).toMatchObject({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["bf1", "nsf"]);
  });

  test("NSF resolves first and counters the ability: it does nothing and is cleared (425.1.a) — the Sentry stays at bf2; P2's turn continues", async () => {
    const game = await recitalPicksSentry();
    await game.p1.tapRune();
    await game.p1.tapRune();
    await game.p1.recycleRune(undefined, "calm");
    await game.p1.cast("nsf", { targets: "bf1" });
    await game.settle();
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sentry")).toBe("battlefield-bf2");
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // holding still happened (P2 scored its hold point)
    expect(game.p2.points()).toBe(1);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.violations()).toEqual([]);
  });
});
