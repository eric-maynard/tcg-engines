/**
 * Ruling ea751c648d44fc06 — Defy (OGN-045 → ogn-045-298) · Reaction · "Counter a spell that costs no more than [4] and no more than
 *     [rainbow]." × Wind Wall (OGN-064 → ogn-064-298) · "Counter a spell."
 *   Exercised with Hextech Ray (ogn-009-298, "Deal 3 to a unit at a battlefield"), Flash (ogs-011-024, "Move up to 2 friendly
 *   units to base") and Dragon's Rage (ogn-258-298, "Move an enemy unit. Then do this: Choose another enemy unit at its
 *   destination. They deal damage equal to their Mights to each other.").
 *
 * Q: Are spell targets picked before resolution or after, and can spells fizzle?
 * A: Targets are declared when the spell is PLAYED. Spells never "fizzle": they are either countered (Defy/Wind Wall) or they
 *    resolve doing as much as they can — possibly whiffing (no effect) if a target requirement (e.g. "at a battlefield") is no
 *    longer met. Exception: reflexive "Do this:" parts choose their target on resolution.
 * Rules: 355 (targets at finalization), 359.3.e (illegal-target instruction skipped, spell still resolves), 425.1 (counter),
 *        387/388 (reflexive triggers choose when they finalize).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const HEXTECH_RAY = "ogn-009-298";
const FLASH = "ogs-011-024";
const DRAGONS_RAGE = "ogn-258-298";

/** P1's turn: Hextech Ray + [1][fury]. P2 holds bf1 with Target (2) and has Defy ([1][calm]) and Flash ([2]) with resources for both. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Target" }, "tgt")
    .unit(P2, "bf1", { might: 2, name: "Bystander" }, "by")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P2, DEFY, "defy")
    .hand(P2, FLASH, "flash");
}

async function rayAtTarget(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("ray", { targets: "tgt" });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling ea751c648d44fc06 — targets are declared on play; spells are countered or resolve (maybe whiffing), never fizzle", () => {
  test("targets are chosen when the spell is PLAYED: Hextech Ray can't go on the chain without one, and the chain item already carries it before anyone responds", async () => {
    const game = await board().build();
    const f = game.p1.option("cast", "ray")?.fields.find((x) => x.name === "targets");
    expect(f?.required).toBe(true);
    expect((f?.options ?? []).map((o) => (o as string[]).join("+")).sort()).toEqual(["by", "tgt"]); // one object per variant
    const r = await game.p1.try((p) => p.cast("ray"));
    expect(r.ok).toBe(false); // AMBIGUOUS: needs `targets`
    await game.p1.cast("ray", { targets: "tgt" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", targets: ["tgt"] })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // nothing more asked
  });

  test("resolves as much as it can: unopposed, Ray deals 3 to the declared Target (dies)", async () => {
    const game = await rayAtTarget();
    await game.settle();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("tgt")).toBe("trash");
  });

  test("COUNTERED (Defy): Ray goes to trash with no effect — the only way to stop it outright", async () => {
    const game = await rayAtTarget();
    await game.p2.cast("defy", { targets: "ray" });
    await game.settle();
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("tgt")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
  });

  test("WHIFF, not fizzle: P2 Flashes the Target to base in response; Ray still RESOLVES (to trash, not countered) but its 'unit at a battlefield' requirement fails — no damage, and it does not jump to the Bystander", async () => {
    const game = await rayAtTarget();
    await game.p2.cast("flash", { targets: ["tgt"] });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("tgt")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("by")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });

  test("nuance — reflexive 'Then do this:' (Dragon's Rage): only the moved unit is chosen on play; the OTHER enemy unit is chosen later, as the reflexive item finalizes after the move resolved", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Mover" }, "mover")
      .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry")
      .unit(P2, "bf2", { might: 1, name: "Other" }, "other")
      .hand(P1, DRAGONS_RAGE, "rage")
      .build();
    const f = game.p1.option("cast", "rage")?.fields.find((x) => x.name === "targets");
    // Single-object slot: just the unit to move — no [mover, partner] pairs are asked up front.
    expect((f?.options ?? []).map((o) => (o as string[]).join("+")).sort()).toEqual(["mover", "other", "sentry"]);
    await game.p1.cast("rage", { targets: "mover" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rage", targets: ["mover"] })]);
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    await game.p1.pick("battlefield-bf2");
    // Only NOW — after the move — is the fight partner asked for, among the enemies at the destination.
    let partnerAsked = false;
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d.kind === "pick" && d.seat === P1) {
        partnerAsked = true;
        expect(game.locationOf("mover")).toBe("bf2"); // the move already happened
        expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["other", "sentry"]);
        await game.p1.pick("sentry");
      } else {
        break;
      }
    }
    expect(partnerAsked).toBe(true);
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.state("mover").damage).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
