/**
 * Ruling a0c1465f747621cf — Jinx, Rebel (OGN-202 → ogn-202-298) · 5 Might · "When you discard one or more cards, ready me
 *     and give me +1 Might this turn."
 *   × Super Mega Death Rocket! (OGN-252 → ogn-252-298) "…When you conquer, you may discard 1 to return this from your trash
 *     to your hand."
 *   × Invert Timelines (OGN-201 → ogn-201-298) "Each player discards their hand, then draws 4."
 *
 * Q: Does Jinx, Rebel's ability stack?
 * A: Yes — once per discard EVENT, not per card. Three SMDR triggers each discarding 1 = three events = +3 Might (and she
 *    readies each time). Invert Timelines discarding a 4-card hand is ONE event = +1 Might, not +4.
 * Rules: 383.1 ("one or more" batches a multi-card discard into one trigger), 422 (discard), 385.2 (SMDR triggers from trash).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const JINX_REBEL = "ogn-202-298";
const SMDR = "ogn-252-298";
const INVERT_TIMELINES = "ogn-201-298";
const junk = (n: string) => ({ cardType: "unit", energyCost: 1, might: 1, name: `Junk ${n}` }) as const;

/** Drive every SMDR "you may discard 1" prompt with YES, discarding whatever is offered first; count discard events. */
async function acceptEveryRocket(game: Game): Promise<number> {
  let accepted = 0;
  for (let i = 0; i < 16; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || !d) {
      break;
    }
    if (d.kind === "yes-no" && d.seat === P1) {
      accepted++;
      await game.p1.yes();
    } else if (d.kind === "pick" && d.seat === P1) {
      const nonRocket = d.options.find((o) => !String(o.card ?? o.key).startsWith("smdr"));
      await game.p1.pick((nonRocket ?? d.options[0]!).key);
    } else if (d.kind === "order" && d.seat === P1) {
      await game.p1.order(d.items.map((it) => it.key));
    } else {
      break;
    }
  }
  return accepted;
}

describe("Ruling a0c1465f747621cf — Jinx, Rebel triggers once per discard event", () => {
  test("three separate discard events (three SMDR conquer-triggers, each 'discard 1') → Jinx +3 Might (5 → 8) and she ends up READY", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", JINX_REBEL, "jinx", { exhausted: true })
      .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
      .trash(P1, SMDR, "smdrA")
      .trash(P1, SMDR, "smdrB")
      .trash(P1, SMDR, "smdrC")
      .hand(P1, junk("A"), "ja")
      .hand(P1, junk("B"), "jb")
      .hand(P1, junk("C"), "jc")
      .build();
    expect(game.state("jinx")).toMatchObject({ isExhausted: true, might: 5 });
    await game.p1.move("runner", "bf1");
    const accepted = await acceptEveryRocket(game);
    expect(accepted).toBe(3);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.trash().sort()).toEqual(["ja", "jb", "jc"]);
    expect(game.p1.hand().sort()).toEqual(["smdrA", "smdrB", "smdrC"]);
    expect(game.state("jinx").might).toBe(8); // three events → +3
    expect(game.state("jinx").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("one event discarding many cards (Invert Timelines dumps a 4-card hand) → Jinx triggers exactly once: +1 Might (5 → 6), not +4", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .unit(P1, "base", JINX_REBEL, "jinx", { exhausted: true })
      .unit(P2, "base", { might: 1 }, "bystander")
      .hand(P1, INVERT_TIMELINES, "invert")
      .hand(P1, junk("A"), "ja")
      .hand(P1, junk("B"), "jb")
      .hand(P1, junk("C"), "jc")
      .hand(P1, junk("D"), "jd")
      .build();
    await game.p1.cast("invert");
    await game.settle();
    expect(game.zoneOf("invert")).toBe("trash");
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["ja", "jb", "jc", "jd"]));
    expect(game.p1.hand()).toHaveLength(4); // drew 4 fresh cards
    expect(game.p1.hand()).not.toContain("ja");
    // Exactly one Jinx trigger for the single discard event.
    expect(game.state("jinx").might).toBe(6);
    expect(game.state("jinx").isReady).toBe(true);
    expect(game.chain()).toEqual([]);
  });
});
