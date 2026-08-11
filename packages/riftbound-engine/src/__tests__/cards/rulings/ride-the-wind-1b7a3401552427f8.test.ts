/**
 * Ruling 1b7a3401552427f8 — Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · [2][chaos] · [Action]
 *     "Move a friendly unit and ready it."
 *
 * Q: Do you declare where the unit moves when you PLAY Ride the Wind, or only when it resolves?
 * A: When you play it. The destination is chosen in the same step as the target, before anyone gets priority
 *    (this changed in rules v1.1 — older answers say resolution). On resolution the move simply happens to the
 *    already-declared destination; it is not asked again.
 * Rules: 355.4 (a move destination named by a card is chosen while playing it, with the targets),
 *        355.12/402.2 (all choices for a play are made during the play, before priority), 337.1 (then priority).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn with exactly [2][chaos]. P1 holds bf1 (Holder) and bf2 (Keeper); an EXHAUSTED Runner waits in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
    .unit(P1, "bf2", { might: 1, name: "Keeper" }, "keeper")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner", { exhausted: true })
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Cast Ride the Wind on the Runner; returns the game with the destination question still open. */
async function castOnRunner(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("rtw", { targets: "runner" });
  return game;
}

describe("Ruling 1b7a3401552427f8 — Ride the Wind's destination is declared while playing it", () => {
  test("the destination is asked IMMEDIATELY on the play — before anyone passes priority — as P1's own choice, and every legal battlefield is offered", async () => {
    const game = await castOnRunner();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(d).toMatchObject({ semantics: "destination", source: { pendingChoiceType: "choose-destination" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.zone ?? o.key) : []).toEqual(
      expect.arrayContaining(["battlefield-bf1", "battlefield-bf2"]),
    );
    expect(game.locationOf("runner")).toBe("base"); // nothing has moved yet
  });

  test("nothing else has happened yet at that moment: the spell is on the chain, its cost is paid, and nobody has had priority", async () => {
    const game = await castOnRunner();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rtw", controller: P1, targets: ["runner"] })]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.decision()?.kind).not.toBe("action"); // the destination question comes BEFORE the priority window
  });

  test("once declared (bf2), priority opens with the destination already locked in — the opponent responds knowing where the Runner is headed", async () => {
    const game = await castOnRunner();
    await game.p1.pick("battlefield-bf2");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.locationOf("runner")).toBe("base"); // still not moved — only declared
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("on resolution the move just happens to the declared battlefield and the Runner is readied — no second destination question", async () => {
    const game = await castOnRunner();
    await game.p1.pick("battlefield-bf2");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Ride the Wind resolves
    expect(game.locationOf("runner")).toBe("bf2");
    expect(game.state("runner").isReady).toBe(true);
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("the declaration binds: declaring bf1 instead sends the Runner to bf1, not bf2", async () => {
    const game = await castOnRunner();
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.locationOf("runner")).toBe("bf1");
    expect(game.state("runner").isReady).toBe(true);
    expect(game.cardsAt("battlefield-bf2")).toEqual(["keeper"]);
    expect(game.violations()).toEqual([]);
  });
});
