/**
 * Ruling adc5174843bc420d — Irresistible Faefolk (UNL-112 → unl-112-219) · Unit · Body · 2 · 1 Might
 *   "When I move to a battlefield, you may move an enemy unit to that battlefield."
 *   × Gust (ogn-169-298) "[Reaction] Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: If an opponent responds to the move trigger by removing Faefolk from the battlefield (e.g. Gust),
 *    does the enemy unit still move?
 * A: Yes. "That battlefield" is referenced from the trigger condition and is fixed when the trigger
 *    condition is met (Faefolk moved there). The triggered ability is an independent chain item; Gusting
 *    Faefolk back to hand does not stop it — on resolution the enemy unit moves to that battlefield.
 * Rules: 359.3.f.3 (trigger-condition info fixed at trigger time), contrast 359.3.f.1 / 359.3.f.2.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FAEFOLK = "unl-112-219";
const GUST = "ogn-169-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn. P1 controls bf1 (a 2-might guard already there, so no showdown opens on arrival).
 * Faefolk waits in P1's base. P2's "foe" (2 might) sits at P2's bf2; P2 holds Gust with exactly [1].
 */
function board() {
  return scenario()
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", FAEFOLK, "fae")
    .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe")
    .hand(P2, GUST, "gust");
}

/** Answer P1's "you may move an enemy unit" prompt(s) by choosing `foe` (yes → pick, or a direct pick). */
async function chooseFoe(game: Game): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await game.settle();
    const d: Decision | null = game.decision();
    if (!d || d.seat !== P1 || d.kind === "action") {
      return;
    }
    if (d.kind === "yes-no") {
      await game.p1.yes();
    } else if (d.kind === "pick") {
      const opt = d.options.find((o) => (o.card ?? o.key) === "foe");
      expect(opt).toBeDefined();
      await game.p1.answer({ keys: [opt?.key as string], kind: "pick" });
    } else {
      return;
    }
  }
}

describe("Ruling adc5174843bc420d — Faefolk's 'that battlefield' is fixed at trigger time", () => {
  test("sanity: Faefolk can standard-move from base to bf1", async () => {
    const game = await board().build();
    await game.p1.move("fae", "bf1");
    expect(game.zoneOf("fae")).toBe("battlefield-bf1");
    expect(game.zoneOf("foe")).toBe("battlefield-bf2");
  });

  // Expected: moving Faefolk to bf1 fulfils "When I move to a battlefield" → a triggered ability
  // controlled by P1 is put on the chain (P2 then gets a reaction window). Actual: the engine emits a
  // generic "move" event that never matches the parsed `move-to-battlefield` trigger — nothing happens.
  test("ruling adc5174843bc420d — moving Faefolk to a battlefield puts its triggered ability on the chain (engine never fires the trigger)", async () => {
    const game = await board().build();
    await game.p1.move("fae", "bf1");
    const pending = game.chain().some((c) => c.cardId === "fae" && c.triggered) || (game.decision()?.seat === P1 && game.decision()?.kind !== "action");
    expect(pending).toBe(true);
  });

  // Expected (control, no response): P1 may choose the enemy Foe and it moves from bf2 to bf1 — the
  // battlefield Faefolk moved to. Actual: trigger never fires; Foe stays at bf2.
  test("ruling adc5174843bc420d — control: with no response, P1 chooses Foe and it moves to bf1", async () => {
    const game = await board().build();
    await game.p1.move("fae", "bf1");
    await chooseFoe(game);
    await game.settle();
    expect(game.zoneOf("fae")).toBe("battlefield-bf1");
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.p2.units("bf2")).toEqual([]);
  });

  // Expected (359.3.f.3): P2 Gusts Faefolk in response (1 might, at a battlefield → legal); Gust resolves
  // first (LIFO) and Faefolk returns to P1's hand. The trigger still resolves: P1 chooses Foe and it
  // moves to bf1 even though Faefolk is no longer there. Actual: no trigger, so P2 never even gets a
  // reaction window on P1's turn.
  test("ruling adc5174843bc420d — P2 Gusts Faefolk in response; Faefolk → hand, but Foe STILL moves to bf1", async () => {
    const game = await board().build();
    await game.p1.move("fae", "bf1");
    // If the engine asks the optional "you may" question up front, P1 opts in before passing.
    if (game.decision()?.kind === "yes-no" && game.decision()?.seat === P1) {
      await game.p1.yes();
    }
    // rule 402 (finalization): the enemy unit is chosen before anyone gets priority.
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("foe");
    }
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "fae" });
    expect(game.p2.energy()).toBe(0);
    // Gust is on top of the trigger; both pass → Gust resolves first.
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("fae")).toBe("hand");
    expect(game.zoneOf("gust")).toBe("trash");
    // The Faefolk trigger is still pending and now resolves.
    await chooseFoe(game);
    await game.settle();
    expect(game.zoneOf("fae")).toBe("hand"); // Faefolk is gone from bf1 …
    expect(game.zoneOf("foe")).toBe("battlefield-bf1"); // … yet Foe moved to "that battlefield"
    expect(game.p2.units("bf2")).toEqual([]);
    expect(game.chain()).toEqual([]);
  });
});
