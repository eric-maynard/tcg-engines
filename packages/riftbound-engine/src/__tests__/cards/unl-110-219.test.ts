/**
 * Clash of Giants — unl-110-219 · Spell · Body · 6 energy + [body][body]
 *
 *   Choose two units. They deal damage equal to their Mights to each other.
 *
 * Head-judge checklist (trickiest situations for this card):
 *  1. "Two units" has NO friendly/enemy restriction (unlike Challenge): friendly+friendly,
 *     enemy+enemy and cross-location (base ↔ battlefield) pairs are all legal — but one
 *     unit named twice is not "two units", and with a single unit on the board it can't be played.
 *  2. Damage = CURRENT Might on resolution (359.3.f.2): buffs count; a STUNNED unit still deals
 *     its full Might — Stun only zeroes COMBAT damage (423.1.b) and this is not combat.
 *  3. The two instructions are linked through "each other" (359.3.e.5 / 359.3.e.14.a): if one
 *     chosen unit has left the board when Clash resolves (bounced by Gust in response), the
 *     other neither deals nor is dealt anything — and no third unit is substituted.
 *  4. No [Action]/[Reaction]: playable only on your own turn in an open state — not with Focus
 *     in a showdown, not on the opponent's turn.
 *  5. Deflect (809.1.c) on either chosen unit adds [rainbow] to the cost when an OPPONENT chooses it.
 *  6. Lethal is "damage ≥ Might": equal Mights trade, damage on survivors is healed at end of turn.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-110-219";
const GUST = "ogn-169-298"; // Chaos [Reaction] 1: return a unit at a battlefield with ≤3 Might to hand
const POUTY_PORO = "ogn-013-298"; // 2-might Deflect unit

function board(energy = 6, power: Record<string, number> = { body: 2 }) {
  return scenario()
    .resources(P1, { energy, power })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "base", { might: 5, name: "Golem" }, "golem")
    .unit(P1, "bf2", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "bf1", { might: 3, name: "Raider" }, "raider")
    .unit(P2, "base", { might: 7, name: "Colossus" }, "colossus")
    .hand(P1, CARD, "clash");
}

describe("Clash of Giants (unl-110-219)", () => {
  test("registry payload: a plain (non-Action) spell, 6 energy + 2 body, one `fight` effect between two freely chosen units", async () => {
    await board().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", energyCost: 6, powerCost: ["body", "body"] });
    expect(def?.timing).not.toBe("action");
    expect(def?.timing).not.toBe("reaction");
    expect(def?.abilities).toEqual([
      { effect: { attacker: { type: "unit" }, defender: { type: "unit" }, type: "fight" }, timing: "action", type: "spell" },
    ]);
  });

  test("cost + basic clause: pays 6 energy + 2 body; friendly 5 vs enemy 3 across locations — the 3 dies, the 5 keeps 3 damage; spell to trash", async () => {
    const game = await board().build();
    await game.p1.cast("clash", { targets: ["golem", "raider"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.zoneOf("clash")).toBe("chain");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("golem")).toBe("base");
    expect(game.state("golem").damage).toBe(3);
    expect(game.zoneOf("clash")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("unaffordable with 5 energy, or with only one body power", async () => {
    expect((await board(5).build()).p1.can("cast", "clash")).toBe(false);
    expect((await board(6, { body: 1 }).build()).p1.can("cast", "clash")).toBe(false);
    expect((await board(6, { body: 2 }).build()).p1.can("cast", "clash")).toBe(true);
  });

  test("no controller restriction: two ENEMY units may be chosen (7 into 3 — the 3 dies, the 7 takes 3)", async () => {
    const game = await board().build();
    await game.p1.cast("clash", { targets: ["colossus", "raider"] });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("colossus")).toBe("base");
    expect(game.state("colossus").damage).toBe(3);
  });

  test("no controller restriction: two FRIENDLY units may be chosen (5 into 2 — the 2 dies, the 5 takes 2)", async () => {
    const game = await board().build();
    await game.p1.cast("clash", { targets: ["golem", "scout"] });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.state("golem").damage).toBe(2);
  });

  test("equal Mights trade — both die; and 'two units' means two DIFFERENT units (the same unit twice is illegal)", async () => {
    const game = await board().unit(P2, "base", { might: 5, name: "Twin" }, "twin").build();
    const same = await game.p1.try((p) => p.cast("clash", { targets: ["golem", "golem"] }));
    expect(same.ok).toBe(false);
    expect(game.zoneOf("clash")).toBe("hand");
    await game.p1.cast("clash", { targets: ["golem", "twin"] });
    await game.settle();
    expect(game.zoneOf("golem")).toBe("trash");
    expect(game.zoneOf("twin")).toBe("trash");
  });

  test("needs two units on the board: with a single unit anywhere it is not playable", async () => {
    const solo = await scenario().resources(P1, { energy: 6, power: { body: 2 } }).unit(P2, "base", { might: 3 }, "only").hand(P1, CARD, "clash").build();
    expect(solo.p1.can("cast", "clash")).toBe(false);
    const none = await scenario().resources(P1, { energy: 6, power: { body: 2 } }).hand(P1, CARD, "clash").build();
    expect(none.p1.can("cast", "clash")).toBe(false);
  });

  test("damage is CURRENT Might: a buffed 5 (=6) deals 6; a STUNNED 3 still deals its 3 back (stun only stops combat damage, 423.1.b)", async () => {
    const game = await board()
      .unit(P1, "base", { might: 5, name: "Pumped" }, "pumped", { buffed: true })
      .unit(P2, "base", { might: 3, name: "Dazed" }, "dazed", { stunned: true })
      .build();
    expect(game.state("pumped").might).toBe(6);
    expect(game.state("dazed").isStunned).toBe(true);
    await game.p1.cast("clash", { targets: ["pumped", "dazed"] });
    await game.settle();
    expect(game.zoneOf("dazed")).toBe("trash"); // 6 ≥ 3
    expect(game.zoneOf("pumped")).toBe("base");
    expect(game.state("pumped").damage).toBe(3); // the stunned unit dealt its Might
  });

  test("survivor's damage persists through the turn and is healed at end of turn", async () => {
    const game = await board().build();
    await game.p1.cast("clash", { targets: ["golem", "raider"] });
    await game.settle();
    expect(game.state("golem").damage).toBe(3);
    await game.advanceTurn();
    expect(game.zoneOf("golem")).toBe("base");
    expect(game.state("golem").damage).toBe(0);
  });

  test("timing: no [Action] — not playable with Focus inside a showdown, and not on the opponent's turn", async () => {
    const game = await board().unit(P1, "base", { might: 1, name: "Runner" }, "runner").build();
    await game.p1.move("runner", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "clash")).toBe(false);
    const opp = await board().active(P2).build();
    expect(opp.p1.can("cast", "clash")).toBe(false);
  });

  test("Deflect on a chosen ENEMY unit adds [rainbow]: without spare power the Poro can't be chosen; with 1 extra power it can and it is spent", async () => {
    const poor = await board().unit(P2, "base", POUTY_PORO, "poro").build();
    const r = await poor.p1.try((p) => p.cast("clash", { targets: ["golem", "poro"] }));
    expect(r.ok).toBe(false);
    expect(poor.zoneOf("clash")).toBe("hand");
    const rich = await board(6, { body: 2, rainbow: 1 }).unit(P2, "base", POUTY_PORO, "poro").build();
    await rich.p1.cast("clash", { targets: ["golem", "poro"] });
    expect(rich.p1.power()).toBe(0);
    await rich.settle();
    expect(rich.zoneOf("poro")).toBe("trash"); // 5 ≥ 2
    expect(rich.state("golem").damage).toBe(2);
  });

  test("linked 'each other' (359.3.e.5) — if one chosen unit is bounced in response, the other must neither deal nor take damage and no bystander may be substituted", async () => {
    // P1: Clash on scout(2, at bf2) + colossus(7). P2 responds with Gust returning scout to hand.
    // Expected: Clash resolves doing nothing — colossus undamaged, golem/raider (never chosen) untouched.
    // Actual: the fight handler drops the bounced target, shifts colossus into the first slot and
    // auto-resolves a NEW second unit (golem) — colossus takes 5 and golem is killed by 7.
    const game = await board().resources(P2, { energy: 1 }).hand(P2, GUST, "gust").build();
    await game.p1.cast("clash", { targets: ["scout", "colossus"] });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("gust", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.zoneOf("clash")).toBe("trash");
    expect(game.state("colossus").damage).toBe(0);
    expect(game.zoneOf("colossus")).toBe("base");
    expect(game.state("golem").damage).toBe(0);
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.state("raider").damage).toBe(0);
  });
});
