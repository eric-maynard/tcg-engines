/**
 * Ruling b9a88df37a35379b — Soraka, Wanderer (SFD-173 → sfd-173-221) · Champion Unit · Order · 4+[order] · 4 Might
 *     "I must be assigned combat damage last. If another unit you control here would die, if it has less Might than me,
 *      instead heal it, exhaust it, and recall it."
 *   × Unchecked Power (OGN-123 → ogn-123-298) · 7+[mind][mind] "Exhaust all friendly units, then deal 12 to ALL units at battlefields."
 *   × Guardian Angel (SFD-051 → sfd-051-221) · Equipment +1 "If I would die, kill Guardian Angel instead. Heal me, exhaust me, and recall me."
 *
 * Q: Soraka is destroyed SIMULTANEOUSLY with the other units at her battlefield (Unchecked Power) — does she still save them?
 * A: Yes. The deaths are simultaneous, so Soraka is still "here" when her replacement is applied to the others' deaths:
 *    eligible units (friendly, here, less Might than her) are healed, exhausted and recalled; then Soraka herself dies —
 *    unless something like Guardian Angel saves her, in which case her controller orders the replacements and can apply
 *    Soraka's first (saving the others) and GA second (saving Soraka).
 * Rules: 369–373 (replacement effects; controller orders them; simultaneous events), 372.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SORAKA = "sfd-173-221";
const UNCHECKED_POWER = "ogn-123-298";
const GUARDIAN_ANGEL = "sfd-051-221";

/** P2's turn with [7]+[mind][mind]. P1 holds bf1 with Soraka (4), Pawn A (2), Pawn B (3) and Biggie (5). */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 7, power: { mind: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SORAKA, "soraka")
    .unit(P1, "bf1", { might: 2, name: "Pawn A" }, "pa")
    .unit(P1, "bf1", { might: 3, name: "Pawn B" }, "pb")
    .unit(P1, "bf1", { might: 5, name: "Biggie" }, "big")
    .hand(P2, UNCHECKED_POWER, "up");
}

/** Settle, letting P1 answer any replacement ordering by putting `first` first. Returns whether P1 was asked anything. */
async function resolvePreferring(game: Game, first: string): Promise<boolean> {
  let asked = false;
  for (let i = 0; i < 12; i++) {
    const r = await game.settle();
    if (r.reason !== "unanswered") {
      break;
    }
    const d = game.decision();
    if (d?.seat !== P1) {
      break;
    }
    asked = true;
    if (d.kind === "pick") {
      await game.p1.pick(d.options.find((o) => (o.card ?? o.key) === first)?.key ?? d.options[0]!.key);
    } else if (d.kind === "order") {
      const items = [...d.items].sort((a, b) => ((a.card ?? a.key) === first ? -1 : (b.card ?? b.key) === first ? 1 : 0));
      await game.p1.order(items.map((o) => o.key));
    } else if (d.kind === "yes-no") {
      await game.p1.yes();
    } else {
      break;
    }
  }
  return asked;
}

describe("Ruling b9a88df37a35379b — Soraka dying simultaneously with her battlefield still saves the smaller units there", () => {
  test("Unchecked Power kills everything at bf1 at once: Pawn A (2) and Pawn B (3) — less Might than Soraka (4) — are INSTEAD healed, exhausted and recalled; Biggie (5) and Soraka herself die", async () => {
    const game = await board().build();
    await game.p2.cast("up");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await resolvePreferring(game, "soraka");
    expect(game.zoneOf("up")).toBe("trash");
    for (const p of ["pa", "pb"]) {
      expect(game.zoneOf(p)).toBe("base");
      expect(game.state(p)).toMatchObject({ damage: 0, isExhausted: true });
    }
    expect(game.zoneOf("big")).toBe("trash"); // not less Might than Soraka
    expect(game.zoneOf("soraka")).toBe("trash"); // nothing saves her
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller ?? null).not.toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("control: a unit of Soraka's that is NOT 'here' (Pawn C at bf2) is not saved — it just dies to the 12", async () => {
    const game = await board().battlefield("bf2", { controller: P1 }).unit(P1, "bf2", { might: 1, name: "Pawn C" }, "pc").build();
    await game.p2.cast("up");
    await resolvePreferring(game, "soraka");
    expect(game.zoneOf("pc")).toBe("trash");
    expect(game.zoneOf("pa")).toBe("base");
  });

  // Expected (ruling nuance): with Guardian Angel on Soraka, P1 orders the replacements — Soraka's first (Pawn A, 2 < 5, is
  // healed/exhausted/recalled while Soraka is still "here"), then GA saves Soraka (GA dies; Soraka recalled exhausted).
  // End state: Pawn A AND Soraka both in base, GA in trash. Actual: the engine applies GA to Soraka's death first with no
  // ordering offered to P1; Soraka has left bf1 when Pawn A's death is processed, so Pawn A dies.
  test("ruling b9a88df37a35379b — with Guardian Angel on Soraka the engine recalls Soraka first and lets Pawn A die; ruling: P1 may order Soraka's save first so both survive", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 7, power: { mind: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SORAKA, "soraka", { equippedWith: ["ga"] })
      .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "soraka" }, owner: P1, zone: "bf1" })
      .unit(P1, "bf1", { might: 2, name: "Pawn A" }, "pa")
      .hand(P2, UNCHECKED_POWER, "up")
      .build();
    expect(game.state("soraka").might).toBe(5); // 4 + GA
    await game.p2.cast("up");
    await resolvePreferring(game, "soraka");
    expect(game.zoneOf("pa")).toBe("base");
    expect(game.state("pa")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("soraka")).toBe("base");
    expect(game.state("soraka")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("ga")).toBe("trash");
  });
});
