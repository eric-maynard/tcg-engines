/**
 * Ruling ec803db4452c3d5d — Unforgiven (OGN-259 → ogn-259-298), Yasuo's Legend
 *   "[2], [Exhaust]: Move a friendly unit to or from its base."
 *   × Vi, Destructive (ogn-036-298) · 3 Might "[Ganking] / Recycle 1 from your trash: Give me +1
 *     [Might] this turn."
 *
 * Q: Can the Yasuo Legend's and Vi's activated abilities be used at action speed, and can Vi's be
 *    used more than once a turn?
 * A: Activated abilities are BASE speed unless the card says otherwise: your own turn, and not while
 *    a showdown is happening. Vi's has no once-a-turn limit — you may activate it as often as you can
 *    pay the recycle cost. (Unforgiven's own [Exhaust] cost is what limits it to once.)
 * Rules: 307 (base speed = your turn, Neutral Open State), 806 ([Action] is the keyword that would
 *        grant showdown speed — neither ability has it), 411 (a cost payable again may be paid again).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VI = "ogn-036-298";
const UNFORGIVEN = "ogn-259-298";
const FILLER = "ogn-175-298";

/** P1 owns Yasuo's Legend, Vi, a spare unit, three cards in trash and 4 Energy. */
function board(opts: { active?: string } = {}) {
  let s = scenario()
    .resources(P1, { energy: 4 })
    .battlefield("bf1", { controller: P2 })
    .legend(P1, UNFORGIVEN, "yasuo")
    .unit(P1, "base", VI, "vi")
    .unit(P1, "base", { might: 3, name: "Escort" }, "escort")
    .unit(P2, "bf1", { might: 9, name: "Guard" }, "guard")
    .trash(P1, FILLER, "t1")
    .trash(P1, FILLER, "t2")
    .trash(P1, FILLER, "t3");
  if (opts.active === P2) {
    s = s.turn(2).active(P2);
  }
  return s;
}

/**
 * Activate Vi's recycle ability, naming the trash card to pay with. When only one card is left the
 * engine binds that sole cost object itself, so no argument may be supplied.
 */
async function viRecycle(game: Game, id: string): Promise<void> {
  const hasChoice = (game.p1.option("activate", "vi")?.fields.length ?? 0) > 0;
  await game.p1.activate("vi", 1, hasChoice ? { params: { recycleIds: [id] } } : {});
  await game.settle();
}

describe("Ruling ec803db4452c3d5d — activated abilities are base speed; Vi's recycle ability has no per-turn limit", () => {
  test("Vi's ability can be activated repeatedly in one turn — three recycles, +3 Might", async () => {
    const game = await board().build();
    expect(game.state("vi").might).toBe(3);
    await viRecycle(game, "t1");
    expect(game.state("vi").might).toBe(4);
    await viRecycle(game, "t2");
    expect(game.state("vi").might).toBe(5);
    await viRecycle(game, "t3");
    expect(game.state("vi").might).toBe(6);
    expect(game.p1.trash()).toEqual([]); // each activation paid its own cost
    expect(game.violations()).toEqual([]);
  });

  test("it stops only when the cost can no longer be paid — an empty trash means no ability", async () => {
    const game = await board().build();
    for (const id of ["t1", "t2", "t3"]) {
      await viRecycle(game, id);
    }
    expect(game.p1.can("activate", "vi")).toBe(false);
    const fourth = await game.p1.try((p) => p.activate("vi", 1));
    expect(fourth.ok).toBe(false);
    expect(game.state("vi").might).toBe(6);
  });

  test("base speed: neither ability may be used while a showdown is happening", async () => {
    const game = await board().build();
    await game.p1.move("escort", "bf1"); // opens a showdown at bf1
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.legal().map((o) => o.verb)).not.toContain("activate");
    expect(game.p1.can("activate", "vi")).toBe(false);
    expect(game.p1.can("activate", "yasuo")).toBe(false);
    const viTry = await game.p1.try((p) => p.activate("vi", 1, { params: { recycleIds: ["t1"] } }));
    expect(viTry.ok).toBe(false);
    const yasuoTry = await game.p1.try((p) => p.activate("yasuo", 0, { targets: "escort" }));
    expect(yasuoTry.ok).toBe(false);
  });

  test("base speed: neither ability may be used on the opponent's turn", async () => {
    const game = await board({ active: P2 }).build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("activate", "vi")).toBe(false);
    expect(game.p1.can("activate", "yasuo")).toBe(false);
  });

  test("Unforgiven is limited by its own [Exhaust] cost, not by a per-turn rule: it moves a unit once and is then unusable", async () => {
    const game = await board().build();
    expect(game.state("yasuo").isReady).toBe(true);
    await game.p1.activate("yasuo", 0, { targets: "escort" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bf1");
      await game.settle();
    }
    expect(game.state("yasuo").isExhausted).toBe(true);
    expect(game.p1.can("activate", "yasuo")).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
