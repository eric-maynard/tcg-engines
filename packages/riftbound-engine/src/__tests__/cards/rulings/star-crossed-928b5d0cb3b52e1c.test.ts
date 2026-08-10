/**
 * Ruling 928b5d0cb3b52e1c — Star-Crossed (UNL-128 → unl-128-219) · Reaction · Chaos · 3+[chaos]
 *     "Return a friendly unit and an enemy unit to their owners' hands."
 *   × Rek'Sai, Swarm Queen (SFD-170 → sfd-170-221) · Champion · 5 Might "When I attack, you may reveal the top 2 cards of your
 *     Main Deck. You may banish one, then play it. If it is a unit, you may play it here. Recycle the rest."
 *
 * Q: I start a showdown with Rek'Sai; the opponent answers with Star-Crossed. Does Rek'Sai's ability still happen?
 * A: Yes — the attack trigger is already on the chain and resolves even though Star-Crossed (LIFO, first) returned Rek'Sai
 *    to hand: reveal 2, may banish one and play it, recycle the rest. But "here" is evaluated on execution and Rek'Sai is in
 *    a non-board zone, so the revealed unit can NOT be played to that battlefield (base only).
 * Rules: 383.4.e (attack trigger), 376 (abilities on the chain are independent of their source), 340 (LIFO),
 *        359.3.f.2 (referents like "here" checked when the instruction executes).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STAR_CROSSED = "unl-128-219";
const REKSAI = "sfd-170-221";
const SKULKER = "ogn-175-298"; // vanilla 3-cost 3-Might unit — the revealed "unit"

/**
 * P1's turn with 10 energy; ready Rek'Sai in base; deck top = three Skulkers (top, second, third). P2 holds bf1 with a 7-Might
 * Wall, has a Pawn in base (Star-Crossed's friendly half) and exactly 3+[chaos] with Star-Crossed in hand.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 10 })
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7, name: "Wall" }, "wall")
    .unit(P2, "base", { might: 1, name: "Pawn" }, "pawn")
    .unit(P1, "base", REKSAI, "reksai")
    .hand(P2, STAR_CROSSED, "sc")
    .deck(P1, [SKULKER, SKULKER, SKULKER], ["top", "second", "third"]);
}

/** Rek'Sai attacks bf1; P1 opts into her trigger; P1 passes; P2 Star-Crosses [Pawn, Rek'Sai]. Chain = [reksai-trigger, sc]. */
async function attackThenStarCrossed(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("reksai", "bf1");
  expect(game.state("reksai").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "reksai", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "sc")).toBe(true);
  await game.p2.cast("sc", { targets: ["pawn", "reksai"] });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["reksai", "sc"]);
  return game;
}

/** From the reveal prompt: pick the top Skulker and follow the play through, recording any destination prompt. */
async function playTopSkulker(game: Game): Promise<PickDecision | undefined> {
  await game.p1.pick("top");
  let destination: PickDecision | undefined;
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context !== "chain")) {
      break;
    }
    if (d.kind === "pick" && d.seat === P1) {
      destination = d;
      const keys = d.options.map((o) => o.key);
      await game.p1.pick(keys.includes("base") ? "base" : (keys[0] as string));
    } else if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else {
      break;
    }
  }
  return destination;
}

describe("Ruling 928b5d0cb3b52e1c — Star-Crossed bounces attacking Rek'Sai: her trigger still resolves, but not 'here'", () => {
  test("LIFO: Star-Crossed resolves first — Rek'Sai → P1's hand, Pawn → P2's hand — and Rek'Sai's trigger is STILL on the chain", async () => {
    const game = await attackThenStarCrossed();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("reksai")).toBe("hand");
    expect(game.p1.hand()).toContain("reksai");
    expect(game.zoneOf("pawn")).toBe("hand");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "reksai", controller: P1, triggered: true })]);
    expect(game.p1.deck().slice(0, 3)).toEqual(["top", "second", "third"]); // nothing revealed yet
  });

  test("the trigger then resolves with its source gone: P1 is shown exactly the top 2 (top, second) as a declinable reveal-and-pick", async () => {
    const game = await attackThenStarCrossed();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Star-Crossed
    await game.p1.passPriority();
    await game.p2.passPriority(); // Rek'Sai's trigger starts resolving
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["second", "top"]);
  });

  test("picking the unit: it is played (3 energy) but 'here' is no longer valid — no destination prompt offers battlefield-bf1; the Skulker lands in P1's BASE; the other card is recycled, 'third' is on top", async () => {
    const game = await attackThenStarCrossed();
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p1.passPriority();
    await game.p2.passPriority();
    const destination = await playTopSkulker(game);
    if (destination) {
      expect(destination.options.map((o) => o.key)).not.toContain("battlefield-bf1");
    }
    expect(game.zoneOf("top")).toBe("base");
    expect(game.cardsAt("bf1")).not.toContain("top");
    expect(game.p1.energy()).toBe(7); // full price, no discount
    expect(game.p1.deck()[0]).toBe("third");
    expect(game.p1.deck().at(-1)).toBe("second");
    expect(game.p1.banishment()).toEqual([]);
    await game.settle(); // the showdown at bf1 fizzles out with no attacker left
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — without Star-Crossed, Rek'Sai is still there when the trigger resolves and 'here' (battlefield-bf1) IS offered for the revealed unit", async () => {
    const game = await board().build();
    await game.p1.move("reksai", "bf1");
    await game.p1.yes();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("top");
    let destination: PickDecision | undefined;
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context !== "chain")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1) {
        destination = d;
        await game.p1.pick("battlefield-bf1");
      } else if (d.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(destination?.options.map((o) => o.key)).toContain("battlefield-bf1");
    expect(game.zoneOf("top")).toBe("battlefield-bf1");
  });
});
