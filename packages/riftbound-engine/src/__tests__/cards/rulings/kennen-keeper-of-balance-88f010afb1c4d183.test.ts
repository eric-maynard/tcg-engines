/**
 * Ruling 88f010afb1c4d183 — Kennen, Keeper of Balance (VEN-135 → ven-135-166) · Unit · [3] · 2 Might
 *   "[Hidden] When you play me or I attack, you may pay [2] to [Stun] a unit."
 *
 * Q: If I play Kennen from Hidden, can I stun an enemy at a DIFFERENT battlefield?
 * A: No. Played from Hidden, "when you play me … stun a unit" is a play effect, and a hidden card's play
 *    effects may only target things at the battlefield the card was hidden at. If Kennen instead ATTACKS
 *    later, that is an ordinary triggered ability and it can stun a unit at any battlefield.
 * Rules: 383.4.a (play effect), 811.1.d.2 (a hidden card's play effects are locked to its battlefield),
 *        204.3.a / 383.3.b ("you may pay [2] to" is the trigger's cost, decided at finalization).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KENNEN = "ven-135-166";

const offered = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []);

describe("Ruling 88f010afb1c4d183 — from Hidden, Kennen's stun is locked to the battlefield he was hidden at", () => {
  test("revealed from Hidden at bf1: the stun may only be aimed at units AT bf1 — the enemy at bf2 is not offered", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P2, "bf1", { might: 2, name: "Enemy Here" }, "enemyHere")
      .unit(P2, "bf2", { might: 2, name: "Enemy There" }, "enemyThere")
      .facedown(P1, "bf1", KENNEN, "kennen")
      .build();
    expect(game.zoneOf("kennen")).toBe("facedown-bf1");

    await game.p1.reveal("kennen");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 }); // "Pay [2] to use…"
    await game.p1.yes();

    const targets = offered(game.decision());
    expect(targets).toContain("enemyHere");
    expect(targets).toContain("holder"); // "a unit" — friendly ones at bf1 count too
    expect(targets).not.toContain("enemyThere"); // 811.1.d.2 — never another battlefield

    await game.p1.pick("enemyHere");
    await game.settle();
    expect(game.locationOf("kennen")).toBe("bf1");
    expect(game.state("enemyHere").isStunned).toBe(true);
    expect(game.state("enemyThere").isStunned).toBe(false);
    expect(game.p1.energy()).toBe(0); // the [2] was paid
    expect(game.violations()).toEqual([]);
  });

  test("contrast — the SAME ability off an attack (not from Hidden) can reach a unit at any battlefield", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Enemy A" }, "enemyA")
      .unit(P2, "bf2", { might: 2, name: "Enemy B" }, "enemyB")
      .unit(P1, "base", KENNEN, "kennen")
      .build();
    await game.p1.move("kennen", "bf1");
    expect(game.state("kennen").combatRole).toBe("attacker");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();

    const targets = offered(game.decision());
    expect(targets).toContain("enemyA");
    expect(targets).toContain("enemyB"); // the other battlefield IS reachable now

    await game.p1.pick("enemyB");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("enemyB").isStunned).toBe(true);
    expect(game.state("enemyA").isStunned).toBe(false);
  });
});
