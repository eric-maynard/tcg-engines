/**
 * Ruling 93112876b9baecf1 — Deadbloom Predator (OGN-161 → ogn-161-298) · 8 Might · "[Deflect] (Opponents must pay
 *     [rainbow] to choose me with a spell or ability.) You may play me to an occupied enemy battlefield."
 *   × Cull the Weak (OGN-209 → ogn-209-298) · 2 + [order] · "Each player kills one of their units."
 *     (scrape also lists Cull sfd-134-221 — name collision only)
 *
 * Q: Does Deflect apply when the opponent's Cull the Weak leaves Deadbloom Predator as the only unit that can be chosen?
 * A: No. Cull the Weak doesn't target; the choices are made on resolution and each player picks their OWN unit — so
 *    Deadbloom's controller (not the opponent) is the one choosing it, even when it is the only option. No Deflect.
 * Rules: 809 (Deflect taxes an OPPONENT choosing), 355.16 (resolution-time choices), 422.1.a (each player picks theirs).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEADBLOOM = "ogn-161-298";
const CULL_THE_WEAK = "ogn-209-298";

/** P1's turn with EXACTLY 2 + [order] (no spare Power for any Deflect tax); Pawn (1) in base. P2's only unit: Deadbloom at its bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", DEADBLOOM, "deadbloom")
    .unit(P1, "base", { might: 1, name: "Pawn" }, "pawn")
    .hand(P1, CULL_THE_WEAK, "cull");
}

describe("Ruling 93112876b9baecf1 — Deflect never taxes Cull the Weak: Deadbloom's own controller chooses it", () => {
  test("P1 can cast Cull the Weak with no Power to spare — nothing (let alone Deadbloom) is chosen by P1 at play time, so no [rainbow] is demanded", async () => {
    const game = await board().build();
    expect(game.state("deadbloom").keywords).toContain("Deflect");
    expect(game.p1.can("cast", "cull")).toBe(true);
    const targets = (game.p1.option("cast", "cull")?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][];
    expect(targets.flat()).not.toContain("deadbloom"); // the caster never picks the enemy unit
    await game.p1.cast("cull");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // just the printed cost
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1 })]);
  });

  test("ruling 93112876b9baecf1 — on resolution the Deadbloom pick (if asked at all) belongs to P2, carries no Deflect surcharge, and Deadbloom dies; P1 paid nothing extra", async () => {
    const game = await board().build();
    await game.p1.cast("cull");
    await game.p1.passPriority();
    await game.p2.passPriority();
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind !== "pick") {
        break;
      }
      if (d.options.some((o) => (o.card ?? o.key) === "deadbloom")) {
        // The only chooser of Deadbloom is its controller.
        expect(d.seat).toBe(P2);
        expect(d.options.find((o) => (o.card ?? o.key) === "deadbloom")?.deflect ?? 0).toBe(0);
        await game.p2.pick("deadbloom");
      } else {
        await game.seat(d.seat).pick(d.options[0]?.key as string);
      }
    }
    await game.settle();
    expect(game.zoneOf("deadbloom")).toBe("trash");
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("at no point is P1 (the opponent) the seat asked to choose Deadbloom", async () => {
    const game = await board().build();
    await game.p1.cast("cull");
    const p1AskedAboutDeadbloom: boolean[] = [];
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick") {
        p1AskedAboutDeadbloom.push(d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "deadbloom"));
        await game.seat(d.seat).pick(d.options[0]?.key as string);
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(p1AskedAboutDeadbloom.some(Boolean)).toBe(false);
    expect(game.zoneOf("deadbloom")).toBe("trash");
  });
});
