/**
 * Immortal Phoenix — ogn-037-298 · Unit · Fury · 3 energy + [fury] · 3 might
 *
 *   [Assault 2] (+2 [Might] while I'm an attacker.)
 *   When you kill a unit with a spell, you may pay [1][fury] to play me from your trash.
 *
 * Rule 807 — Assault X: +X Might while the unit holds the Attacker designation.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-037-298";
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

/** P1 has Phoenix in trash, a 3-damage bolt in hand, and a killable enemy unit. */
function trashSetup(resources = { energy: 2, power: { fury: 1 } }) {
  return scenario()
    .resources(P1, resources)
    .unit(P2, "base", { might: 3 }, "victim")
    .trash(P1, CARD, "phoenix")
    .hand(P1, BOLT, "bolt");
}

describe("Immortal Phoenix (ogn-037-298)", () => {
  test("costs 3 energy + 1 fury to play from hand", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, CARD, "phoenix").build();
    await game.p1.play("phoenix");
    await game.settle();
    expect(game.zoneOf("phoenix")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    const short = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "phoenix").build();
    expect(short.p1.can("play", "phoenix")).toBe(false);
  });

  test("Assault 2: as an attacker it fights at 5 Might (kills a 4-might defender)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4 }, "defender")
      .unit(P1, "base", CARD, "phoenix")
      .build();
    await game.p1.move("phoenix", "bf1");
    await game.settle();
    // 3 base + 2 Assault = 5 ≥ 4 kills the defender; rule 807.1.c: Assault is real Might while
    // attacking, so the 4 back is not lethal (4 < 5) — Phoenix survives and conquers.
    expect(game.zoneOf("defender")).toBe("trash");
    expect(game.locationOf("phoenix")).toBe("bf1");
  });

  test("Assault 2 is exactly +2: a 5-might defender dies, a 6-might defender survives", async () => {
    const five = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5 }, "defender")
      .unit(P1, "base", CARD, "phoenix")
      .build();
    await five.p1.move("phoenix", "bf1");
    await five.settle();
    expect(five.zoneOf("defender")).toBe("trash");
    const six = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6 }, "defender")
      .unit(P1, "base", CARD, "phoenix")
      .build();
    await six.p1.move("phoenix", "bf1");
    await six.settle();
    expect(six.locationOf("defender")).toBe("bf1");
  });

  test("Assault does not apply while defending (3 Might: a 3-might attacker trades with it)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "phoenix")
      .unit(P2, "base", { might: 3 }, "attacker")
      .build();
    await game.p2.move("attacker", "bf1");
    expect(game.state("phoenix").might).toBe(3);
    await game.settle();
    expect(game.zoneOf("phoenix")).toBe("trash");
  });

  test("killing a unit with your spell offers to pay [1][fury] and play Phoenix from trash", async () => {
    // After the bolt kills the victim, P1 gets a "you may pay [1][fury]" prompt; accepting
    // plays Phoenix from trash to base and drains the pool.
    const game = await trashSetup().build();
    await game.p1.cast("bolt", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("phoenix")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // 1 for bolt, 1+fury for phoenix
  });

  test("declining the trigger leaves Phoenix in the trash and spends nothing extra", async () => {
    const game = await trashSetup().build();
    await game.p1.cast("bolt", { targets: "victim" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
  });

  test("a combat kill (not a spell) does not trigger the trash play", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1 }, "victim")
      .unit(P1, "base", { might: 4 }, "attacker")
      .trash(P1, CARD, "phoenix")
      .build();
    await game.p1.move("attacker", "bf1");
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("phoenix")).toBe("trash");
  });

  test("an opponent's spell kill does not trigger YOUR Phoenix", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .resources(P2, { energy: 1 })
      .unit(P1, "base", { might: 3 }, "victim")
      .trash(P1, CARD, "phoenix")
      .hand(P2, BOLT, "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("phoenix")).toBe("trash");
  });
  // rule 366.1 / 812 — the "you may pay [1][fury] to play me from your trash" line is a
  // TRIGGERED ability, not a standing permission: sitting in the trash with no trigger on
  // the stack, Phoenix is not a playable card at all (and certainly not for free).
  test("Phoenix in the trash is NOT an at-will free play — no trigger, no permission", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { fury: 2 } })
      .trash(P1, CARD, "phoenix")
      .build();
    expect(game.p1.can("play", "phoenix")).toBe(false);
    const t = await game.p1.try((p) => p.play("phoenix"));
    expect(t.ok).toBe(false);
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 5, power: { fury: 2 } });
  });
});
