/**
 * Interaction: Overzealous Fan (sfd-128-221) "When I defend, you may kill me to move an attacking unit to its base."
 *   × Rengar, Unseen (unl-024-219) 4 Might · [Assault 2] · [Deflect] · [Ganking]
 *   × Not So Fast (sfd-045-221) 2+[calm] Reaction: "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *
 * Question: P2 holds bf1 with only the Fan; P1 moves Rengar in.
 *   (a) What does opting in cost, and when is it paid? — "you may" leads the effect → opt-in at
 *       finalization (383.3.a); "kill me to …" is a leading cost-within-instructions → the trigger's base
 *       cost, paid to finalize (383.3.b / 383.3.b.1 / 204.3.a — the CR's own example). The ability chooses
 *       "an attacking unit" = Rengar, whose Deflect taxes ABILITIES too: +1 power of any domain, a mandatory
 *       additional cost (809.1.c / 809.1.d / 356.2.a.2) paid in the same pay-costs step (404.1).
 *   (b) P2 pays; P1 answers with Not So Fast → legal (enemy ability choosing friendly Rengar). Countering
 *       refunds nothing (425.1.c / 425.1.c.1): Fan stays dead, power stays spent. Rengar remains the lone
 *       unit at bf1 → damage step skipped (465.1), P1 wins (466.3.a) and conquers (466.5.d).
 *   (c) No Not So Fast: Rengar is sent home, nobody is left → No Result, bf1 Uncontrolled (466.3.d / 466.5.b).
 *   (d) P2 has 0 power: the full cost (kill + Deflect pip) is unpayable → P2 may only decline (404.2, not a
 *       counter 404.2.a); no partial payment that kills the Fan. Fan fights 2 vs 6 and dies; Rengar conquers.
 *   (e) Vanilla attacker (no Deflect): the cost is just "kill me" — opt-in works with 0 power.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FAN = "sfd-128-221";
const RENGAR = "unl-024-219";
const NOT_SO_FAST = "sfd-045-221";

/** P1's turn. P2 controls bf1 with only the Fan; P1 has Rengar ready in base and Not So Fast in hand. */
function board(opts: { p2Power?: number; nsfMana?: boolean } = {}) {
  const b = scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", FAN, "fan")
    .unit(P1, "base", RENGAR, "rengar")
    .resources(P2, { power: { chaos: opts.p2Power ?? 1 } })
    .hand(P1, NOT_SO_FAST, "nsf");
  if (opts.nsfMana !== false) {
    b.resources(P1, { energy: 2, power: { calm: 1 } });
  }
  return b;
}

