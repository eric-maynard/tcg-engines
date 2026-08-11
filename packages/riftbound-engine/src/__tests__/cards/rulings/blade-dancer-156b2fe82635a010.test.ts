/**
 * Ruling 156b2fe82635a010 — Blade Dancer (SFD-195 → sfd-195-221) · Legend · Irelia
 *   "When you choose a friendly unit, you may exhaust me and pay [rainbow] to ready it.
 *    When you conquer, you may pay [1] to ready me."
 *   × En Garde (ogn-046-298) · Reaction [1] "Give a friendly unit +1 [Might] this turn, then an
 *     additional +1 [Might] this turn if it is the only unit you control there." — the "choose".
 *
 * Q: Can the legend's ready-a-unit ability be used several times in one turn off a single target,
 *    or must the trigger condition be met again for each use?
 * A: It is a TRIGGERED ability, not an activated one: it fires only when you choose a friendly unit,
 *    so every extra use needs another choose. Readying the legend (the conquer clause) does not by
 *    itself hand you another use.
 * Rules: 383 (triggered abilities need their event), 383.3.b / 204.3.a (the "you may [cost] to" cost
 *        is paid at finalization), 355.10 (choosing/targeting), 415.1 (ready).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLADE_DANCER = "sfd-195-221";
const EN_GARDE = "ogn-046-298";

/**
 * P1's turn with [6] + 3 rainbow. Blade Dancer is P1's legend; bf1 is empty and uncontrolled (a
 * conquer waiting to happen). Two exhausted allies and a ready Scout sit in P1's base; three En Gardes
 * in hand supply the "choose a friendly unit" events.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { rainbow: 3 } })
    .legend(P1, BLADE_DANCER, "bd")
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally", { exhausted: true })
    .unit(P1, "base", { might: 2, name: "Ally Two" }, "ally2", { exhausted: true })
    .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, EN_GARDE, "eg1")
    .hand(P1, EN_GARDE, "eg2")
    .hand(P1, EN_GARDE, "eg3");
}

/** Pass priority until the chain is empty and P1 is back in an open main phase. */
async function drain(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    break;
  }
  expect(game.chain()).toEqual([]);
}

/** The legend's "when you choose a friendly unit" offer, if it is what is being asked right now. */
function chooseOffer(game: Game): { asked: boolean } {
  const d = game.decision();
  return { asked: !!d && d.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "bd" && /exhaust/i.test(d.prompt) };
}

/** Use 1: En Garde chooses the exhausted Ally, P1 accepts the legend's offer, Ally is readied. */
async function firstUse(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("eg1", { targets: "ally" });
  expect(chooseOffer(game).asked).toBe(true);
  await game.p1.yes();
  await drain(game);
  expect(game.state("bd").isExhausted).toBe(true);
  expect(game.state("ally").isReady).toBe(true);
  expect(game.p1.resources()).toEqual({ energy: 5, power: { rainbow: 2 } });
  return game;
}

describe("Ruling 156b2fe82635a010 — Blade Dancer's ready is a trigger: each use needs a fresh 'choose'", () => {
  test("the ability is offered as P1's own decision the moment a friendly unit is chosen, and its item sits on the chain above the spell that chose", async () => {
    const game = await board().build();
    await game.p1.cast("eg1", { targets: "ally" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    expect(d?.source?.cardId).toBe("bd");
    expect(d?.prompt).toMatch(/Blade Dancer/);
    expect(game.chain().map((c) => c.cardId)).toEqual(["eg1", "bd"]);
    expect(game.chain()[1]).toMatchObject({ controller: P1, triggered: true });
  });

  test("use 1: accepting exhausts the legend, spends [rainbow] and readies the chosen Ally", async () => {
    const game = await firstUse();
    expect(game.state("ally")).toMatchObject({ isReady: true, might: 3 }); // En Garde +1 (not alone in base)
    expect(game.state("ally2").isReady).toBe(false);
  });

  test("a SECOND choose in the same turn does meet the trigger condition again — but with the legend already exhausted the cost cannot be paid, so no offer is made and nothing is readied", async () => {
    const game = await firstUse();
    await game.p1.cast("eg2", { targets: "ally2" });
    expect(chooseOffer(game).asked).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["eg2"]); // no Blade Dancer item — the cost is unpayable
    await drain(game);
    expect(game.state("ally2").isReady).toBe(false); // still exhausted
    expect(game.state("bd").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { rainbow: 2 } }); // only En Garde's [1] left the pool
  });

  test("nuance: READYING the legend (its own conquer clause, pay [1]) is not a substitute for the trigger — the ready happens, but no unit is readied and no choose-offer appears", async () => {
    const game = await firstUse();
    await game.p1.cast("eg2", { targets: "ally2" });
    await drain(game);
    await game.p1.move("scout", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus(); // uncontested empty battlefield → P1 conquers
    expect(game.p1.points()).toBe(1);
    // The conquer clause is a different trigger of the same legend.
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(d?.source?.cardId).toBe("bd");
    expect(d?.prompt).toMatch(/Pay \[1\]/);
    await game.p1.yes();
    await drain(game);
    expect(game.state("bd").isReady).toBe(true); // legend readied …
    expect(game.state("ally2").isReady).toBe(false); // … but no unit was readied by it
    expect(chooseOffer(game).asked).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("use 2 in the same turn is legal only once the condition is met AGAIN: a third En Garde choose re-offers the ability and readies Ally Two", async () => {
    const game = await firstUse();
    await game.p1.cast("eg2", { targets: "ally2" });
    await drain(game);
    await game.p1.move("scout", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.p1.yes(); // pay [1], ready the legend
    await drain(game);
    const energyBefore = game.p1.energy();
    await game.p1.cast("eg3", { targets: "ally2" });
    expect(chooseOffer(game).asked).toBe(true);
    expect(game.chain().map((c) => c.cardId)).toEqual(["eg3", "bd"]);
    await game.p1.yes();
    await drain(game);
    expect(game.state("ally2").isReady).toBe(true); // second use of the turn
    expect(game.state("bd").isExhausted).toBe(true);
    expect(game.p1.power("rainbow")).toBe(1); // two rainbows spent across the two uses
    expect(game.p1.energy()).toBe(energyBefore - 1); // En Garde's own [1]
    expect(game.violations()).toEqual([]);
  });

  test("the identity of the chosen unit is irrelevant — re-choosing the very same unit is a fresh trigger: with the legend ready, choosing Ally a second time offers the ability again", async () => {
    const game = await board().build();
    await game.p1.cast("eg1", { targets: "ally" });
    expect(chooseOffer(game).asked).toBe(true);
    await game.p1.no(); // decline: the legend stays ready and the rainbow unspent
    await drain(game);
    expect(game.state("bd").isReady).toBe(true);
    expect(game.state("ally").isReady).toBe(false);
    expect(game.p1.power("rainbow")).toBe(3);
    await game.p1.cast("eg2", { targets: "ally" }); // same unit, new choose
    expect(chooseOffer(game).asked).toBe(true);
    await game.p1.yes();
    await drain(game);
    expect(game.state("ally").isReady).toBe(true);
    expect(game.state("bd").isExhausted).toBe(true);
  });
});
