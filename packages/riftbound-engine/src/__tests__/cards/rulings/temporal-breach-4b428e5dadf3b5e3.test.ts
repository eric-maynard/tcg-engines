/**
 * Ruling 4b428e5dadf3b5e3 — Temporal Breach (VEN-066 → ven-066-166) · Spell · Mind · 2+[mind]
 *   "[Hidden] Banish a unit, then its owner plays it to the same location, ignoring its cost."
 *   × Pyke, Returned (unl-145-219) · Unit · Chaos · 3 · 3 Might — "[Hidden] [Backline] …" (a unit WITH Hidden)
 *
 * Q: If the unit banished by Temporal Breach has Hidden, can its owner hide it instead of playing it?
 * A: No. Hide is a separate action, not a form of play; the instruction is to PLAY it (onto the chain,
 *    to the same location). Besides, the unit is in banishment at that moment and Hidden only permits
 *    hiding from hand or the champion zone.
 * Rules: 811.1.c.1 (hide ≠ play), 419.1 (play), 421.1 (hide = facedown at a battlefield), 811.1.b.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEMPORAL_BREACH = "ven-066-166";
const PYKE = "unl-145-219";

/**
 * P1's turn. P1 controls bf1 where P1's own Pyke (a Hidden unit, 1 damage marked so "new object" is
 * observable) stands; no facedown card at bf1. P1 has exactly [2][mind] for the Breach plus a spare
 * [rainbow] that WOULD pay a hide cost if hiding were an option.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 1, rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", PYKE, "pyke", { damage: 1 })
    .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
    .hand(P1, TEMPORAL_BREACH, "breach");
}

/** True if any currently offered choice for P1 would HIDE Pyke / put it facedown. */
function hideOffered(d: Decision | null, legalLabels: readonly string[]): boolean {
  const inPrompt =
    d?.kind === "pick" ? d.options.some((o) => /hide|facedown/i.test(`${o.key} ${o.label} ${o.zone ?? ""}`)) : false;
  return inPrompt || legalLabels.some((l) => /hide .*pyke|hide Pyke/i.test(l));
}

describe("Ruling 4b428e5dadf3b5e3 — Temporal Breach: the owner must PLAY the banished unit, not hide it", () => {
  test("premise (811.1.b): Hidden lets you hide from HAND — a Pyke in hand can be hidden at bf1, a Pyke in banishment cannot", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .hand(P1, PYKE, "pykeHand")
      .banishment(P1, PYKE, "pykeBanished")
      .build();
    expect(game.p1.can("hide", "pykeHand")).toBe(true);
    expect(game.p1.can("hide", "pykeBanished")).toBe(false);
    expect(game.p1.can("play", "pykeBanished")).toBe(false); // nothing lets you act on a banished card by default
  });

  // Expected: Temporal Breach must choose a unit when played (Pyke and the enemy Bystander are both
  // "a unit"). Actual: its effect is unparsed (raw text) — the cast offers no target at all.
  test.failing("BUG: ruling 4b428e5dadf3b5e3 — casting Temporal Breach requires choosing a unit (Pyke is a legal choice); costs [2][mind]", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "breach")?.fields.find((f) => f.name === "targets");
    const offered = (field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]);
    expect(offered).toContain("pyke");
    await game.p1.cast("breach", { targets: "pyke" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, rainbow: 1 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["breach"]);
  });

  // Expected: on resolution Pyke is banished, then its owner (P1) PLAYS it to the same location (bf1),
  // ignoring its cost: it returns face up at bf1 as a new object (damage cleared), P1's banishment is
  // empty again, the spare [rainbow] is untouched and nothing is facedown at bf1. If the engine surfaces
  // any owner prompt along the way, none of its options is a hide/facedown alternative.
  // Actual: the spell resolves with no effect — Pyke never leaves bf1 (still carrying its 1 damage).
  test.failing("BUG: ruling 4b428e5dadf3b5e3 — Breach on own Hidden unit: banished then PLAYED back to bf1 face up (fresh, 0 damage); never offered as a hide, nothing facedown, [rainbow] unspent", async () => {
    const game = await board().build();
    await game.p1.cast("breach", { targets: "pyke" });
    let sawBanished = false;
    for (let i = 0; i < 8; i++) {
      const r = await game.settle();
      sawBanished ||= game.zoneOf("pyke") === "banishment";
      const d = game.decision();
      expect(hideOffered(d, game.p1.legal().map((o) => o.label))).toBe(false);
      if (r.reason !== "unanswered" || !d || d.seat !== P1) {
        break;
      }
      // Owner's play prompt (destination / confirmation): the only place it may go is bf1.
      if (d.kind === "pick") {
        const keys = d.options.map((o) => o.key);
        expect(keys.some((k) => /bf1/.test(k))).toBe(true);
        await game.p1.answer({ keys: [keys.find((k) => /bf1/.test(k)) as string], kind: "pick" });
      } else if (d.kind === "yes-no") {
        await game.p1.yes();
      } else {
        break;
      }
    }
    expect(game.zoneOf("breach")).toBe("trash");
    expect(game.zoneOf("pyke")).toBe("battlefield-bf1");
    expect(game.state("pyke").isHidden).toBe(false);
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.power("rainbow")).toBe(1); // no hide cost was ever paid
    // It really was banished and re-played (new object): the marked damage is gone.
    expect(sawBanished || game.state("pyke").damage === 0).toBe(true);
    expect(game.state("pyke").damage).toBe(0);
  });

  // Expected: while the owner is being instructed to play the banished Pyke, "hide" is simply not an
  // available action for it (it is in banishment, 811.1.b) — the harness never lists `hide Pyke`.
  // Actual: Pyke is never banished (effect unimplemented), so the premise cannot be reached.
  test.failing("BUG: ruling 4b428e5dadf3b5e3 — mid-resolution Pyke sits in banishment and `hide` is not a legal verb for it", async () => {
    const game = await board().autoProcedures(false).build();
    await game.p1.cast("breach", { targets: "pyke" });
    // Step the chain manually until Pyke has left the battlefield.
    for (let i = 0; i < 6 && game.zoneOf("pyke") === "battlefield-bf1"; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.passKey) {
        await game.acting().pass();
      } else {
        break;
      }
    }
    expect(game.zoneOf("pyke")).toBe("banishment");
    expect(game.p1.can("hide", "pyke")).toBe(false);
    expect(hideOffered(game.decision(), game.p1.legal().map((o) => o.label))).toBe(false);
  });
});
