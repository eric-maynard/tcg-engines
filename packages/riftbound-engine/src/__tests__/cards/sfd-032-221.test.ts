/**
 * Disarming Rake — sfd-032-221 · Unit · Calm · 3 energy + [calm] · 2 Might
 *
 *   When you play me, you may kill a gear.
 *
 * Rules: 383.4.b (play effects are triggered abilities that go on the chain once the unit is
 * played), 355.6 ("a gear" = any gear on the board, friendly or enemy, tokens and attached
 * Equipment included), 208.3 (Equipment is gear), 716 / 143.1 (an Equipment that leaves the
 * board is no longer attached — its Might bonus goes with it), 185 (a killed token ceases to
 * exist), 143.4 (units enter exhausted).
 *
 * Head-judge corner cases considered:
 *   1. Optional ("you may"): declining leaves every gear in play; accepting with no gear on the
 *      board does nothing and must not wedge the game.
 *   2. Only GEAR is offered — never units, never the Rake itself.
 *   3. Enemy Equipment attached to a unit is a legal gear target; killing it must strip the
 *      holder's Might bonus (716) — the engine currently leaves the bonus behind (BUG).
 *   4. A Gold gear TOKEN is a legal target and simply ceases to exist when killed.
 *   5. The trigger is a chain item: the opponent receives priority before it resolves.
 *   6. "When you play me" fires wherever the unit is played (base or a controlled battlefield).
 *   7. Cost: 3 energy + 1 calm exactly; short on either → not playable.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-032-221";
const GUARDIAN_ANGEL = "sfd-051-221"; // Calm Equipment, Equip [calm], +1 Might

type Built = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;
const goldOf = (game: Built, seat: "p1" | "p2") => game[seat].base().filter((id) => game.state(id).name === "Gold");

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { calm: 1 } })
    .gear(P2, { cardType: "gear", name: "Enemy Trinket" }, "theirs")
    .gear(P1, { cardType: "gear", name: "My Trinket" }, "mine")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
    .hand(P1, CARD, "rake");
}

/**
 * Play the Rake and accept the "you may". The engine asks the opt-in either as the trigger is put
 * on the chain or as it resolves, so answer it whenever it appears; afterwards the game sits at the
 * target prompt (2+ gear), or back in the open main phase (0–1 gear: settle takes forced picks).
 */
async function playAndAccept(game: Built, to = "base") {
  await game.p1.play("rake", { to });
  let accepted = false;
  for (let i = 0; i < 4; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
      accepted = true;
      continue;
    }
    break;
  }
  expect(accepted).toBe(true);
}

