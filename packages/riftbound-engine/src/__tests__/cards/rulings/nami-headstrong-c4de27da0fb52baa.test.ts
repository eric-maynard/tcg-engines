/**
 * Ruling c4de27da0fb52baa — Nami, Headstrong (UNL-052 → unl-052-219) · Champion Unit · Calm · 3 · 3 Might
 *     "… When I hold, the next time you play a unit this turn, ready it and [Buff] it."
 *   × Irelia, Fervent (SFD-057 → sfd-057-221) · 5 · 4 Might "[Deflect] When you choose or ready me, give me +1 [Might] this turn."
 *
 * Q: Nami held; I play Irelia — Nami's effect readies and buffs her. Does Irelia also get +1 for being "chosen"?
 * A: No. Nami's hold effect applies to "the next unit you play" without targeting/choosing it, so only the READY half of Irelia's
 *    trigger fires: she ends 4 + 1 (Buff) + 1 (readied) = 6, not 7.
 * Rules: 355.10 (an object is only "chosen" when a spell/ability targets it), 383 (trigger conditions), 703 (Buff), Nami's delayed trigger.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NAMI = "unl-052-219";
const IRELIA = "sfd-057-221";

/** End of P2's turn 2: P1 holds bf1 with Nami; Irelia in P1's hand. Advancing → P1's turn 3: Nami "holds". */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", NAMI, "nami")
    .unit(P2, "base", { might: 2, name: "Guard" }, "guard")
    .hand(P1, IRELIA, "irelia");
}

const ireliaItems = (game: Game) => game.chain().filter((c) => c.cardId === "irelia" && c.triggered);

/** Into P1's turn (Nami holds → her delayed effect is armed), give P1 [5], play Irelia to base. Stops right after the play. */
async function holdThenPlayIrelia(game: Game): Promise<void> {
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.p1.points()).toBe(1); // Nami held bf1
  await game.p1.do("addResources", { energy: 5 });
  await game.p1.play("irelia", { to: "base" });
}

/** Resolve the whole chain, counting how many distinct Irelia trigger items ever appeared. */
async function resolveCountingIrelia(game: Game): Promise<number> {
  const seen = new Set<string>();
  for (let i = 0; i < 16; i++) {
    for (const c of game.chain()) {
      if (c.cardId === "irelia" && c.triggered) {
        seen.add(c.id);
      }
    }
    const d = game.decision();
    if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  await game.settle();
  return seen.size;
}

describe("Ruling c4de27da0fb52baa — Nami's hold effect readies+buffs Irelia without 'choosing' her: +1 once (6), not twice (7)", () => {
  test("Nami's armed hold effect applies to the next unit played: Irelia ends up READY and BUFFED (she would otherwise enter exhausted, unbuffed)", async () => {
    const game = await board().build();
    await holdThenPlayIrelia(game);
    expect(game.chain().some((c) => c.cardId === "nami" && c.triggered && c.controller === P1)).toBe(true);
    await resolveCountingIrelia(game);
    expect(game.state("irelia")).toMatchObject({ isBuffed: true, isReady: true, location: "base" });
  });

  test("being READIED does fire Irelia's trigger: at least one Irelia item resolves and she has at least +1 this turn", async () => {
    const game = await board().build();
    await holdThenPlayIrelia(game);
    const fired = await resolveCountingIrelia(game);
    expect(fired).toBeGreaterThanOrEqual(1);
    expect(game.state("irelia").mightModifier).toBeGreaterThanOrEqual(1);
  });

  // Expected (ruling): Nami's effect does not target/choose Irelia, so the "choose" half never fires — exactly ONE Irelia trigger
  // (from the ready) and a final 4 + 1 (Buff) + 1 = 6 Might. Actual: the engine puts an Irelia trigger on the chain the moment
  // she is played (treating Nami's delayed effect binding to her as "choosing" her) AND another when she is readied → +2 → 7.
  test("ruling c4de27da0fb52baa — engine fires Irelia's 'choose' trigger off Nami's non-targeting hold effect (Irelia 7 instead of 6)", async () => {
    const game = await board().build();
    await holdThenPlayIrelia(game);
    // Right after the play only Nami's delayed item may be on the chain — Irelia has not been chosen by anything.
    expect(ireliaItems(game)).toEqual([]);
    const fired = await resolveCountingIrelia(game);
    expect(fired).toBe(1);
    expect(game.state("irelia")).toMatchObject({ isBuffed: true, isReady: true, might: 6, mightModifier: 1 });
    expect(game.violations()).toEqual([]);
  });
});
