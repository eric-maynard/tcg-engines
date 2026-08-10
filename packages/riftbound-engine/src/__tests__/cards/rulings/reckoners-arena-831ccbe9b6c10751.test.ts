/**
 * Ruling 831ccbe9b6c10751 — Reckoner's Arena (OGN-286 → ogn-286-298, Battlefield) "When you hold here, activate the conquer effects of units
 *     here."
 *   × Qiyana, Victorious (OGN-155 → ogn-155-298) · 4 Might · [Deflect] · "When I conquer, draw 1 or channel 1 rune exhausted."
 *
 * Q: Can you respond to the Arena's hold trigger by killing a unit there (e.g. Qiyana) so its conquer effect never happens?
 * A: Yes. The Arena's trigger goes on the chain first; you may respond and kill the unit. When the Arena's trigger resolves it looks at
 *    which units are here NOW and only their conquer effects are added to the chain — a unit killed in response contributes nothing.
 * Rules: 383.4.g.1 (activate conquer effects → new chain items on resolution), 355.5.a ("units here" evaluated on resolution), 383 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RECKONERS_ARENA = "ogn-286-298";
const QIYANA = "ogn-155-298";
/** P2's removal: an inline Reaction "Deal 6 to a unit" ([1]; +[rainbow] for Qiyana's Deflect). */
const BIG_BOLT = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Big Bolt",
  timing: "reaction",
} as const;

/** End of P2's turn 2. P1 controls the live Arena with Qiyana on it and has a known deck; P2 holds Big Bolt. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("arena", { controller: P1, def: RECKONERS_ARENA, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "arena", QIYANA, "qiyana")
    .unit(P2, "bf2", { might: 2, name: "Bystander" }, "bystander")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3", "d4"])
    .hand(P2, BIG_BOLT, "bolt");
}

/** P2 ends the turn → P1 holds the Arena; the Arena's trigger is on the chain with P1 holding priority. */
async function arenaTriggerPending(): Promise<Game> {
  const game = await board().build();
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  expect(game.p1.points()).toBe(1); // the hold point
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "arena", controller: P1, triggered: true })]);
  return game;
}

/** Answer Qiyana's "draw 1 or channel 1 rune exhausted" with the draw, however the engine phrases it; returns whether it was asked/applied. */
async function takeQiyanaDrawIfOffered(game: Game): Promise<boolean> {
  let sawQiyana = false;
  for (let i = 0; i < 10; i++) {
    if (game.chain().some((c) => c.cardId === "qiyana")) {
      sawQiyana = true;
    }
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "pick" && d.seat === P1) {
      sawQiyana = true;
      const draw = d.options.find((o) => /draw/i.test(o.label)) ?? d.options[0]!;
      await game.p1.pick(draw.key);
    } else if (d.kind === "yes-no" && d.seat === P1) {
      sawQiyana = true;
      await game.p1.yes();
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  await game.settle();
  return sawQiyana;
}

describe("Ruling 831ccbe9b6c10751 — kill the unit in response to Reckoner's Arena and its conquer effect is never activated", () => {
  test("control: nobody responds → the Arena resolves, Qiyana (still here) has her conquer effect activated onto the chain, and P1 takes 'draw 1' (hand: turn draw + d-card from Qiyana)", async () => {
    const game = await arenaTriggerPending();
    const asked = await takeQiyanaDrawIfOffered(game);
    expect(asked).toBe(true);
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("qiyana")).toBe("battlefield-arena");
    // P1 drew its normal card for the turn AND one more from Qiyana.
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
  });

  test("P2 responds to the Arena trigger with Big Bolt on Qiyana (paying the Deflect [rainbow]): Bolt sits above the Arena item and resolves first — Qiyana dies with the Arena trigger still pending", async () => {
    const game = await arenaTriggerPending();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.do("addResources", { energy: 1, power: { fury: 1 } });
    expect(game.p2.can("cast", "bolt")).toBe(true);
    await game.p2.cast("bolt", { targets: "qiyana" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // [1] + Deflect's [rainbow]
    expect(game.chain().map((c) => c.cardId)).toEqual(["arena", "bolt"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Bolt resolves
    expect(game.zoneOf("qiyana")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["arena"]);
  });

  test("… then the Arena trigger resolves and finds NO unit here: nothing is added to the chain — no Qiyana item, no draw/channel choice for P1, P1's hand is just its turn draw", async () => {
    const game = await arenaTriggerPending();
    await game.p1.passPriority();
    await game.p2.do("addResources", { energy: 1, power: { fury: 1 } });
    await game.p2.cast("bolt", { targets: "qiyana" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    const asked = await takeQiyanaDrawIfOffered(game);
    expect(asked).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toEqual(["d1"]); // only the normal draw
    expect(game.p1.points()).toBe(1); // the hold point itself was never in question
    expect(game.violations()).toEqual([]);
  });
});
