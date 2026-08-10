/**
 * Ruling 581f4d14f9876f8a — Gust (OGN-169 → ogn-169-298) · Reaction · [1] "Return a unit at a battlefield with 3 [Might] or less to its
 *   owner's hand."
 *   × Rengar, Trophy Hunter (UNL-120 → unl-120-219) · 6 Might · [Ambush] "I can be played to a battlefield where there are enemy units
 *     (even if you don't have units there)."
 *
 * Q: Opponent Gusts their own unit; in response I Ambush Rengar into that battlefield. Is there a showdown?
 * A: Yes — a NON-combat one. Rengar enters while Gust is on the chain (battlefield becomes contested); Gust resolves and bounces their
 *    unit; when the chain empties the Cleanup stages a showdown there with only Rengar present, so no combat: you take control and,
 *    if you haven't scored there this turn, conquer for a point.
 * Rules: 187.3.a.1/190 (contested on arrival), 323.8–323.9 (Cleanup stages the showdown; no combat with one side), 348.2.a, 467.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const RENGAR = "unl-120-219";

/** P2's turn. P2 holds bf1 with a lone 3-Might Wisp and has Gust + [1]. P1: Rengar in hand + [5][body], no units anywhere. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 5, power: { body: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Wisp" }, "wisp")
    .hand(P2, GUST, "gust")
    .hand(P1, RENGAR, "rengar");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P2 Gusts its own Wisp; P1 answers by Ambushing Rengar into bf1; drive until Rengar stands there (Gust still pending). */
async function gustThenRengar(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("gust", { targets: "wisp" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gust", controller: P2 })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("play", "rengar")).toBe(true);
  const to = (game.p1.option("playUnit", "rengar")?.fields.find((f) => f.name === "location")?.options ?? []).map(String);
  expect(to).toContain("battlefield-bf1"); // enemy-occupied, no friendly units — Rengar's own permission
  await game.p1.play("rengar", { to: "bf1" });
  for (let i = 0; i < 6 && game.zoneOf("rengar") !== "battlefield-bf1"; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || !d.passKey) {
      break;
    }
    await game.seat(d.seat).pass();
  }
  expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
  return game;
}

describe("Ruling 581f4d14f9876f8a — Rengar Ambushed in under a Gust: non-combat showdown, then conquer", () => {
  test("premise: P2's Gust on its own Wisp opens a chain and hands P1 a Reaction window", async () => {
    const game = await board().build();
    await game.p2.cast("gust", { targets: "wisp" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gust", controller: P2, targets: ["wisp"] })]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  // Expected (ruling step 1): Rengar's "played to a battlefield where there are enemy units" permission rides on Ambush's
  // Reaction timing, so in that window P1 may play him to the enemy-occupied bf1; he enters while Gust is still on the chain and
  // bf1 becomes contested. Actual: the engine only allows the enemy-battlefield Ambush into a battlefield whose showdown is
  // already open (bf1 must be `contested`), so `playUnit` is not offered to P1 at all here.
  test("ruling 581f4d14f9876f8a — engine refuses Rengar's Ambush to an enemy-occupied, uncontested battlefield in a plain chain window", async () => {
    const game = await gustThenRengar();
    expect(game.chain().some((c) => c.cardId === "gust")).toBe(true);
    expect(game.zoneOf("wisp")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(showdown(game)?.active ?? false).toBe(false); // no showdown while the chain is open
  });

  // Expected (steps 2–4): Gust resolves (Wisp → hand), the chain empties, the Cleanup stages a NON-combat showdown at bf1 (only
  // Rengar there); everyone passes → P1 takes control and conquers for 1 point. Blocked by the same refusal above.
  test("ruling 581f4d14f9876f8a — (blocked) Gust resolves, non-combat showdown at bf1, P1 conquers for 1", async () => {
    const game = await gustThenRengar();
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.p2.hand()).toContain("wisp");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(showdown(game)?.isCombatShowdown ?? false).toBe(false);
    expect(game.p1.points()).toBe(0);
    await game.settle();
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.conqueredThisTurn?.[P1]).toEqual(["bf1"]);
    expect(game.state("rengar")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("contrast (the ruling's 'key distinction'): Ambushed in response to a MOVE onto P1's battlefield, both units stay and it is a COMBAT showdown", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 5, power: { body: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Bait" }, "bait")
      .unit(P2, "base", { might: 3, name: "Wisp" }, "wisp")
      .hand(P1, RENGAR, "rengar")
      .build();
    await game.p2.move("wisp", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("play", "rengar")).toBe(true);
    await game.p1.play("rengar", { to: "bf1" });
    for (let i = 0; i < 6 && game.zoneOf("rengar") !== "battlefield-bf1"; i++) {
      await game.acting().pass();
    }
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("rengar").combatRole).toBe("defender");
  });
});
