/**
 * Ruling 7da0e4d61d2bb1a9 — Vex, Mocking (UNL-055 → unl-055-219) · Champion Unit · Calm · 5 · 5 Might
 *     "[Shield] [Tank] When you [Stun] an enemy unit at a battlefield, you may move me to that battlefield."
 *   × Back Off (unl-042-219) · [Action] · 3 — "Stun a unit. If played from hand, draw 1."
 *
 * Q: With THREE Vex, Mocking on my board, when I stun a unit at a battlefield can I move all three there at the same time?
 * A: Not simultaneously. Each copy's ability triggers independently and is put on the chain; they resolve one at a time
 *    (LIFO), each moving its own Vex — so all three can end up there, but they arrive one by one, with the state updated
 *    (and reaction windows) between resolutions. This is not a single Standard Move of several units.
 * Rules: 376 / 383 (each triggered ability is its own chain item), 340 (LIFO, priority between items), 144.3 contrast
 *        (simultaneous movement is a Standard Move thing), 402.1 ("you may" decided at finalization).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEX = "unl-055-219";
const BACK_OFF = "unl-042-219";

/** P1's turn, 3 energy, Back Off in hand; three Vex (exhausted) in base; P2 holds bf1 with a 5-Might Defender. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Defender" }, "def")
    .unit(P1, "base", VEX, "vex1", { exhausted: true })
    .unit(P1, "base", VEX, "vex2", { exhausted: true })
    .unit(P1, "base", VEX, "vex3", { exhausted: true });
}

const vexes = ["vex1", "vex2", "vex3"];
const vexesAt = (game: Game, loc: string) => vexes.filter((v) => game.locationOf(v) === loc);

/** Cast Back Off on the Defender and let it resolve; answer every Vex "you may" with yes. Returns the number of yes/no prompts seen. */
async function stunAndAcceptAll(game: Game): Promise<number> {
  await game.p1.cast("bo", { targets: "def" });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Back Off resolves → the stun → three triggers
  let prompts = 0;
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      prompts += 1;
      expect(d.timing).toBe("FIN");
      await game.p1.yes();
    } else if (d?.kind === "pick" && d.seat === P1 && d.options.length === 1) {
      await game.p1.pick(d.options[0]!.key); // forced single destination, if surfaced
    } else if (d?.kind === "order" && d.seat === P1) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  return prompts;
}

describe("Ruling 7da0e4d61d2bb1a9 — three Vex triggers are three chain items; the Vexes arrive one at a time", () => {
  test("stunning the Defender triggers EACH Vex independently: three separate 'you may' decisions for P1, then three triggered Vex items on the chain — and no Vex has moved yet", async () => {
    const game = await board().hand(P1, BACK_OFF, "bo").build();
    expect(await stunAndAcceptAll(game)).toBe(3);
    expect(game.state("def").isStunned).toBe(true);
    const items = game.chain().filter((c) => c.triggered && c.controller === P1 && vexes.includes(c.cardId));
    expect(items).toHaveLength(3);
    expect(new Set(items.map((c) => c.cardId))).toEqual(new Set(vexes));
    expect(vexesAt(game, "base")).toEqual(vexes);
    expect(vexesAt(game, "bf1")).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("they resolve ONE AT A TIME (LIFO): after the top item resolves exactly one Vex is at bf1, two are still in base with two items left — and P2 gets priority in between (a reaction window / state update between arrivals)", async () => {
    const game = await board().hand(P1, BACK_OFF, "bo").build();
    await stunAndAcceptAll(game);
    const top = game.chain().at(-1)?.cardId as string;
    await game.acting().passPriority();
    await game.acting().passPriority(); // top item resolves
    expect(vexesAt(game, "bf1")).toEqual([top]);
    expect(vexesAt(game, "base")).toHaveLength(2);
    expect(game.chain().filter((c) => vexes.includes(c.cardId))).toHaveLength(2);
    // Between resolutions both players hold priority again — P2 included.
    const seats = new Set<string>();
    seats.add(game.actingSeat() as string);
    await game.acting().passPriority();
    seats.add(game.actingSeat() as string);
    expect(seats.has(P2)).toBe(true);
    await game.acting().passPriority(); // second item resolves
    expect(vexesAt(game, "bf1")).toHaveLength(2);
    expect(vexesAt(game, "base")).toHaveLength(1);
    expect(game.chain().filter((c) => vexes.includes(c.cardId))).toHaveLength(1);
  });

  test("in the end all three CAN be there: after the third item resolves every Vex is at bf1 (moved by effect — still exhausted), and the ensuing combat vs the stunned Defender (deals 0) is won: P1 conquers bf1", async () => {
    const game = await board().hand(P1, BACK_OFF, "bo").build();
    await stunAndAcceptAll(game);
    await game.settle();
    expect(vexesAt(game, "bf1").sort()).toEqual(vexes);
    expect(game.zoneOf("def")).toBe("trash");
    expect(vexes.every((v) => game.state(v).damage === 0)).toBe(true);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("each 'you may' is its own decision: accepting only for the first-asked Vex moves exactly that one; the other two stay in base", async () => {
    const game = await board().hand(P1, BACK_OFF, "bo").build();
    await game.p1.cast("bo", { targets: "def" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    const answered: string[] = [];
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        answered.push(d.source?.cardId ?? "?");
        await (answered.length === 1 ? game.p1.yes() : game.p1.no());
      } else if (d?.kind === "pick" && d.seat === P1 && d.options.length === 1) {
        await game.p1.pick(d.options[0]!.key);
      } else if (d?.kind === "order" && d.seat === P1) {
        await game.acceptTriggerOrder();
      } else {
        break;
      }
    }
    expect(answered).toHaveLength(3);
    expect(game.chain().filter((c) => vexes.includes(c.cardId))).toHaveLength(1); // declined items are removed (402.1.a)
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(vexesAt(game, "bf1")).toEqual([answered[0]!]);
    expect(vexesAt(game, "base")).toHaveLength(2);
  });
});
