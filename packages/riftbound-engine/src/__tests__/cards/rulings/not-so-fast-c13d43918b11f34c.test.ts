/**
 * Ruling c13d43918b11f34c — Not So Fast (SFD-045 → sfd-045-221) · Reaction · Calm · [2][calm]
 *   "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × Overzealous Fan (SFD-128 → sfd-128-221) · Unit · Chaos · [2] · 2 Might
 *   "When I defend, you may kill me to move an attacking unit to its base."
 *
 * Q: Can Not So Fast target Overzealous Fan's ability?
 * A: Yes — the trigger chooses a (to the attacker) friendly unit. The NSF window is BEFORE the trigger
 *    resolves; if NSF counters it, the Fan's controller never gets the choice to kill the Fan. If the trigger
 *    is allowed to resolve, the Fan's controller may kill it to send the attacker home, and there is no NSF
 *    window at that point.
 * Rules: 383 (triggered abilities on the chain), 412 (Counter), 355 (choosing targets at finalize).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const OVERZEALOUS_FAN = "sfd-128-221";

/** P1's turn. P2 holds bf1 with the Fan; P1's Charger (5) attacks from base; P1 holds NSF with exactly [2][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", OVERZEALOUS_FAN, "fan")
    .unit(P1, "base", { might: 5, name: "Charger" }, "charger")
    .hand(P1, NOT_SO_FAST, "nsf");
}

const isFanOffer = (d: Decision | null) => d?.kind === "yes-no" && d.seat === P2 && (d.source?.cardId === "fan" || /Overzealous Fan/.test(d.prompt));

/**
 * Charger attacks; drive until P1 holds chain priority with the Fan's trigger on the chain. P2 wants to use
 * the Fan, so any opt-in it is shown on the way is answered "yes" and any target pick names the Charger.
 * Returns how many times P2 was offered the Fan's choice before P1's window.
 */
async function attackUntilP1Window(game: Game): Promise<number> {
  let offers = 0;
  await game.p1.move("charger", "bf1");
  expect(game.state("fan").combatRole).toBe("defender");
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (isFanOffer(d)) {
      offers += 1;
      await game.p2.yes();
    } else if (d?.kind === "pick" && d.seat === P2) {
      await game.p2.pick(d.options.find((o) => (o.card ?? o.key) === "charger")?.key ?? d.options[0]!.key);
    } else if (d?.kind === "action" && d.context === "chain" && d.seat === P2) {
      await game.p2.passPriority();
    } else {
      break;
    }
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", controller: P2, triggered: true })]);
  return offers;
}

describe("Ruling c13d43918b11f34c — Not So Fast can counter Overzealous Fan's defend trigger", () => {
  test("the Fan's trigger chooses P1's attacking unit, so NSF offers it as a legal object; NSF resolves first and counters it — Charger stays at bf1", async () => {
    const game = await board().build();
    await attackUntilP1Window(game);
    expect(game.p1.can("cast", "nsf")).toBe(true);
    const offered = (game.p1.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(["fan"]);
    await game.p1.cast("nsf");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["fan", "nsf"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // NSF resolves (LIFO) and counters the trigger; the countered trigger leaves
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.zoneOf("charger")).toBe("battlefield-bf1"); // never moved
    expect(game.state("charger").combatRole).toBe("attacker");
  });

  // RULING-CONFLICT: riftjudge c13d43918b11f34c (pre-Unleashed) puts the "you may kill me" on RESOLUTION, so a countered
  // trigger would leave the Fan alive. CR 204.3.a (its own example is Overzealous Fan: "In order to finalize the ability to the
  // chain, its controller must kill Overzealous Fan"), 383.3.a/.b, 404.1 (paid to finalize, before anyone holds priority —
  // 406.4) and 425.1.c (a counter refunds no cost) say the opposite; Unleashed-era rulings 347a9365bc85ec43 / a6a4e61cf7a5ceee
  // agree. Engine follows the CR: P2 is asked (and the Fan dies) BEFORE P1's NSF window; countering only stops the move.
  test("CR 204.3.a / 425.1.c (contra ruling c13d43918b11f34c) — P2 kills the Fan at finalization, before the NSF window; NSF then counters the ability: Charger stays, the Fan stays dead", async () => {
    const game = await board().build();
    const offersBefore = await attackUntilP1Window(game);
    expect(offersBefore).toBe(1); // asked while the trigger was finalized
    expect(game.zoneOf("fan")).toBe("trash"); // …and paid
    await game.p1.cast("nsf");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(isFanOffer(game.decision())).toBe(false); // nothing more is asked
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.zoneOf("charger")).toBe("battlefield-bf1");
  });

  test("contrast — P1 lets the trigger resolve: P2 IS given the choice (a yes-no for P2), kills the Fan, and Charger is moved to its base; NSF is no longer castable afterwards", async () => {
    const game = await board().build();
    let offers = 0;
    await game.p1.move("charger", "bf1");
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (isFanOffer(d)) {
        offers += 1;
        expect(d).toMatchObject({ kind: "yes-no", seat: P2 });
        await game.p2.yes();
      } else if (d?.kind === "pick" && d.seat === P2) {
        await game.p2.pick(d.options.find((o) => (o.card ?? o.key) === "charger")?.key ?? d.options[0]!.key);
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority(); // P1 declines to NSF
      } else {
        break;
      }
    }
    expect(offers).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.zoneOf("charger")).toBe("base");
    expect(game.zoneOf("nsf")).toBe("hand");
    expect(game.p1.can("cast", "nsf")).toBe(false); // nothing left to counter
  });
});
