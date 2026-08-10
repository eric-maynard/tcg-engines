/**
 * Ruling 7995965452da4484 — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield "When you defend here, you may move a friendly
 *     unit here to base."
 *   × Sivir, Ambitious (sfd-120-221) · 7 Might · "[Deflect 2] When I conquer after an attack, if you assigned 5 or more excess
 *     damage to enemy units, you may deal that much to an enemy unit."
 *
 * Q: Does Sivir's effect trigger if she conquers an EMPTY battlefield?
 * A: No — you don't attack an empty battlefield, and her trigger needs a conquer "after an attack". Nuance: if a defender WAS
 *    at Reaver's Row and retreats via the Row, combat did begin (attacker/defender designated) so the conquer is "after an
 *    attack" — but 0 damage was assigned, so no excess damage is dealt.
 * Rules: 464.2.c (attacker/defender designations = an attack happened), 469.1 (Conquer), 466.5 (combat resolution with no
 *        defenders left), 465.2 (damage assignment — none without opposing units).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const SIVIR = "sfd-120-221";

describe("Ruling 7995965452da4484 — Sivir onto an EMPTY Reaver's Row: a conquer, but not 'after an attack' → no trigger", () => {
  test("walking onto the empty (P2-seeded, unit-less) Row: no defender, no combat roles; after the showdown P1 conquers (1 point) and NOTHING is asked or dealt — straight back to P1's main phase", async () => {
    const game = await scenario()
      .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false })
      .unit(P1, "base", SIVIR, "sivir")
      .unit(P2, "base", { might: 5, name: "MidHome" }, "midhome")
      .build();
    await game.p1.move("sivir", "row");
    expect(game.state("sivir").combatRole).not.toBe("attacker"); // nobody to attack
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("midhome").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

describe("Ruling 7995965452da4484 — nuance: a lone defender at the Row retreats; combat began, Sivir conquers 'after an attack' but with 0 damage assigned nothing is dealt", () => {
  /** P1's turn. P2 holds the live Row with a lone Sentry (2) and keeps MidHome (5) in base; Sivir (7) ready in P1's base. */
  function board() {
    return scenario()
      .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false })
      .unit(P2, "row", { might: 2, name: "Sentry" }, "sentry")
      .unit(P2, "base", { might: 5, name: "MidHome" }, "midhome")
      .unit(P1, "base", SIVIR, "sivir");
  }

  test("Sivir attacks: designations ARE assigned (attacker/defender) and the Row asks P2 (opt-in at finalization); P2 pulls the Sentry home", async () => {
    const game = await board().build();
    await game.p1.move("sivir", "row");
    expect(game.state("sivir").combatRole).toBe("attacker");
    expect(game.state("sentry").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "row" }, timing: "FIN" });
    await game.p2.yes();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("sentry");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P2, triggered: true })]);
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.locationOf("sentry")).toBe("base");
    expect(game.state("sentry").damage).toBe(0);
  });

  test("combat then resolves with no defender: Sivir conquers the Row (1 point) — and since 0 damage was assigned there is no excess to deal: no enemy unit takes damage (any offer, if made, deals nothing)", async () => {
    const game = await board().build();
    await game.p1.move("sivir", "row");
    await game.p2.yes();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("sentry");
    }
    await game.settle();
    // If the engine surfaces Sivir's "you may" at all, taking it must still deal nothing (0 excess).
    for (let i = 0; i < 3; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes();
      } else if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick((d.options[0] as { card?: string; key: string }).card ?? (d.options[0] as { key: string }).key);
      } else {
        break;
      }
      await game.settle();
    }
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("sivir")).toBe("battlefield-row");
    expect(game.state("sentry")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("midhome")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
