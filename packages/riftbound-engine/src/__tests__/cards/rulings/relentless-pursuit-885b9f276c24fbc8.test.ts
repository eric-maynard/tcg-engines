/**
 * Ruling 885b9f276c24fbc8 — Relentless Pursuit (SFD-184 → sfd-184-221) · Spell · Fury/Body · [2][rainbow] · [Action]
 *     "Move a friendly unit. You may attach an Equipment with the same controller to it. This turn, that unit has
 *      'When I conquer, you may move me to my base.'"
 *   × Eye of the Herald (sfd-153-221) · Equipment
 *
 * Q: What does "an Equipment with the same controller" mean, and can an equipment that is already on the board be
 *    attached to a unit that has none?
 * A: "Same controller" only rules out attaching an opponent's equipment; in a 1v1 every equipment of yours qualifies.
 *    An equipment already on the board is exactly what the clause moves — it is re-attached to the unit you moved,
 *    which does not need to have been carrying anything.
 * Rules: 718 (equipment attachment), 740.1.a ("same controller"), 355.4 (the mover's destination is chosen on the
 *        play), 383.3.a ("you may" is opted into as the item is finalized).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RELENTLESS_PURSUIT = "sfd-184-221";
const EYE_OF_THE_HERALD = "sfd-153-221";

const cards = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []);

/**
 * P1's turn with [2][rainbow]. P1's Runner sits in base carrying NOTHING; P1's own Eye of the Herald lies unattached in
 * base, and P2 has an Eye of their own (also unattached). bf1 is open for the Runner to move into.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .gear(P1, EYE_OF_THE_HERALD, "myEye")
    .gear(P2, EYE_OF_THE_HERALD, "theirEye")
    .hand(P1, RELENTLESS_PURSUIT, "rp");
}

/** Cast Relentless Pursuit on the Runner and send it to bf1; returns at whatever it asks next. */
async function pursue(): Promise<Game> {
  const game = await board().build();
  expect(game.state("runner").attachments).toEqual([]);
  await game.p1.cast("rp", { targets: "runner" });
  await game.p1.passPriority();
  await game.p2.passPriority(); // resolves: the Runner moves (bf1 is its only destination, so it is bound unasked)
  expect(game.locationOf("runner")).toBe("bf1");
  return game;
}

describe("Ruling 885b9f276c24fbc8 — the attach clause takes an equipment already in play, and only one you control", () => {
  test("ruling 885b9f276c24fbc8 — the attach offer lists P1's own board equipment and never the opponent's", async () => {
    const game = await pursue();
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes();
        continue;
      }
      if (d?.kind === "pick" && d.seat === P1) {
        expect(cards(d)).toContain("myEye"); // an equipment already on the board
        expect(cards(d)).not.toContain("theirEye"); // "with the same controller"
        await game.p1.pick("myEye");
        break;
      }
      break;
    }
    await game.settle();
    expect(game.state("runner").attachments).toEqual(["myEye"]);
    expect(game.state("myEye").attachedTo).toBe("runner");
    expect(game.state("theirEye").attachedTo).toBeUndefined();
    expect(game.violations()).toEqual([]);
  });

  test("a unit that was carrying nothing is a perfectly good recipient — no prior equipment is required", async () => {
    const game = await pursue();
    expect(game.state("runner").attachments).toEqual([]);
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes();
      } else if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("myEye");
        break;
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.state("runner").attachments).toEqual(["myEye"]);
    expect(game.violations()).toEqual([]);
  });

  test("the attach is optional — declining it moves the unit and leaves every equipment where it was", async () => {
    const game = await pursue();
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.no();
        break;
      }
      if (d?.kind === "pick" && d.seat === P1 && d.allowDecline) {
        await game.p1.decline();
        break;
      }
      break;
    }
    await game.settle();
    expect(game.locationOf("runner")).toBe("bf1");
    expect(game.state("runner").attachments).toEqual([]);
    expect(game.state("myEye").attachedTo).toBeUndefined();
    expect(game.violations()).toEqual([]);
  });
});
