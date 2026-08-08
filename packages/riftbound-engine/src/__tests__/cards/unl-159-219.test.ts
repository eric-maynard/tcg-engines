/**
 * Soul Harvest — unl-159-219 · Spell · Order · 2 energy + [order]
 *
 *   Kill a unit at a battlefield with 3 [Might] or less.
 *
 * No [Action]/[Reaction] tag → standard timing: only on your own turn, in an Open state (empty chain, no
 * showdown). "3 [Might] or less" reads CURRENT Might (buffs / this-turn modifiers count, marked damage
 * does not change Might). "At a battlefield" — either player's unit, never one in a base.
 *
 * Rules: 359.3.e.2/4 (a target whose Might has grown past 3, or that left the battlefield, by the time the
 * spell resolves is illegal → the kill is skipped, the spell still counts as played and goes to trash),
 * 428.1.a.1.b (a killed unit's Deathknell goes on the chain), 355 (no legal target → cannot be played).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Threshold is inclusive and live: exactly 3 dies; 4 is not even offered; a 4 shrunk to 3 by Stupefy
 *     this turn IS offered; a printed 3 wearing a buff (4) is NOT.
 *  2. Damage is not -Might: a 5-Might unit with 4 damage on it is still a 5 and cannot be harvested.
 *  3. Counterplay window: P2 answers with Discipline (+2 this turn) on the chosen unit → on resolution it is
 *     a 5 → nothing dies, Soul Harvest is still spent.
 *  4. Friendly fire is legal (any "unit"), base units are not, and with no ≤3 unit at any battlefield the
 *     spell is simply unplayable.
 *  5. Killing LeBlanc, Fragmented (3 Might, Deathknell: draw 1) hands her owner a card — the kill is a
 *     real death, not a discard/banish.
 *  6. Timing: not on the opponent's turn, not inside a showdown, not as a response on a chain.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-159-219";
const STUPEFY = "ogn-095-298"; // [Reaction] 1: Give a unit -1 Might this turn (min 1). Draw 1.
const DISCIPLINE = "ogn-058-298"; // [Reaction] 2: Give a unit +2 Might this turn. Draw 1.
const LEBLANC = "unl-172-219"; // 3 Might, [Deathknell] Draw 1

function board(energy = 2, order = 1) {
  return scenario()
    .resources(P1, { energy, power: { order } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Three" }, "three")
    .unit(P2, "bf1", { might: 4, name: "Four" }, "four")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf2", { might: 1, name: "Mine" }, "mine")
    .hand(P1, CARD, "sh");
}

const targetsOf = (game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) =>
  ((game.p1.option("cast", "sh")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][]).map((t) => t[0]).sort();

describe("Soul Harvest (unl-159-219)", () => {
  test("registry payload matches the printed text: one spell ability killing a unit at a battlefield filtered to Might ≤ 3; 2 energy + [order]; standard timing", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "order", energyCost: 2, name: "Soul Harvest", timing: "standard" });
    expect(def?.powerCost).toEqual(["order"]);
    expect(def?.abilities).toEqual([
      { effect: { target: { filter: { might: { lte: 3 } }, location: "battlefield", type: "unit" }, type: "kill" }, type: "spell" },
    ]);
  });

  test("kills the chosen 3-Might unit at a battlefield; costs exactly 2 energy + 1 order; the spell ends in the trash", async () => {
    const game = await board().build();
    await game.p1.cast("sh", { targets: "three" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("sh")).toBe("chain");
    await game.settle();
    expect(game.zoneOf("three")).toBe("trash");
    expect(game.zoneOf("four")).toBe("battlefield-bf1");
    expect(game.zoneOf("mine")).toBe("battlefield-bf2");
    expect(game.zoneOf("sh")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(0); // no rider
    expect(game.p2.hand()).toHaveLength(0);
    expect(game.violations()).toEqual([]);
  });

  test("legal targets: ≤3-Might units AT A BATTLEFIELD on either side (the 3 and my own 1) — never the 4, never a unit in a base", async () => {
    const game = await board().build();
    expect(targetsOf(game)).toEqual(["mine", "three"]);
    expect((await game.p1.try((p) => p.cast("sh", { targets: "four" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("sh", { targets: "home" }))).ok).toBe(false);
    // Friendly fire is fine.
    await game.p1.cast("sh", { targets: "mine" });
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
  });

  test("no unit of 3 or less at any battlefield → the spell cannot be played at all (even fully funded)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { order: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Four" }, "four")
      .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
      .hand(P1, CARD, "sh")
      .build();
    expect(game.p1.can("cast", "sh")).toBe(false);
  });

  test("cost: 1 energy, or 2 energy without an ORDER power (fury instead), cannot pay", async () => {
    expect((await board(1, 1).build()).p1.can("cast", "sh")).toBe(false);
    expect((await board(2, 0).build()).p1.can("cast", "sh")).toBe(false);
    const offDomain = await scenario().resources(P1, { energy: 2, power: { fury: 1 } }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 1 }, "u").hand(P1, CARD, "sh").build();
    expect(offDomain.p1.can("cast", "sh")).toBe(false);
  });

  test("Might is read live, buffs count: a printed-3 unit wearing a buff (4) is not offered; a printed-4 unit shrunk by Stupefy to 3 this turn is offered and dies", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "BuffedThree" }, "buffed3", { buffed: true })
      .unit(P2, "bf1", { might: 4, name: "Four" }, "four")
      .hand(P1, STUPEFY, "stupefy")
      .hand(P1, CARD, "sh")
      .build();
    expect(game.state("buffed3").might).toBe(4);
    expect(game.p1.can("cast", "sh")).toBe(false); // nothing ≤3 yet
    await game.p1.cast("stupefy", { targets: "four" });
    await game.settle();
    expect(game.state("four").might).toBe(3);
    expect(targetsOf(game)).toEqual(["four"]);
    await game.p1.cast("sh", { targets: "four" });
    await game.settle();
    expect(game.zoneOf("four")).toBe("trash");
    expect(game.zoneOf("buffed3")).toBe("battlefield-bf1");
  });

  test("damage is not a Might reduction: a 5-Might unit carrying 4 damage is still a 5 and cannot be harvested", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Bruised" }, "bruised", { damage: 4 })
      .hand(P1, CARD, "sh")
      .build();
    expect(game.state("bruised")).toMatchObject({ damage: 4, might: 5 });
    expect(game.p1.can("cast", "sh")).toBe(false);
  });

  test("359.3.e.2 counterplay: P2 answers with Discipline (+2 this turn) on the chosen 3 → it is a 5 when Soul Harvest resolves → nothing dies, the spell is still spent", async () => {
    const game = await board().resources(P2, { energy: 2 }).hand(P2, DISCIPLINE, "disc").build();
    await game.p1.cast("sh", { targets: "three" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.cast("disc", { targets: "three" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["sh", "disc"]);
    await game.settle();
    expect(game.state("three")).toMatchObject({ might: 5, zone: "battlefield-bf1" });
    expect(game.zoneOf("sh")).toBe("trash");
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // no refund
  });

  test("359.3.e.2 the other way: the target leaving the battlefield (P2 Retreats it to hand in response) also blanks the kill — it is in hand, not trash", async () => {
    const game = await board().resources(P2, { energy: 1 }).hand(P2, "ogn-104-298", "retreat").build();
    await game.p1.cast("sh", { targets: "three" });
    await game.p1.passPriority();
    await game.p2.cast("retreat", { targets: "three" });
    await game.settle({ policy: "first" }); // Retreat's "channel 1 rune exhausted" rider may prompt
    expect(game.zoneOf("three")).toBe("hand");
    expect(game.zoneOf("sh")).toBe("trash");
  });

  test("a real death: harvesting LeBlanc, Fragmented (3 Might, [Deathknell] draw 1) at a battlefield sends her to the trash and her OWNER (P2) draws 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", LEBLANC, "leb")
      .hand(P1, CARD, "sh")
      .build();
    expect(game.state("leb").might).toBe(3); // Assault only matters while attacking
    await game.p1.cast("sh", { targets: "leb" });
    await game.settle();
    expect(game.zoneOf("leb")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(1);
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("timing — standard speed only: not on the opponent's turn, not inside a showdown, not as a response while something is on the chain", async () => {
    const theirs = await board().active(P2).build();
    expect(theirs.p1.can("cast", "sh")).toBe(false);

    const showdown = await board().battlefield("open", { controller: null }).unit(P1, "base", { might: 1, name: "Scout" }, "scout").build();
    await showdown.p1.move("scout", "open");
    expect(showdown.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(showdown.p1.can("cast", "sh")).toBe(false);

    const chain = await board(3, 1).hand(P1, STUPEFY, "stupefy").build();
    await chain.p1.cast("stupefy", { targets: "four" });
    expect(chain.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(chain.p1.can("cast", "sh")).toBe(false);
    await chain.settle();
    expect(chain.p1.can("cast", "sh")).toBe(true); // chain empty again → fine
  });
});
