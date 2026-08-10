/**
 * Ruling 3d4de183e60e2708 — Not So Fast (SFD-045 → sfd-045-221) [Reaction] 2+[calm] "Counter an enemy spell or ability that
 *   chooses a friendly unit or gear."
 *   × Void Seeker (OGN-024 → ogn-024-298) [Action] 3+[fury] "Deal 4 to a unit at a battlefield. Draw 1." (Hextech Ray alike)
 *
 * Q: Against a targeting spell like Void Seeker, can I react with Not So Fast immediately when it is played, or only after
 *    the target is declared?
 * A: The target is chosen as the spell is put on the chain, before anyone can react. The caster then holds priority (and may
 *    add their own reactions) and only when they pass do you get to play Not So Fast.
 * Rules: 355.5 (choices made when the spell is played/finalized), 336–338 (caster gets priority first; passing hands it over),
 *        811.6 / Reaction timing.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const VOID_SEEKER = "ogn-024-298";
const DISCIPLINE = "ogn-058-298"; // a Reaction in the CASTER's hand, to show they may pile on before passing

/** P1's turn. P2's 5-Might Target holds bf1. P1: Void Seeker + Discipline, 5 energy + [fury]. P2: Not So Fast + 2+[calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { fury: 1 } })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Target" }, "tgt")
    .hand(P1, VOID_SEEKER, "vs")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P2, NOT_SO_FAST, "nsf")
    .deck(P1, ["ogn-175-298"], ["p1top"]);
}

function targetsOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const opt = game[seat].option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets" || f.arg === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

describe("Ruling 3d4de183e60e2708 — Not So Fast answers a targeting spell only after its target is locked and the caster passes", () => {
  test("Void Seeker's target is part of playing it: the cast REQUIRES the target, and the chain item already names it before anyone can respond", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "vs")?.fields.find((f) => f.arg === "targets");
    expect(field?.required).toBe(true);
    expect(targetsOffered(game, "p1", "vs")).toEqual(["tgt"]);
    await game.p1.cast("vs", { targets: "tgt" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vs", controller: P1, targets: ["tgt"] })]);
  });

  test("right after the cast the CASTER (P1) holds priority — P2 has no action yet and cannot play Not So Fast; P1 could still add its own Reaction first", async () => {
    const game = await board().build();
    await game.p1.cast("vs", { targets: "tgt" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.legal()).toEqual([]);
    expect(game.p2.can("cast", "nsf")).toBe(false);
    const early = await game.p2.try((p) => p.cast("nsf", { targets: "vs" }));
    expect(early.ok).toBe(false);
    expect(game.p1.can("cast", "disc")).toBe(true); // "may add any reactions they wish while they have priority"
  });

  test("once P1 passes priority, P2 may play Not So Fast on the Void Seeker (an enemy spell that chose P2's unit); it resolves first and counters it: no damage, no draw, nothing refunded", async () => {
    const game = await board().build();
    await game.p1.cast("vs", { targets: "tgt" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "nsf")).toBe(true);
    expect(targetsOffered(game, "p2", "nsf")).toEqual(["vs"]);
    await game.p2.cast("nsf", { targets: "vs" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "nsf"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.state("tgt")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.p1.hand()).toEqual(["disc"]); // no "Draw 1"
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0 } }); // Void Seeker's 3+[fury] stays spent
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
