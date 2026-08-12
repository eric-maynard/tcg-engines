/**
 * Ruling 779070192c74cbfc — Death from Below (UNL-186 → unl-186-219) · Spell · [4][rainbow]
 *   "Kill a unit at a battlefield. Then, if it had 3 [Might] or less, you may play this from your trash
 *    for [rainbow]."
 *
 * Q: First copy this game, nothing in the trash yet — can I replay THIS copy, or do I need a second one
 *    already in the trash?
 * A: You can replay the very same copy. You cannot play it while it is still resolving on the chain, but
 *    the instruction takes effect after the spell has finished and moved to the trash, and then this copy
 *    is the card that is played (for one Power).
 * Rules: 351.2 / 359.3.d (a spell moves to the trash only after its effects are executed),
 *        419.3 (an effect that plays a card), 337.1 (the follow-up play is a pending item).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEATH_FROM_BELOW = "unl-186-219";

/** P1's turn with [4] + two Power: two 3-Might enemies at bf1 and nothing in either trash. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Victim A" }, "victimA")
    .unit(P2, "bf1", { might: 3, name: "Victim B" }, "victimB")
    .hand(P1, DEATH_FROM_BELOW, "dfb");
}

describe("Ruling 779070192c74cbfc — the first Death from Below replays ITSELF, once it has reached the trash", () => {
  test("nothing is in the trash when it is cast: the card is on the chain, not in the trash, while it resolves", async () => {
    const game = await board().build();
    expect(game.p1.trash()).toHaveLength(0);
    await game.p1.cast("dfb", { targets: "victimA" });
    expect(game.zoneOf("dfb")).toBe("chain");
    expect(game.p1.trash()).toHaveLength(0);
  });

  test("after the kill it is in the trash and the SAME copy is offered back for [rainbow] — killing the second unit", async () => {
    const game = await board().build();
    await game.p1.cast("dfb", { targets: "victimA" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Death from Below resolves
    expect(game.zoneOf("victimA")).toBe("trash");

    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    // Death from Below has finished resolving and left the chain — the offer is a follow-up, not part of the
    // resolution. (The engine parks the copy in the `chain` zone while its pending replay is staged.)
    expect(game.chain()).toEqual([]);

    await game.p1.yes();
    for (let i = 0; i < 8; i++) {
      const s = await game.settle();
      const d = game.decision();
      if (s.reason !== "unanswered" || !d) break;
      if (d.kind === "pick") await game.seat(d.seat).pick(d.options.find((o) => (o.card ?? o.key) === "victimB")?.key ?? d.options[0]!.key);
      else if (d.kind === "yes-no") await game.seat(d.seat).yes();
      else break;
    }
    expect(game.zoneOf("victimB")).toBe("trash"); // the replayed copy killed the second unit
    expect(game.zoneOf("dfb")).toBe("trash");
    expect(game.p1.power()).toBe(0); // the [rainbow] replay cost was paid, on top of the original [4][rainbow]
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("declining the offer simply leaves the copy in the trash and the second unit alive", async () => {
    const game = await board().build();
    await game.p1.cast("dfb", { targets: "victimA" });
    await game.settle();
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("dfb")).toBe("trash");
    expect(game.zoneOf("victimB")).toBe("battlefield-bf1");
    expect(game.p1.power()).toBe(1); // nothing extra paid
  });
});
