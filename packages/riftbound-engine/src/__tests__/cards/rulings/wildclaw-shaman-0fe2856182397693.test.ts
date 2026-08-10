/**
 * Ruling 0fe2856182397693 — Wildclaw Shaman (OGN-147 → ogn-147-298) · 4 · 3 Might
 *   "When you play me, you may spend a buff to buff me and ready me."
 *   × Cithria of Cloudfield (ogn-139-298; VEN-089 is a reprint) · 1 Might · "When you play another unit, buff me."
 *
 * Q: Cithria is already buffed; I play Wildclaw Shaman and spend Cithria's buff for its ability. Can Cithria
 *    then be buffed again by her own trigger?
 * A: Yes. Playing the Shaman triggers Cithria (a new unit entered play) even though her buff is spent on the
 *    Shaman; her trigger then buffs her again. Nuance: the two triggers are simultaneous, so you order them —
 *    with an UNBUFFED Cithria you could resolve her buff first and then spend that buff to ready the Shaman.
 * Rules: 383.3.d (controller orders simultaneous triggers), 383.3.a/b (opt-in + spend cost), 702.2 (buffs).
 *
 * Model (CR 383.3.a/b, 204.3.a, 740.4.a.2): "you may [spend a buff] TO [buff me and ready me]" — the spend is the
 * trigger's BASE COST, named and paid while the item is FINALIZED (before either trigger resolves). So the headline
 * answer holds for ANY order (Cithria's buff is already spent when her own trigger resolves and re-buffs her), but the
 * nuance does not — RULING-CONFLICT: riftjudge 0fe2856182397693 (nuance) has an unbuffed Cithria's fresh buff pay the
 * Shaman "on resolution"; CR 383.3.b.1 / 404.2 (+ Unleashed-era ruling 202877fb824b2d2b, same shape) say a buff that
 * does not exist when the batch is finalized cannot pay, and the Shaman's item is removed unasked. Engine follows the CR.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WILDCLAW_SHAMAN = "ogn-147-298";
const CITHRIA = "ogn-139-298";

function board(cithriaBuffed: boolean) {
  return scenario()
    .resources(P1, { energy: 4 })
    .unit(P1, "base", CITHRIA, "cithria", cithriaBuffed ? { buffed: true } : undefined)
    .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
    .hand(P1, WILDCLAW_SHAMAN, "shaman");
}

/**
 * Drive the post-play chain: accept the Shaman's opt-in, put `onTop` on top if an order is offered, pass
 * priority otherwise. Returns whether P1 was asked the opt-in and whether an order was offered.
 */
async function drive(game: Game, onTop: "shaman" | "cithria"): Promise<{ optIn: boolean; ordered: boolean }> {
  const seen = { optIn: false, ordered: false };
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no" && d.seat === P1) {
      seen.optIn = true;
      await game.p1.yes();
    } else if (d.kind === "order" && d.seat === P1) {
      seen.ordered = true;
      const key = (c: string) => d.items.find((it) => it.card === c)?.key as string;
      const bottom = onTop === "shaman" ? "cithria" : "shaman";
      await game.p1.order([key(bottom), key(onTop)]); // last = top = resolves first
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick" && d.options.length === 1) {
      await game.seat(d.seat).pick(d.options[0]?.key as string);
    } else {
      break;
    }
  }
  return seen;
}

describe("Ruling 0fe2856182397693 — Wildclaw Shaman spending Cithria's buff; Cithria's own play trigger buffs her again", () => {
  test("playing the Shaman with a buffed Cithria: P1 is asked the Shaman's 'spend a buff?' opt-in at FINALIZATION (Cithria's trigger is on the chain too), and 'yes' spends Cithria's buff at once (383.3.b.1)", async () => {
    const game = await board(true).build();
    expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 2 });
    await game.p1.play("shaman");
    expect(game.p1.energy()).toBe(0);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "shaman" }, timing: "FIN" });
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["cithria", "shaman"]);
    expect(game.chain().every((c) => c.triggered)).toBe(true);
    await game.p1.yes();
    expect(game.state("cithria")).toMatchObject({ isBuffed: false, might: 1 }); // the lone buff paid, before anything resolves
    expect(game.state("shaman").isBuffed).toBe(false); // the payoff waits for resolution
  });

  // The ruling's headline: the Shaman spends Cithria's buff (Shaman → buffed 4 Might and READY) and Cithria's "when
  // you play another unit" trigger buffs her again → she ends buffed at 2 — under the CR for EITHER order, because the
  // spend already happened at finalization.
  for (const onTop of ["shaman", "cithria"] as const) {
    test(`ruling 0fe2856182397693 — after her buff pays for the Shaman, Cithria is buffed again by her own trigger (ends buffed, 2 Might; Shaman 4 & ready) — with ${onTop}'s trigger on top`, async () => {
      const game = await board(true).build();
      await game.p1.play("shaman");
      const seen = await drive(game, onTop);
      expect(seen.optIn).toBe(true);
      expect(game.chain()).toEqual([]);
      expect(game.state("shaman")).toMatchObject({ isBuffed: true, isReady: true, might: 4 });
      expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 2 });
      expect(game.violations()).toEqual([]);
    });
  }

  // RULING-CONFLICT (nuance): riftjudge says an UNBUFFED Cithria's trigger can be ordered first and her fresh buff then
  // pays the Shaman on resolution. CR 383.3.b.1 / 404.2: the spend is due when the batch is FINALIZED — no buff you
  // control exists then, so the Shaman's Pending item is removed unasked; only Cithria's trigger reaches the chain.
  test("CR 383.3.b.1 / 404.2 (nuance, contra the ruling) — unbuffed Cithria: the Shaman's item never reaches the chain (no opt-in, nothing to order); Cithria just gets her buff and the Shaman stays exhausted, unbuffed", async () => {
    const game = await board(false).build();
    expect(game.state("cithria").isBuffed).toBe(false);
    await game.p1.play("shaman");
    const seen = await drive(game, "cithria");
    expect(seen.optIn).toBe(false);
    expect(seen.ordered).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.state("shaman")).toMatchObject({ isBuffed: false, isExhausted: true, might: 3 });
    expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 2 });
  });

  test("baseline the ruling relies on — playing ANY unit triggers Cithria: with the Shaman's opt-in declined, Cithria (unbuffed) simply gets buffed and the Shaman enters exhausted, unbuffed", async () => {
    const game = await board(false).build();
    await game.p1.play("shaman");
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no") {
        await game.p1.no();
      } else if (d?.kind === "action" && d.context === "chain" && d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d?.kind === "order") {
        await game.acceptTriggerOrder();
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 2 });
    expect(game.state("shaman")).toMatchObject({ isBuffed: false, isExhausted: true, might: 3, zone: "base" });
  });
});
