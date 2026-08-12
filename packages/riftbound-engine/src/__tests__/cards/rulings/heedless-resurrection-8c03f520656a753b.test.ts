/**
 * Ruling 8c03f520656a753b — Heedless Resurrection (UNL-142 → unl-142-219) · Spell · Chaos · [2][chaos] · [Reaction]
 *     "As an additional cost to play this, kill a friendly unit. Play a unit from your trash that costs no more
 *      Energy and no more Power than the killed unit, ignoring its cost."
 *   × Rhasa the Sunderer (OGN-195 → ogn-195-298) · 6 Might · "[10][chaos], I cost [1] less for each card in your trash."
 *   × Shipyard Skulker (OGN-175 → ogn-175-298) · 3 Might · [3] — the cheap body waiting in the trash.
 *
 * Q: If I kill Rhasa — my only unit at a battlefield — to pay for Heedless Resurrection, can I play the
 *    resurrected unit to the battlefield Rhasa was standing on?
 * A: Yes. The spell is still on the chain, so the game is in a Closed State and no Cleanup runs that would drop
 *    your control of the emptied battlefield. It is still "a battlefield you control" when the spell resolves,
 *    and so a legal destination. Control lapses only at the first Open-State Cleanup after the chain empties.
 * Rules: 187.4.c / 190.4 / 323.6 (control lapses only in an Open-State Cleanup), 401.1 (a resolving spell keeps
 *        the state Closed), 357.1 (additional cost paid at finalization).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEEDLESS = "unl-142-219";
const RHASA = "ogn-195-298";
const SKULKER = "ogn-175-298";

/** P1's turn. P1 controls bf1 with Rhasa as its ONLY unit there; a Skulker sits in P1's trash. [2][chaos] in pool. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", RHASA, "rhasa")
    .unit(P2, "bf2", { might: 2, name: "Their Guard" }, "theirs")
    .trash(P1, SKULKER, "corpse")
    .hand(P1, HEEDLESS, "hr");
}

/** Cast Heedless Resurrection, killing Rhasa as the additional cost. */
async function castKillingRhasa(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.units("bf1")).toEqual(["rhasa"]);
  await game.p1.cast("hr", { sacrifice: "rhasa" });
  return game;
}

describe("Ruling 8c03f520656a753b — the emptied battlefield is still yours while the spell resolves", () => {
  test("the additional cost is paid as the spell goes on the chain: Rhasa is in the trash and bf1 has none of P1's units left", async () => {
    const game = await castKillingRhasa();
    expect(game.zoneOf("rhasa")).toBe("trash");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hr", controller: P1 })]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  test("… and P1 does NOT lose bf1 while the spell is on the chain — the state is Closed, so no control Cleanup runs", async () => {
    const game = await castKillingRhasa();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.battlefields({ controlled: true })).toContain("bf1");
  });

  test("on resolution the Skulker is chosen from the trash and bf1 — the battlefield Rhasa was standing on — is offered as a destination", async () => {
    const game = await castKillingRhasa();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Heedless Resurrection resolves
    let d = game.decision();
    if (d?.kind === "pick" && (d as PickDecision).options.some((o) => o.card === "corpse")) {
      await game.p1.pick("corpse");
      d = game.decision();
    }
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const dests = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(dests).toContain("battlefield-bf1");
    await game.p1.pick("battlefield-bf1");
    expect(game.zoneOf("corpse")).toBe("battlefield-bf1");
  });

  test("end state: the resurrected Skulker stands at bf1, P1 still controls it, and Rhasa stays dead", async () => {
    const game = await castKillingRhasa();
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      const d = game.decision();
      if (d?.kind === "pick" && d.options.some((o) => o.card === "corpse")) {
        await game.p1.pick("corpse");
      }
    }
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("hr")).toBe("trash");
    expect(game.zoneOf("rhasa")).toBe("trash");
    expect(game.locationOf("corpse")).toBe("bf1");
    expect(game.p1.units("bf1")).toEqual(["corpse"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
