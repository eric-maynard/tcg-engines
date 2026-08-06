/**
 * Ruling 0c137943f07300c0 — Irelia, Fervent (SFD-057 → sfd-057-221, 4 Might, Calm champion)
 *   "[Deflect] … When you choose or ready me, give me +1 [Might] this turn."
 *   × Blade Dancer (sfd-195-221, Legend) "When you choose a friendly unit, you may exhaust me and pay [rainbow]
 *     to ready it. …"
 *   Irelia is chosen here by her controller's Discipline (ogn-058-298, Reaction: "Give a unit +2 [Might] this
 *   turn. Draw 1.").
 *
 * Q: Does Blade Dancer's ability trigger Irelia's +1 Might?
 * A: Not from "choosing" — Blade Dancer does not choose/target ("ready IT" refers back to the already-chosen
 *    unit). Irelia only triggers off Blade Dancer if she was exhausted and is actually readied by it — via the
 *    ready half of her ability. Readying an already-ready unit does nothing (no trigger).
 * Rules: 355.10.d, 355.10.d.1, 415.1, 415.1.b/c.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const IRELIA = "sfd-057-221";
const BLADE_DANCER = "sfd-195-221";
const DISCIPLINE = "ogn-058-298";

/** P1: Blade Dancer legend, Irelia in base (exhausted or not), Discipline in hand; 2 energy for Discipline + 1 rainbow for Blade Dancer. */
function board(opts: { ireliaExhausted: boolean; bladeDancer?: boolean }) {
  const b = scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .unit(P1, "base", IRELIA, "irelia", opts.ireliaExhausted ? { exhausted: true } : undefined)
    .hand(P1, DISCIPLINE, "disc");
  return opts.bladeDancer === false ? b : b.legend(P1, BLADE_DANCER, "bd");
}

/** Blade Dancer's "you may exhaust me and pay [rainbow]" must surface as P1's optional decision. */
function isBladeDancerOptIn(d: Decision | null): boolean {
  if (!d || d.seat !== P1) {
    return false;
  }
  if (d.kind === "yes-no") {
    return true;
  }
  return d.kind === "pick" && d.allowDecline && (d.source?.cardId === "bd" || /Blade Dancer/i.test(d.prompt));
}

async function acceptBladeDancer(game: Game): Promise<void> {
  const d = game.decision();
  expect(isBladeDancerOptIn(d)).toBe(true);
  if (d?.kind === "yes-no") {
    await game.p1.yes();
  } else if (d?.kind === "pick") {
    await game.p1.pick(d.options[0]?.key as string);
  }
}

/** Drive the chain to empty, accepting Blade Dancer's option whenever it is offered; everything else passes. */
async function settleAcceptingBladeDancer(game: Game): Promise<number> {
  let offers = 0;
  for (let i = 0; i < 30; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (isBladeDancerOptIn(d)) {
      offers += 1;
      await acceptBladeDancer(game);
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
    break;
  }
  return offers;
}

describe("Ruling 0c137943f07300c0 — Blade Dancer readying Irelia, Fervent: +1 from the READY, none from 'choosing'", () => {
  test("baseline (choose half): P1's Discipline choosing exhausted Irelia triggers her once — 4 + 2 + 1 = 7, still exhausted", async () => {
    const game = await board({ ireliaExhausted: true, bladeDancer: false }).build();
    await game.p1.cast("disc", { targets: "irelia" });
    // Her "when you choose me" trigger is pending above Discipline right away (chosen at finalization).
    expect(game.chain().map((i) => `${i.cardId}${i.triggered ? "*" : ""}`)).toEqual(["disc", "irelia*"]);
    await game.settle();
    expect(game.state("irelia").might).toBe(7);
    expect(game.state("irelia").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
  });

  // Expected: choosing Irelia with Discipline also triggers Blade Dancer; P1 is offered "exhaust me and pay
  // [rainbow]" (a decision for P1), accepts; Blade Dancer readies Irelia WITHOUT choosing her → exactly one more
  // Irelia trigger (the ready half): 4 + 2 (Discipline) + 1 (chosen by Discipline) + 1 (readied) = 8 — not 9.
  // Blade Dancer ends exhausted, the rainbow is spent, Irelia is ready.
  // Actual: Blade Dancer's "when you choose a friendly unit" trigger never fires (the choose event carries no
  // owner, so the {controller: friendly} matcher denies it) — no offer, Irelia stays exhausted at 7.
  test.failing("BUG: ruling 0c137943f07300c0 — exhausted Irelia readied by Blade Dancer gets +1 from the ready only (ends 8, ready; legend exhausted, rainbow paid) (engine: Blade Dancer never triggers)", async () => {
    const game = await board({ ireliaExhausted: true }).build();
    await game.p1.cast("disc", { targets: "irelia" });
    const offers = await settleAcceptingBladeDancer(game);
    expect(offers).toBe(1); // Blade Dancer's option was surfaced to P1 exactly once
    expect(game.chain()).toEqual([]);
    expect(game.state("bd").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.state("irelia").isExhausted).toBe(false); // readied by Blade Dancer
    // The crux: Blade Dancer did not "choose" her — only the ready half fired. 8, not 9.
    expect(game.state("irelia").might).toBe(8);
  });

  // Expected: if Irelia is already READY, Blade Dancer still triggers off the choice and P1 may pay, but "ready it"
  // does nothing to a ready unit (415.1.b/c) — no ready event, and Blade Dancer never chose her — so Irelia gets
  // no +1 from Blade Dancer at all: she ends at 7. Actual: Blade Dancer never triggers (no offer to assert on).
  test.failing("BUG: ruling 0c137943f07300c0 — ready Irelia: Blade Dancer's ability (accepted) neither chooses nor readies her → no extra +1, she stays at 7 (engine: Blade Dancer never triggers)", async () => {
    const game = await board({ ireliaExhausted: false }).build();
    expect(game.state("irelia").isReady).toBe(true);
    await game.p1.cast("disc", { targets: "irelia" });
    const offers = await settleAcceptingBladeDancer(game);
    expect(offers).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.state("bd").isExhausted).toBe(true); // cost was paid …
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.state("irelia").isReady).toBe(true);
    expect(game.state("irelia").might).toBe(7); // … but nothing was readied and nothing was chosen by Blade Dancer
  });
});
