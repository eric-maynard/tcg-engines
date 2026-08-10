/**
 * Ruling 09920eadc9640c5b — (general [Temporary] × [Hidden] timing; no specific card)
 *   Stand-ins: a Sprite unit token (unl-t07 · 3 Might · [Temporary] "Kill it at the start of its controller's Beginning
 *   Phase, before scoring") alone at my battlefield, and Sprite Call (ogn-094-298 · [Hidden] [Action] "Play a ready 3 [Might]
 *   Sprite unit token with [Temporary]") hidden there on an earlier turn.
 *
 * Q: Can I flip my hidden card in reaction to the Temporary trigger at the start of my turn, or does the unit die and take
 *    the hidden card with it first?
 * A: You can react. [Temporary] is a TRIGGER, not a passive: at the start of your turn it goes on the chain and you get a
 *    window to play the hidden card before it resolves. If you don't, the unit dies, control of the battlefield is lost at
 *    the following Cleanup and the hidden card goes with it — so respond to the trigger (the thing removing the unit).
 * Rules: 816 (Temporary = start-of-Beginning-Phase kill trigger), 383.3 (triggered ability uses the chain → respondable),
 *        811 (Hidden: Reaction timing, previous turn), 190.4 / 323.6–323.7 (control + facedown lost at an Open Cleanup).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_TOKEN = "unl-t07";
const SPRITE_CALL = "ogn-094-298";

/** End of P2's turn 2. P1 holds bf1 with ONE Sprite token (Temporary) and Sprite Call facedown there; P2 holds bf2. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", SPRITE_TOKEN, "hourglass")
    .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry")
    .facedown(P1, "bf1", SPRITE_CALL, "call");
}

/** P2 ends the turn → P1's Beginning Phase opens with the Temporary trigger on the chain. */
async function toTemporaryTrigger(): Promise<Game> {
  const game = await board().build();
  expect(game.state("hourglass").keywords).toContain("Temporary");
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  return game;
}

describe("Ruling 09920eadc9640c5b — the [Temporary] kill is a trigger on the chain: the hidden card there can be flipped in response", () => {
  test("start of my turn: the Sprite's Temporary trigger is a CHAIN ITEM (the Sprite is still alive, bf1 still mine) and I hold priority — my facedown Sprite Call IS playable right now", async () => {
    const game = await toTemporaryTrigger();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hourglass", controller: P1, triggered: true })]);
    expect(game.zoneOf("hourglass")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("call")).toBe("facedown-bf1");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "call")).toBe(true);
  });

  test("reacting: Sprite Call lands above the trigger and resolves first (a fresh ready Sprite at bf1); THEN the old Sprite is killed — bf1 never empties, I keep it and even score the hold", async () => {
    const game = await toTemporaryTrigger();
    const p0 = game.p1.points();
    await game.p1.reveal("call");
    expect(game.chain().map((c) => c.cardId)).toEqual(["hourglass", "call"]);
    for (let i = 0; i < 10 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options.find((o) => o.key.includes("bf1"))?.key ?? d.options[0]!.key);
      } else if (d?.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("call")).toBe("trash"); // played, not lost
    expect(game.has("hourglass") && game.zoneOf("hourglass")).not.toBe("battlefield-bf1"); // the old one did die
    const fresh = game.p1.units("bf1");
    expect(fresh).toHaveLength(1);
    expect(game.state(fresh[0]!)).toMatchObject({ isToken: true, might: 3 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(p0 + 1); // held bf1 at scoring (the kill happens "before scoring", the new Sprite was already there)
    expect(game.violations()).toEqual([]);
  });

  test("NOT reacting: the trigger resolves, the lone Sprite dies, and at the following Cleanup control of bf1 lapses — the facedown Sprite Call is trashed unplayed and no hold is scored", async () => {
    const game = await toTemporaryTrigger();
    const p0 = game.p1.points();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.has("hourglass") && game.zoneOf("hourglass")).not.toBe("battlefield-bf1");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.zoneOf("call")).toBe("trash");
    expect(game.p1.can("reveal", "call")).toBe(false);
    expect(game.p1.points()).toBe(p0);
  });
});
