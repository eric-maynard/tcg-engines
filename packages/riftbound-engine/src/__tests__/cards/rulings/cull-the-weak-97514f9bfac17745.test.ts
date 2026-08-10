/**
 * Ruling 97514f9bfac17745 — Cull the Weak (OGN-209 → ogn-209-298) · Spell · Order · 2 + [order]
 *     "Each player kills one of their units."   (scrape also lists Cull sfd-134-221 — name collision only)
 *
 * Q: Can you use Cull the Weak if you have no friendly units?
 * A: Yes. It targets nothing when played (the kill choice happens during resolution), so board state doesn't
 *    matter. "Do as much as you can": with no units you kill nothing, but the opponent must still kill one of
 *    theirs. Killing is the spell's EFFECT, not an additional cost — a cost would have required a unit.
 * Rules: 355 (targeting), 359.3.e.11 / 055 (do as much as you can), 356 (additional costs — contrast).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";
const CRUEL_PATRON = "ogn-208-298"; // "As an additional cost to play me, kill a friendly unit." — the cost contrast

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Knight" }, "knight")
    .hand(P1, CULL_THE_WEAK, "cull");
}

describe("Ruling 97514f9bfac17745 — Cull the Weak with no friendly units: legal; you kill nothing, the opponent still kills one", () => {
  test("no friendly units required: castable, paid (2 + [order]) and on the chain", async () => {
    const game = await board().build();
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.can("cast", "cull")).toBe(true);
    await game.p1.cast("cull");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1 })]);
  });

  test("ruling 97514f9bfac17745 — resolution: P1 kills nothing (nothing to kill), yet P2's only unit — the Knight — is killed all the same", async () => {
    const game = await board().build();
    await game.p1.cast("cull");
    await game.settle();
    if (game.decision()?.kind === "pick" && game.actingSeat() === P2) {
      await game.p2.pick("knight");
      await game.settle();
    }
    expect(game.zoneOf("knight")).toBe("trash");
    expect(game.p2.trash()).toContain("knight");
    expect(game.p1.trash()).toEqual(["cull"]); // P1 lost nothing but the spell itself
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test.failing("BUG: with a friendly unit P1 does kill one of its own too (each player kills one)", async () => {
    const game = await board().unit(P1, "base", { might: 1, name: "Pawn" }, "pawn").build();
    await game.p1.cast("cull");
    for (let i = 0; i < 6; i++) {
      const stop = await game.settle();
      if (stop.reason !== "unanswered") {
        break;
      }
      const d = game.decision();
      if (d?.kind === "pick") {
        await game.seat(d.seat).pick(d.options[0]?.key as string);
      } else {
        break;
      }
    }
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.zoneOf("knight")).toBe("trash");
  });

  test("'not a cost' contrast: Cruel Patron's kill IS an additional cost, so with no friendly unit it can't be played at all — unlike Cull the Weak on the same empty board", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Knight" }, "knight")
      .hand(P1, CULL_THE_WEAK, "cull")
      .hand(P1, CRUEL_PATRON, "patron")
      .build();
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.can("play", "patron")).toBe(false);
    expect(game.p1.can("cast", "cull")).toBe(true);
  });
});
