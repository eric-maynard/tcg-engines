/**
 * Ruling 554a192ffa8800ea — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2][calm] · [Hidden]
 *   "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Irelia, Fervent (sfd-057-221) · 4 Might · "[Deflect] When you choose or ready me, give me +1 [Might] this turn." — a
 *     "was I chosen?" detector;  × Void Seeker (ogn-024-298, [Action] [3][fury]) "Deal 4 to a unit at a battlefield. Draw 1."
 *
 * Q: Do recall effects (like Zhonya's) target / choose units?
 * A: Not inherently. Zhonya's is a REPLACEMENT effect (passive "If … instead"): it never targets and does not use the
 *    chain; a choice made while it applies (e.g. which of several simultaneously dying units to save) is not targeting.
 * Rules: 371–373 (replacement effects; controller picks among simultaneous events), 355.10 (what "targets"), 383.4.b
 *        ("when you choose" = targeting triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const IRELIA_FERVENT = "sfd-057-221";
const VOID_SEEKER = "ogn-024-298";

type PickD = Extract<Decision, { kind: "pick" }>;

/** P2's turn. P1 holds bf1 with Irelia (4, ready); Zhonya's face up in P1's base. P2: Void Seeker + [3][fury] + 1 spare power for Deflect. */
function spellBoard() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 3, power: { fury: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", IRELIA_FERVENT, "irelia")
    .unit(P2, "bf2", { might: 1, name: "Holder" }, "holder")
    .gear(P1, ZHONYAS, "zh")
    .hand(P2, VOID_SEEKER, "seeker");
}

/** P2's turn. P1 holds bf1 with Irelia (4) and Pal (2); Zhonya's in P1's base; P2's 8-Might Brute attacks. */
function combatBoard() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", IRELIA_FERVENT, "irelia")
    .unit(P1, "bf1", { might: 2, name: "Pal" }, "pal")
    .unit(P2, "bf2", { might: 1, name: "Holder" }, "holder")
    .gear(P1, ZHONYAS, "zh")
    .unit(P2, "base", { might: 8, name: "Brute" }, "brute");
}

describe("Ruling 554a192ffa8800ea — Zhonya's Hourglass is a replacement effect: it neither targets nor uses the chain", () => {
  test("Void Seeker's lethal 4 on Irelia: Zhonya's is killed INSTEAD, Irelia is healed, exhausted and recalled — and no chain item was ever created for it", async () => {
    const game = await spellBoard().build();
    expect(game.state("irelia")).toMatchObject({ isReady: true, might: 4 });
    await game.p2.cast("seeker", { targets: "irelia" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // [3][fury] + Deflect's 1 (P2 is an opponent)
    expect(game.chain().map((c) => c.cardId)).toEqual(["seeker"]); // an OPPONENT choosing her triggers nothing
    await game.p2.passPriority();
    await game.p1.passPriority(); // Void Seeker resolves → Irelia would die → replaced
    expect(game.chain()).toEqual([]); // the replacement did not go on the chain
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("irelia")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
  });

  test("…and it did not TARGET her: Irelia's 'When you choose me' never fired — she is still exactly 4 Might (no +1 this turn)", async () => {
    const game = await spellBoard().build();
    await game.p2.cast("seeker", { targets: "irelia" });
    await game.settle();
    expect(game.state("irelia")).toMatchObject({ might: 4, mightModifier: 0, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("simultaneous deaths (8 into Irelia 4 + Pal 2): P1 makes a CHOICE — surfaced as a replacement-assign pick, not a target pick — of which death Zhonya's replaces", async () => {
    const game = await combatBoard().build();
    await game.p2.move("brute", "bf1");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "replacement-assign", timing: "RPL" });
    expect((d as PickD).semantics).not.toBe("target");
    expect((d as PickD).options.map((o) => o.card ?? o.key).sort()).toEqual(["irelia", "pal"]);
    expect(game.chain()).toEqual([]); // still nothing on the chain
  });

  test("choosing Irelia there is still not 'choosing' her with a spell/ability: she is saved to base at 4 Might with no +1; Pal dies; the Brute conquers", async () => {
    const game = await combatBoard().build();
    await game.p2.move("brute", "bf1");
    await game.settle();
    await game.p1.pick("irelia");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.state("irelia")).toMatchObject({ damage: 0, isExhausted: true, might: 4, mightModifier: 0, zone: "base" });
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
