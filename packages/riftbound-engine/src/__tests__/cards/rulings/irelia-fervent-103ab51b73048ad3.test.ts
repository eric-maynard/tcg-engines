/**
 * Ruling 103ab51b73048ad3 — Irelia, Fervent (SFD-057 → sfd-057-221) · Champion Unit · Calm · [5] · 4 Might
 *   "[Deflect] … When you choose or ready me, give me +1 [Might] this turn."
 *   × Blade Dancer (SFD-195 → sfd-195-221) · Legend (Irelia)
 *     "When you choose a friendly unit, you may exhaust me and pay [rainbow] to ready it. …"
 *   Irelia is chosen by her controller's Discipline (ogn-058-298, "[Reaction] Give a unit +2 [Might] this turn. Draw 1.").
 *
 * Q: I choose my 4-Might Irelia with a spell, then use the legend to ready her — does she get +1 for the legend
 *    "choosing" her?
 * A: No +1 for choosing (Blade Dancer readies "it" — it does not choose/target her), but YES +1 for being readied.
 *    Net from the legend's effect: exactly +1.
 * Rules: 355.10.d(.1) (what counts as "choosing"), 415.1 (Ready), 383.3.b (exhaust + pay [rainbow] is the
 *        trigger's cost).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const IRELIA = "sfd-057-221";
const BLADE_DANCER = "sfd-195-221";
const DISCIPLINE = "ogn-058-298";

/** P1's turn. Irelia (4) EXHAUSTED in base; Discipline in hand; [2] for Discipline + 1 rainbow for Blade Dancer. */
function board(withLegend = true) {
  const b = scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .unit(P1, "base", IRELIA, "irelia", { exhausted: true })
    .hand(P1, DISCIPLINE, "disc");
  return withLegend ? b.legend(P1, BLADE_DANCER, "bd") : b;
}

function isBladeDancerOffer(d: Decision | null): boolean {
  if (!d || d.seat !== P1) {
    return false;
  }
  if (d.kind === "yes-no") {
    return d.source?.cardId === "bd" || /Blade Dancer/i.test(d.prompt);
  }
  return d.kind === "pick" && d.allowDecline && (d.source?.cardId === "bd" || /Blade Dancer/i.test(d.prompt));
}

/** Drive the chain to empty, ACCEPTING Blade Dancer's offer whenever shown; returns how many offers appeared. */
async function settleAcceptingBladeDancer(game: Game): Promise<number> {
  let offers = 0;
  for (let i = 0; i < 30; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (isBladeDancerOffer(d)) {
      offers += 1;
      if (d.kind === "yes-no") {
        await game.p1.yes();
      } else if (d.kind === "pick") {
        await game.p1.pick(d.options[0]?.key as string);
      }
      continue;
    }
    if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
      continue;
    }
    if (d.kind === "pick" && d.options.length === 1) {
      await game.seat(d.seat).pick(d.options[0]?.key as string);
      continue;
    }
    if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
      continue;
    }
    break;
  }
  return offers;
}

describe("Ruling 103ab51b73048ad3 — Blade Dancer readying a spell-chosen Irelia: +1 for the ready, none for 'choosing'", () => {
  test("baseline without the legend: Discipline CHOOSES exhausted Irelia → 4 + 2 (Discipline) + 1 (chosen) = 7, still exhausted", async () => {
    const game = await board(false).build();
    await game.p1.cast("disc", { targets: "irelia" });
    expect(game.chain().map((i) => `${i.cardId}${i.triggered ? "*" : ""}`)).toEqual(["disc", "irelia*"]);
    await game.settle();
    expect(game.state("irelia").might).toBe(7);
    expect(game.state("irelia").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
  });

  test("with Blade Dancer: choosing Irelia also triggers the legend; P1 is OFFERED 'exhaust me and pay [rainbow]' as its own decision", async () => {
    const game = await board().build();
    await game.p1.cast("disc", { targets: "irelia" });
    let sawOffer = false;
    for (let i = 0; i < 12 && !sawOffer; i++) {
      const d = game.decision();
      if (isBladeDancerOffer(d)) {
        sawOffer = true;
        break;
      }
      if (d?.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d?.kind === "order" && d.defaultable) {
        await game.acceptTriggerOrder();
      } else {
        break;
      }
    }
    expect(sawOffer).toBe(true);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "bd" } });
    // Blade Dancer's trigger sits on the chain above Discipline and Irelia's own "chosen" trigger.
    expect(game.chain().map((i) => `${i.cardId}${i.triggered ? "*" : ""}`)).toEqual(["disc", "irelia*", "bd*"]);
    expect(game.state("irelia").might).toBe(4); // nothing has resolved yet
  });

  test("accepting: legend exhausted + rainbow paid; Irelia is READIED (+1 via 'ready me') but NOT 'chosen' by the legend → she ends at 8 (4+2+1+1), not 9", async () => {
    const game = await board().build();
    await game.p1.cast("disc", { targets: "irelia" });
    const offers = await settleAcceptingBladeDancer(game);
    expect(offers).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.state("bd").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.state("irelia").isReady).toBe(true); // readied by Blade Dancer
    expect(game.state("irelia").might).toBe(8); // exactly +1 from the legend's effect
    expect(game.violations()).toEqual([]);
  });

  test("declining the legend: nothing readied, nothing extra — Irelia stays exhausted at 7; legend ready, rainbow kept", async () => {
    const game = await board().build();
    await game.p1.cast("disc", { targets: "irelia" });
    for (let i = 0; i < 30; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (isBladeDancerOffer(d)) {
        await (d.kind === "yes-no" ? game.p1.no() : game.p1.decline());
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d.kind === "order" && d.defaultable) {
        await game.acceptTriggerOrder();
      } else if (d.kind === "pick" && d.options.length === 1) {
        await game.seat(d.seat).pick(d.options[0]?.key as string);
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("irelia")).toMatchObject({ isExhausted: true, might: 7 });
    expect(game.state("bd").isExhausted).toBe(false);
    expect(game.p1.power("rainbow")).toBe(1);
  });
});
