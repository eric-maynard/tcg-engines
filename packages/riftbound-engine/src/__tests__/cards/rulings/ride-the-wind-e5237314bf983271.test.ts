/**
 * Ruling e5237314bf983271 — Ride the Wind (OGN-173 → ogn-173-298) · [Action] · 2+[chaos] · "Move a friendly unit and ready it."
 *   × Yasuo, Remorseful (OGN-076 → ogn-076-298) · 6 Might · "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Unforgiven (Yasuo legend, OGN-259 → ogn-259-298) · "[2], [Exhaust]: Move a friendly unit to or from its base."
 *
 * Q: Can Yasuo move in, deal 6 with his attack trigger, Ride the Wind back to base before combat damage, then use the
 *    legend to move in again for another 6?
 * A: Yes — but the first combat must fully close first: with Yasuo gone the showdown ends and surviving units heal (the
 *    first 6 is wiped unless it killed). The legend ability is base speed (not usable during the showdown); back in a
 *    neutral Open State it moves the readied Yasuo in again and his trigger deals 6 once more.
 * Rules: 464.2 (attack triggers), 345–347 (Action spells need Focus; non-Reaction abilities need an Open State),
 *        440–441 (a combat with no attackers ends), 467.3 (units heal when combat ends), 419 (activated ability timing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const YASUO = "ogn-076-298";
const UNFORGIVEN = "ogn-259-298";

/** P1 (Unforgiven, ready) with [4] + 1 chaos (Ride 2+[chaos], legend [2]); Yasuo ready in base; P2's 13-Might Colossus holds bf1 (survives everything). */
function board() {
  return scenario()
    .legend(P1, UNFORGIVEN, "unforgiven")
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 13, name: "Colossus" }, "colossus")
    .unit(P1, "base", YASUO, "yasuo")
    .hand(P1, RIDE_THE_WIND, "ride");
}

/** Pass priority (never Focus) until the chain is empty. */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "pick") {
      await game.seat(d.seat).pick("colossus");
    } else {
      await game.acting().passPriority();
    }
  }
}

/** Yasuo attacks bf1; his trigger (only enemy here: Colossus) resolves for 6. P1 then holds Focus in the showdown. */
async function firstSix(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("yasuo", "bf1");
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("colossus");
  }
  expect(game.state("yasuo").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true })]);
  await resolveChain(game);
  expect(game.state("colossus").damage).toBe(6);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling e5237314bf983271 — Yasuo: attack for 6, Ride the Wind out, legend back in for another 6 (after the first combat closes and heals)", () => {
  test("steps 1–2: Yasuo moves in (exhausted, attacker) and his 'When I attack' deals 6 to the Colossus before any combat damage", async () => {
    const game = await firstSix();
    expect(game.state("yasuo")).toMatchObject({ isExhausted: true, zone: "battlefield-bf1" });
    expect(game.state("colossus")).toMatchObject({ damage: 6, zone: "battlefield-bf1" });
  });

  test("nuance: during the showdown the legend's [2],[Exhaust] ability is NOT legal (base speed), while the [Action] Ride the Wind IS (P1 holds Focus)", async () => {
    const game = await firstSix();
    expect(game.p1.can("activate", "unforgiven")).toBe(false);
    const r = await game.p1.try((p) => p.activate("unforgiven"));
    expect(r.ok).toBe(false);
    expect(game.p1.can("cast", "ride")).toBe(true);
  });

  test("step 3–5: Ride the Wind moves Yasuo back to base READY before combat damage; with no attacker left the showdown closes, the Colossus HEALS (6 → 0), nobody took combat damage, and play returns to P1's neutral main phase", async () => {
    const game = await firstSix();
    await game.p1.cast("ride", { targets: "yasuo" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0 } });
    const r = await game.settle();
    if (r.reason === "unanswered" && game.decision()?.kind === "pick") {
      await game.p1.pick("base");
      await game.settle();
    }
    expect(game.zoneOf("ride")).toBe("trash");
    expect(game.state("yasuo")).toMatchObject({ damage: 0, isReady: true, zone: "base" });
    expect(game.state("colossus")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // healed at end of combat
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("step 6–7: NOW the legend is legal — [2], Exhaust: move Yasuo (ready, from base) to bf1 → a fresh combat, he attacks again and his trigger deals another 6 to the (healed) Colossus", async () => {
    const game = await firstSix();
    await game.p1.cast("ride", { targets: "yasuo" });
    let r = await game.settle();
    if (r.reason === "unanswered" && game.decision()?.kind === "pick") {
      await game.p1.pick("base");
      await game.settle();
    }
    expect(game.p1.can("activate", "unforgiven")).toBe(true);
    await game.p1.activate("unforgiven");
    expect(game.state("unforgiven").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
    // Resolve the legend ability (mover / destination are forced: Yasuo → bf1), then Yasuo's new attack trigger.
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d) {
        break;
      }
      if (d.kind === "pick") {
        const key = d.options.find((o) => /yasuo|bf1|colossus/.test(String(o.card ?? o.zone ?? o.key)))?.key ?? (d.options[0]?.key as string);
        await game.seat(d.seat).pick(key);
      } else if (d.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.zoneOf("yasuo")).toBe("battlefield-bf1");
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.state("colossus").damage).toBe(6); // the second 6 (the first was healed away)
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    r = await game.settle(); // let this combat run: 6-Might Yasuo into a 13-Might Colossus
    expect(r.reason).toBe("open");
    expect(game.zoneOf("colossus")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });
});
