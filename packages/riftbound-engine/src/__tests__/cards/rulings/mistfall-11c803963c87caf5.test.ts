/**
 * Ruling 11c803963c87caf5 — Mistfall (OGN-152 → ogn-152-298) · Gear · Body · 3
 *   "When you buff a friendly unit, you may pay [body] and exhaust this to ready it."
 *   × Irelia's legend Blade Dancer (sfd-195-221) "When you choose a friendly unit, you may exhaust me and pay
 *     [rainbow] to ready it. …"  (The Dreaming Tree ogn-292-298 is cited as the analogous "choose" trigger.)
 *
 * Q: Does Mistfall (readying the buffed unit) trigger Irelia's "when you choose a friendly unit" ability?
 * A: No. Mistfall does not target — "ready IT" refers back to the unit that was buffed; nothing is chosen.
 *    "Choosing" = targeting; only cards that explicitly choose a unit trigger that ability.
 * Rules: 355.10 (what counts as choosing/targeting), 355.10.c.1 (costs/refer-backs don't target),
 *        383.4.b.2 (Targeting-Effect triggers fire on an actual choice).
 *
 * The buff comes from Cithria of Cloudfield (ogn-139-298, "When you play another unit, buff me") — a self-buff
 * that chooses nothing either, so the only possible "choose" in the line would be Mistfall's.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MISTFALL = "ogn-152-298";
const BLADE_DANCER = "sfd-195-221";
const CITHRIA = "ogn-139-298";
const DISCIPLINE = "ogn-058-298"; // 2 · Reaction · "Give a unit +2 [Might] this turn. Draw 1." — an explicit choose

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1, rainbow: 1 } })
    .legend(P1, BLADE_DANCER, "bd")
    .gear(P1, MISTFALL, "mistfall")
    .unit(P1, "base", CITHRIA, "cithria", { exhausted: true })
    .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
    .hand(P1, { cardType: "unit", energyCost: 0, might: 1, name: "Recruit" }, "recruit")
    .hand(P1, DISCIPLINE, "disc");
}

/** Drive the chain to empty accepting every P1 opt-in; return every decision seen. */
async function driveAcceptingAll(game: Game): Promise<Decision[]> {
  const seen: Decision[] = [];
  for (let i = 0; i < 30; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    seen.push(d);
    if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (d.kind === "pick" && d.options.length === 1) {
      await game.seat(d.seat).pick(d.options[0]?.key as string);
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  return seen;
}

const fromBladeDancer = (d: Decision) => d.source?.cardId === "bd" || /Blade Dancer/.test(d.prompt);

describe("Ruling 11c803963c87caf5 — Mistfall readies without choosing, so Blade Dancer's 'when you choose a friendly unit' never triggers", () => {
  test("ruling 11c803963c87caf5 — Recruit played → Cithria buffs herself → Mistfall offered (P1 pays [body], exhausts it) → Cithria readied; Blade Dancer is NEVER offered, stays ready, [rainbow] unspent", async () => {
    const game = await board().build();
    expect(game.state("cithria")).toMatchObject({ isBuffed: false, isExhausted: true });
    await game.p1.play("recruit");
    const seen = await driveAcceptingAll(game);
    // Mistfall's opt-in was surfaced to P1 and taken …
    expect(seen.some((d) => d.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "mistfall")).toBe(true);
    expect(game.state("mistfall").isExhausted).toBe(true);
    expect(game.p1.power("body")).toBe(0);
    expect(game.state("cithria")).toMatchObject({ isBuffed: true, isReady: true, might: 2 });
    // … but nothing in this line CHOSE Cithria: no Blade Dancer trigger, no Blade Dancer prompt, cost untouched.
    expect(seen.some(fromBladeDancer)).toBe(false);
    expect(seen.filter((d) => d.kind === "yes-no")).toHaveLength(1); // only Mistfall asked
    expect(game.state("bd").isExhausted).toBe(false);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.chain()).toEqual([]);
  });

  test("control — an explicit choose DOES trigger it: Discipline choosing the exhausted Cithria surfaces Blade Dancer's opt-in to P1; accepting exhausts the legend and readies her", async () => {
    const game = await board().build();
    await game.p1.cast("disc", { targets: "cithria" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "bd" } });
    const seen = await driveAcceptingAll(game);
    expect(seen.some(fromBladeDancer)).toBe(true);
    expect(game.state("bd").isExhausted).toBe(true);
    expect(game.state("cithria").isReady).toBe(true);
    expect(game.state("cithria").might).toBe(3); // 1 + 2 from Discipline
    // Mistfall was not involved (no buff happened).
    expect(game.state("mistfall").isExhausted).toBe(false);
  });
});
