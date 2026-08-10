/**
 * Ruling e3e05bb8c3829965 — Watchful Sentry (OGN-096 → ogn-096-298) · 1 Might · "[Deathknell] — Draw 1."
 *   × Rengar, Trophy Hunter (UNL-120 → unl-120-219) · [5]+[body] · 6 Might
 *     "[Ambush] … I can be played to a battlefield where there are enemy units (even if you don't have units there)."
 *
 * Q: My Sentry holds a battlefield; the opponent attacks and kills it. If I play Rengar in response to the Deathknell
 *    trigger and win the combat, do I conquer the battlefield again and get a point?
 * A: No. You end up in control of the battlefield, but that is not a Conquer and scores nothing. [The ruling reasons via
 *    "once per battlefield per turn" and adds that if you had NOT scored there this turn you WOULD conquer — see below.]
 * Rules: 465/466 (combat damage → deaths → Deathknell chain → outcome), 190.4.b (CR: control does not change while a
 *        combat is ongoing there — the defender who returns and wins simply retains; no Conquer), 469.1 (Conquer = gaining
 *        control you did not have), 811 Ambush.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WATCHFUL_SENTRY = "ogn-096-298";
const RENGAR = "unl-120-219";

/** P2's turn. P1 holds bf1 with a lone Watchful Sentry and has Rengar + [5]+[body]. P2's Raider (3) attacks from base. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 5, power: { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", WATCHFUL_SENTRY, "sentry")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, RENGAR, "rengar")
    .deck(P1, ["ogn-175-298"], ["drawn"]);
}

/** Raider attacks; both pass Focus; combat damage is dealt (3 into the 1-Might Sentry) → Sentry dies → its Deathknell waits on the chain. */
async function sentryDiesDeathknellPending(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  await game.p2.pass();
  await game.p1.pass();
  for (let i = 0; i < 4 && game.decision()?.kind === "distribute"; i++) {
    const d = game.decision();
    if (d?.kind === "distribute") {
      await game.seat(d.seat).distribute(d.defaultAllocation ?? {});
    }
  }
  expect(game.zoneOf("sentry")).toBe("trash");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sentry", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling e3e05bb8c3829965 — Rengar answering Watchful Sentry's Deathknell wins the fight but conquers nothing", () => {
  test("1. the attack kills the Sentry; its Deathknell goes on the chain while the combat at bf1 is still unresolved — P1 still controls bf1 and nobody has scored", async () => {
    const game = await sentryDiesDeathknellPending();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("2. in response P1 may play Rengar straight to bf1 (enemy units are there); he enters, then the Deathknell resolves and P1 draws 1", async () => {
    const game = await sentryDiesDeathknellPending();
    expect(game.p1.can("play", "rengar")).toBe(true);
    const locs = (game.p1.option("play", "rengar")?.fields.find((f) => f.arg === "to")?.options ?? []) as string[];
    expect(locs).toContain("battlefield-bf1");
    await game.p1.play("rengar", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.locationOf("rengar")).toBe("bf1");
    expect(game.p1.hand()).toEqual([]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Deathknell resolves
    expect(game.p1.hand()).toEqual(["drawn"]);
  });

  test("3–4. the combat then continues with Rengar defending: he kills the Raider and P1 is left in control of bf1 — but this is NOT a Conquer: P1 gains no point (and neither does P2)", async () => {
    const game = await sentryDiesDeathknellPending();
    await game.p1.play("rengar", { to: "bf1" });
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("rengar")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    // RULING-CONFLICT: riftjudge e3e05bb8c3829965 says P1 "would successfully conquer it and gain the point" if P1 had not
    // scored bf1 yet this turn (P1 has not — it is P2's turn); CR 190.4.b (+ official 9a32c2cc829f221a) says control never
    // left P1 during the ongoing combat, so winning it is a defence, not a Conquer — engine follows CR: 0 points either way.
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: without Rengar the Raider survives alone, P2 conquers bf1 and scores 1", async () => {
    const game = await sentryDiesDeathknellPending();
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand().sort()).toEqual(["drawn", "rengar"]);
  });
});