describe("Disarming Rake (sfd-032-221)", () => {
  test("parsed abilities: one optional play-self trigger whose effect kills a gear", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 3, might: 2, powerCost: ["calm"] });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { target: { type: "gear" }, type: "kill" },
      optional: true,
      trigger: { event: "play-self" },
      type: "triggered",
    });
  });

  test("cost: pays exactly 3 energy + 1 calm, enters the base exhausted as a 2-Might unit", async () => {
    const game = await board().resources(P1, { energy: 5, power: { calm: 2 } }).build();
    await game.p1.play("rake");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1 } });
    expect(game.zoneOf("rake")).toBe("base");
    expect(game.state("rake")).toMatchObject({ baseMight: 2, isExhausted: true, might: 2 });
  });

  test("cost: not playable with 2 energy, or with 3 energy but no calm power", async () => {
    const lowEnergy = await board().resources(P1, { energy: 2, power: { calm: 1 } }).build();
    expect(lowEnergy.p1.can("play", "rake")).toBe(false);
    const noCalm = await board().resources(P1, { energy: 3, power: { calm: 0 } }).build();
    expect(noCalm.p1.can("play", "rake")).toBe(false);
  });

  test("the play trigger is a chain item and the opponent gets priority before it resolves", async () => {
    const game = await board().build();
    await game.p1.play("rake");
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes(); // opt-in asked up front; the kill itself still waits for resolution
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rake", controller: P1, triggered: true })]);
    expect(game.actingSeat()).toBe(P1);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("passPriority")).toBe(true);
    // Nothing has been killed yet — the effect only happens on resolution.
    expect(game.zoneOf("theirs")).toBe("base");
    expect(game.zoneOf("mine")).toBe("base");
  });

  test("accepting: only gear is offered (both players'), never units; the chosen enemy gear dies", async () => {
    const game = await board().build();
    await playAndAccept(game);
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card).sort() : [];
    expect(offered).toEqual(["mine", "theirs"]);
    await game.p1.pick("theirs");
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.zoneOf("mine")).toBe("base");
    expect(game.zoneOf("foe")).toBe("base");
    expect(game.zoneOf("rake")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("you may kill your OWN gear too", async () => {
    const game = await board().build();
    await playAndAccept(game);
    await game.p1.pick("mine");
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.p1.trash()).toContain("mine");
    expect(game.zoneOf("theirs")).toBe("base");
  });

  test("declining the 'you may' kills nothing and asks for no target", async () => {
    const game = await board().build();
    await game.p1.play("rake");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("theirs")).toBe("base");
    expect(game.zoneOf("mine")).toBe("base");
  });

  test("no gear anywhere: the unit still resolves cleanly and the board is untouched", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
      .hand(P1, CARD, "rake")
      .build();
    await game.p1.play("rake");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes(); // even a greedy "yes" has nothing to choose
      await game.settle();
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("rake")).toBe("base");
    expect(game.zoneOf("foe")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("played to a battlefield you control: the trigger still fires and can kill a gear", async () => {
    const game = await board().battlefield("bf1", { controller: P1 }).build();
    await playAndAccept(game, "bf1");
    expect(game.zoneOf("rake")).toBe("battlefield-bf1");
    await game.p1.pick("theirs");
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("trash");
  });

  test("a Gold gear token is a legal target and ceases to exist when killed", async () => {
    const game = await board().build();
    await game.p2.do("addToken", { playerId: P2, tokenName: "Gold", zoneId: "base" });
    const [gold] = goldOf(game, "p2");
    expect(gold).toBeDefined();
    await playAndAccept(game);
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toContain(gold);
    await game.p1.pick(gold as string);
    await game.settle();
    expect(goldOf(game, "p2")).toEqual([]);
    expect(game.p2.trash().filter((id) => game.state(id).name === "Gold")).toEqual([]);
    expect(game.zoneOf("theirs")).toBe("base");
  });

  test("an enemy Equipment attached to a unit is offered as a gear target and goes to its owner's trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .gear(P2, GUARDIAN_ANGEL, "ga", { attachedTo: "holder" })
      .unit(P2, "base", { might: 2, name: "Holder" }, "holder", { equippedWith: ["ga"] })
      .gear(P2, { cardType: "gear", name: "Bauble" }, "bauble")
      .hand(P1, CARD, "rake")
      .build();
    expect(game.state("holder").might).toBe(3); // 2 + 1 from Guardian Angel
    await playAndAccept(game);
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["bauble", "ga"]);
    await game.p1.pick("ga");
    await game.settle();
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.p2.trash()).toContain("ga");
    expect(game.zoneOf("holder")).toBe("base"); // the holder itself is not harmed
  });

  test("killing an attached Equipment must detach it — the holder loses the +1 Might (716 / 143.1)", async () => {
    // Once Guardian Angel is in the trash it is attached to nothing; Holder is back to 2 Might
    // with no attachments.
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .gear(P2, GUARDIAN_ANGEL, "ga", { attachedTo: "holder" })
      .unit(P2, "base", { might: 2, name: "Holder" }, "holder", { equippedWith: ["ga"] })
      .hand(P1, CARD, "rake")
      .build();
    expect(game.state("holder").might).toBe(3);
    await playAndAccept(game);
    await game.settle(); // single legal target → forced pick
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.state("ga").attachedTo).toBeUndefined();
    expect(game.state("holder").attachments).toEqual([]);
    expect(game.state("holder").might).toBe(2);
  });
});
