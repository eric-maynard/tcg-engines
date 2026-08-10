/**
 * Ruling e9d08ebb63562e25 — Diana, No Longer Human (UNL-149 → unl-149-219) · Champion Unit · Chaos · 4+[chaos] · 3 Might
 *     "[Ambush] … When you play a spell, give me +2 [Might] this turn."
 *   × Heedless Resurrection (UNL-142 → unl-142-219) · Spell · Chaos · 2+[chaos] · Reaction
 *     "As an additional cost to play this, kill a friendly unit. Play a unit from your trash that costs no more Energy and no
 *      more Power than the killed unit, ignoring its cost."
 *
 * Q: Does Diana get +2 when SHE is the unit brought back by Heedless Resurrection?
 * A: No. Her trigger fires when you play a spell while she is on the board; being put onto the board by the resolving spell
 *    is not her seeing that spell played. (Had she already been on the board, Heedless Resurrection would give her +2.)
 * Rules: 419.4.a (play-a-spell triggers fire as the spell completes), 383.1 (a triggered ability must be in play when its
 *        condition is met), 346/356.2 (additional cost), Diana's text.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DIANA = "unl-149-219";
const HEEDLESS_RESURRECTION = "unl-142-219";

/** A 4+[chaos] vanilla Victim — killing it makes a 4+[chaos] Diana (or the 3-cost Spare) a legal revive. */
const VICTIM = { cardType: "unit", energyCost: 4, might: 4, name: "Victim", powerCost: ["chaos"] } as const;
const SPARE = { cardType: "unit", energyCost: 3, might: 2, name: "Spare" } as const;

/** Drive: pass priority; when the revive pick comes, take `revive`. */
async function resolveReviving(game: Game, revive: string): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key)).toContain(revive);
      await game.p1.pick(revive);
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).no();
    } else {
      break;
    }
  }
}

describe("Ruling e9d08ebb63562e25 — Diana revived BY Heedless Resurrection does not see it as 'you played a spell'", () => {
  test("Diana in the trash: Heedless Resurrection (kill Victim as its cost) resolves and plays Diana to base for free — she arrives at her printed 3 Might, no +2, and no Diana trigger is ever put on the chain", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .unit(P1, "base", VICTIM, "victim")
      .trash(P1, DIANA, "diana")
      .hand(P1, HEEDLESS_RESURRECTION, "hr")
      .build();
    await game.p1.cast("hr", { sacrifice: "victim" });
    expect(game.zoneOf("victim")).toBe("trash"); // additional cost paid up front
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["hr"]);
    await resolveReviving(game, "diana");
    expect(game.zoneOf("hr")).toBe("trash");
    expect(game.state("diana")).toMatchObject({ might: 3, mightModifier: 0, zone: "base" });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    // Through the whole line no Diana item ever appeared.
    await game.settle();
    expect(game.state("diana")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Diana ALREADY on the board when Heedless Resurrection is played (reviving a Spare): once the spell resolves her trigger fires and she gets +2 this turn (3 → 5)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .unit(P1, "base", DIANA, "diana")
      .unit(P1, "base", VICTIM, "victim")
      .trash(P1, SPARE, "spare")
      .hand(P1, HEEDLESS_RESURRECTION, "hr")
      .build();
    expect(game.state("diana").might).toBe(3);
    await game.p1.cast("hr", { sacrifice: "victim" });
    // While the spell is merely on the chain nothing has triggered yet (419.4.a).
    expect(game.state("diana")).toMatchObject({ might: 3, mightModifier: 0 });
    await resolveReviving(game, "spare");
    await game.settle();
    expect(game.zoneOf("spare")).toBe("base");
    expect(game.state("diana")).toMatchObject({ might: 5, mightModifier: 2, zone: "base" });
  });

  test("contrast persists into the same position: with Diana on board AND a second Diana-less revive target, only the on-board copy is buffed — the revived unit never is", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .unit(P1, "base", DIANA, "onboard")
      .unit(P1, "base", VICTIM, "victim")
      .trash(P1, DIANA, "revived")
      .hand(P1, HEEDLESS_RESURRECTION, "hr")
      .build();
    await game.p1.cast("hr", { sacrifice: "victim" });
    await resolveReviving(game, "revived");
    await game.settle();
    expect(game.state("revived")).toMatchObject({ might: 3, mightModifier: 0, zone: "base" });
    expect(game.state("onboard")).toMatchObject({ might: 5, mightModifier: 2, zone: "base" });
  });
});