describe("Overzealous Fan × Rengar (Deflect) × Not So Fast", () => {
  // ---------------------------------------------------------------- (a) cost & timing
  test("(a) the defend trigger pends as a 'you may' opt-in for P2 at FINALIZATION — nothing is paid before P2 answers", async () => {
    const game = await board().build();
    await game.p1.move("rengar", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", controller: P2, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, timing: "FIN", canAccept: true });
    expect(game.zoneOf("fan")).toBe("battlefield-bf1");
    expect(game.p2.power()).toBe(1);
    expect(game.state("rengar").might).toBe(6); // attacker: 4 + Assault 2
  });

  test("(a) opting in pays BOTH costs at once — Fan is killed (base cost, 204.3.a) AND 1 power of any domain goes to Rengar's Deflect (809.1.d) — before anyone gets priority", async () => {
    const game = await board().build();
    await game.p1.move("rengar", "bf1");
    await game.p2.yes();
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } }); // a [chaos] power paid the any-domain Deflect pip
    // The finalized ability sits on the chain with Rengar locked as its target; P2 (who added it) holds priority.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", targets: ["rengar"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.locationOf("rengar")).toBe("bf1"); // nothing has resolved yet
  });

  // ---------------------------------------------------------------- (b) Not So Fast
  test("(b) Not So Fast is a legal answer for P1 once P2 passes: the Fan's ability is an ENEMY ability choosing FRIENDLY Rengar", async () => {
    const game = await board().build();
    await game.p1.move("rengar", "bf1");
    await game.p2.yes();
    expect(game.p1.can("cast", "nsf")).toBe(false); // P2 still holds priority (337.1.a)
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "nsf")).toBe(true);
    const targets = game.p1.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options;
    expect(targets).toEqual([["fan"]]);
    await game.p1.cast("nsf", { targets: "fan" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["fan", "nsf"]);
  });

  test("(b) countered: nothing is refunded (425.1.c) — Fan stays in the trash, P2's power stays spent, Rengar is NOT moved", async () => {
    const game = await board().build();
    await game.p1.move("rengar", "bf1");
    await game.p2.yes();
    await game.p2.passPriority();
    await game.p1.cast("nsf", { targets: "fan" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.locationOf("rengar")).toBe("bf1");
  });

  test("(b) combat then ends with no defender: damage step skipped (465.1), P1 wins (466.3.a) and conquers bf1 for 1 point (466.5.d); Rengar untouched", async () => {
    const game = await board().build();
    await game.p1.move("rengar", "bf1");
    await game.p2.yes();
    await game.p2.passPriority();
    await game.p1.cast("nsf", { targets: "fan" });
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.state("rengar")).toMatchObject({ damage: 0, location: "bf1", might: 4 }); // Assault off after combat
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ---------------------------------------------------------------- (c) no counter
  test("(c) contrast — no Not So Fast: the ability resolves, Rengar goes home, nobody is left at bf1 → No Result, bf1 Uncontrolled (466.3.d / 466.5.b); power still spent", async () => {
    const game = await board().build();
    await game.p1.move("rengar", "bf1");
    await game.p2.yes();
    await game.settle();
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.zoneOf("rengar")).toBe("base");
    expect(game.state("rengar")).toMatchObject({ controller: P1, damage: 0, isExhausted: true });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.p1.hand()).toEqual(["nsf"]); // never cast
  });

  // ---------------------------------------------------------------- (d) cannot afford Deflect
  test("(d) with 0 power P2 cannot pay the full cost (kill + Deflect pip) — 'yes' must not be acceptable and no partial payment may kill the Fan (404.2, 356.2.a.2)", async () => {
    // Expected: the opt-in reports canAccept=false; answering yes is refused (or a no-op) and the Fan
    // is still defending at bf1 with the trigger simply removed on decline. Actual: canAccept=true, the
    // engine kills the Fan (pays the base cost), cannot pay Deflect, and silently drops the ability.
    const game = await board({ p2Power: 0 }).build();
    await game.p1.move("rengar", "bf1");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    expect(game.decision()).toMatchObject({ canAccept: false });
    await game.p2.try((p) => p.yes());
    expect(game.zoneOf("fan")).toBe("battlefield-bf1");
  });

  test("(d) declining with 0 power: Fan fights — Rengar 6 (4 + Assault 2) vs Fan 2 → Fan dies in combat, Rengar survives (2 < 6) and conquers bf1", async () => {
    const game = await board({ p2Power: 0 }).build();
    await game.p1.move("rengar", "bf1");
    await game.p2.no();
    expect(game.chain()).toEqual([]); // 404.2 — removed, never finalized (not a counter, 404.2.a)
    expect(game.zoneOf("fan")).toBe("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.state("rengar")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  // ---------------------------------------------------------------- (e) no Deflect
  test("(e) contrast — a vanilla 4-Might attacker has no Deflect: the cost is just 'kill me', so P2 opts in with 0 power and sends it home", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", FAN, "fan")
      .unit(P1, "base", { might: 4, name: "Brute" }, "brute")
      .build();
    expect(game.p2.power()).toBe(0);
    await game.p1.move("brute", "bf1");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
    await game.p2.yes();
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", targets: ["brute"], triggered: true })]);
    await game.settle();
    expect(game.zoneOf("brute")).toBe("base");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(0);
  });
});
