/**
 * Ruling 559920052babcc03 — Repulse (UNL-106 → unl-106-219) · Reaction · [1][body] "Choose a friendly unit at a battlefield.
 *   Counter an enemy spell or ability that chooses it and no other friendly unit."
 *   × Cull the Weak (OGN-209 → ogn-209-298) · Action · [2][order] "Each player kills one of their units."
 *   (Not So Fast sfd-045-221 / Cull sfd-134-221 are listed but only as analogous non-targeting references.)
 *
 * Q: Can you Repulse a Cull the Weak?
 * A: No. Cull the Weak does not choose/target any unit as it is played — each player picks which of their units dies while it
 *    RESOLVES — so it never "chooses a friendly unit" and is not a legal object for Repulse.
 * Rules: 355 (targets are choices made at play/finalization), 355.8 (no legal choice → can't play Repulse), 422.1.a (each player
 *        chooses among their own units on resolution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const REPULSE = "unl-106-219";
const CULL_THE_WEAK = "ogn-209-298";
/** Inline enemy Action that DOES choose one friendly unit at a battlefield (the contrast): deal 2 to a unit at a battlefield. */
const JAB = {
  abilities: [{ effect: { amount: 2, target: { location: "battlefield", type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Jab",
  timing: "action",
} as const;

/** P2's turn with [2][order] (+[1] for Jab). P1 holds bf1 with a lone Scout (2) and has Repulse + [1][body]. P2 has a Grunt in base. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { order: 1 } })
    .resources(P1, { energy: 1, power: { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 3, name: "Grunt" }, "grunt")
    .hand(P2, CULL_THE_WEAK, "cull")
    .hand(P2, JAB, "jab")
    .hand(P1, REPULSE, "repulse");
}

describe("Ruling 559920052babcc03 — Repulse cannot counter Cull the Weak (it chooses no unit when played)", () => {
  test("Cull the Weak goes on the chain with NO unit targets; with priority, P1's Repulse is not castable (no enemy spell 'chooses' the Scout) and forcing it fails", async () => {
    const game = await board().build();
    await game.p2.cast("cull"); // rule 355.10.e — nothing is named at play time (P2's lone Grunt binds on resolution; never a unit of P1)
    expect(game.p2.resources()).toEqual({ energy: 1, power: { order: 0 } });
    const item = game.chain()[0];
    expect(item).toMatchObject({ cardId: "cull", controller: P2 });
    expect(item?.targets ?? []).not.toContain("scout"); // nothing chosen at play time
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "repulse")).toBe(false);
    const r = await game.p1.try((p) => p.cast("repulse", { targets: "cull" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("repulse")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 1 } });
  });

  test("Cull the Weak then resolves un-countered: each player picks one of THEIR units on resolution — P1's only unit (Scout) and P2's Grunt die", async () => {
    const game = await board().build();
    await game.p2.cast("cull"); // rule 355.10.e — nothing is named at play time (P2's lone Grunt binds on resolution; never a unit of P1)
    await game.p2.passPriority();
    await game.p1.passPriority();
    // Resolution-time choices (a lone candidate may be taken automatically).
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "pick") {
        await game.seat(d.seat).answer({ keys: [d.options[0]!.key], kind: "pick" });
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("contrast: an enemy spell that DOES choose exactly the Scout (Jab) is a legal Repulse object — Repulse becomes castable, counters it, Scout unharmed", async () => {
    const game = await board().build();
    await game.p2.cast("jab", { targets: "scout" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jab", targets: ["scout"] })]);
    await game.p2.passPriority();
    expect(game.p1.can("cast", "repulse")).toBe(true);
    await game.p1.cast("repulse", { answers: ["scout", "jab"], targets: "jab" });
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.answer({ keys: [d.options[0]!.key], kind: "pick" });
      } else {
        break;
      }
    }
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("repulse")).toBe("trash");
    expect(game.zoneOf("jab")).toBe("trash");
    expect(game.state("scout")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
  });
});
