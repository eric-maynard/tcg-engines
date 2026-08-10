/**
 * Ruling bd94892ef45e62e1 — Irelia, Fervent (SFD-057 → sfd-057-221) · Unit · 4 Might
 *     "[Deflect] … When you choose or ready me, give me +1 Might this turn."
 *   × Discipline (OGN-058 → ogn-058-298) · Spell · Calm · 2 · Reaction "Give a unit +2 Might this turn. Draw 1."
 *   × Defy (OGN-045 → ogn-045-298) · Spell · Calm · 1+[calm] · Reaction "Counter a spell that costs no more than [4] …"
 *
 * Q: I Discipline my Irelia; the opponent Defies the Discipline. Do I still get Irelia's +1 for choosing her?
 * A: Yes. Choosing her triggers her ability as Discipline is finalized; the trigger sits on the chain above Discipline.
 *    Defy goes on top → LIFO: Defy counters Discipline (no +2, no draw), then Irelia's trigger still resolves (+1).
 *    Defy can only counter spells — the trigger is not a legal Defy target.
 * Rules: 383.4.b.2 (choose-triggers fire on finalization), 340 (LIFO), 425.1 (counter removes the spell only), Defy's
 *        "a spell" (not abilities).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IRELIA_FERVENT = "sfd-057-221";
const DISCIPLINE = "ogn-058-298";
const DEFY = "ogn-045-298";

/** P1's turn: Irelia (4) in base, Discipline with exactly [2]. P2: Defy with exactly 1+[calm]. Known P1 deck top. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .unit(P1, "base", IRELIA_FERVENT, "irelia")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P2, DEFY, "defy")
    .deck(P1, ["ogn-175-298"], ["p1top"]);
}

const defyTargets = (game: Game) => (game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options ?? []).flat() as string[];

describe("Ruling bd94892ef45e62e1 — Defy on Discipline does not stop Irelia's 'when you choose me' +1", () => {
  test("1–2) casting Discipline on Irelia: her trigger is on the chain ABOVE the spell the moment it is finalized (before P2 can act)", async () => {
    const game = await board().build();
    await game.p1.cast("disc", { targets: "irelia" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "disc", controller: P1, targets: ["irelia"], triggered: false }),
      expect.objectContaining({ cardId: "irelia", controller: P1, triggered: true }),
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("irelia").might).toBe(4); // nothing resolved yet
  });

  test("3) P2's Defy may target only the SPELL (Discipline) — Irelia's triggered ability is not offered — and it goes on top of her trigger", async () => {
    const game = await board().build();
    await game.p1.cast("disc", { targets: "irelia" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(true);
    expect(defyTargets(game)).toEqual(["disc"]);
    const atTrigger = await game.p2.try((p) => p.cast("defy", { targets: "irelia" }));
    expect(atTrigger.ok).toBe(false);
    await game.p2.cast("defy", { targets: "disc" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc", "irelia", "defy"]);
  });

  test("4) LIFO: Defy counters Discipline (no +2, no draw — deck top untouched), then Irelia's trigger resolves anyway: she is 4 + 1 = 5 this turn", async () => {
    const game = await board().build();
    await game.p1.cast("disc", { targets: "irelia" });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "disc" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.p1.hand()).toEqual([]); // no "Draw 1"
    expect(game.p1.deck()[0]).toBe("p1top");
    expect(game.state("irelia")).toMatchObject({ baseMight: 4, might: 5, mightModifier: 1 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
    // "this turn"
    await game.advanceTurn();
    expect(game.state("irelia").might).toBe(4);
  });

  test("control — no Defy: both resolve; Irelia is 4 + 1 + 2 = 7 and P1 drew p1top", async () => {
    const game = await board().build();
    await game.p1.cast("disc", { targets: "irelia" });
    await game.settle();
    expect(game.state("irelia").might).toBe(7);
    expect(game.p1.hand()).toEqual(["p1top"]);
  });
});
