/**
 * Ruling 143eb3049aad5262 — Irelia, Fervent (SFD-057 → sfd-057-221) · 4 Might · Calm champion
 *   "[Deflect] … When you choose or ready me, give me +1 [Might] this turn."
 *
 * Q: Can you ready an already-readied Irelia (to farm her +1)?
 * A: No. A Ready unit cannot be Readied again; instructing a ready unit to ready does nothing, so her
 *    "when you … ready me" ability does not trigger. Only an exhausted Irelia that is actually readied
 *    gets the +1 from the ready half.
 * Rules: 415.1.b (a Ready unit can't be Readied), 415.1.c (nothing happens), 376/383 (triggered abilities).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const IRELIA = "sfd-057-221";
/**
 * A non-targeting mass ready ("Ready your units.") so ONLY the ready half of Irelia's ability is in
 * play — nothing here "chooses" her (rule 355.10: "your units" is a criteria instruction, not a choice).
 */
const RALLY = {
  abilities: [{ effect: { target: { controller: "friendly", quantity: "all", type: "unit" }, type: "ready" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 1,
  name: "Rally (Ready your units.)",
  timing: "action",
} as const;

function board(opts: { exhausted: boolean }) {
  return scenario()
    .resources(P1, { energy: 1 })
    .unit(P1, "base", IRELIA, "irelia", opts.exhausted ? { exhausted: true } : undefined)
    .hand(P1, RALLY, "rally");
}

describe("Ruling 143eb3049aad5262 — readying an already-ready Irelia, Fervent does nothing and does not trigger her +1", () => {
  test("control: an EXHAUSTED Irelia readied by a non-choosing 'Ready your units' IS readied and her ability triggers once — 4 → 5 this turn", async () => {
    const game = await board({ exhausted: true }).build();
    expect(game.state("irelia")).toMatchObject({ isExhausted: true, might: 4 });
    await game.p1.cast("rally");
    await game.settle();
    expect(game.zoneOf("rally")).toBe("trash");
    expect(game.state("irelia").isReady).toBe(true);
    expect(game.state("irelia").might).toBe(5);
    expect(game.chain()).toEqual([]);
  });

  test("a READY Irelia instructed to ready: nothing happens (415.1.b/c) — no ready trigger, she stays at 4 Might and no ability item ever hits the chain", async () => {
    const game = await board({ exhausted: false }).build();
    expect(game.state("irelia")).toMatchObject({ isReady: true, might: 4 });
    await game.p1.cast("rally");
    // Only the spell is on the chain — no Irelia trigger was queued at cast time (nothing chose her).
    expect(game.chain().map((c) => `${c.cardId}${c.triggered ? "*" : ""}`)).toEqual(["rally"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Rally resolves
    // After resolution: still no triggered item for Irelia.
    expect(game.chain().some((c) => c.cardId === "irelia" && c.triggered)).toBe(false);
    await game.settle();
    expect(game.state("irelia").isReady).toBe(true);
    expect(game.state("irelia").might).toBe(4);
    expect(game.state("irelia").mightModifier).toBe(0);
  });

  test("the +1 lapses at end of turn (it is 'this turn'): the exhausted-then-readied Irelia is back to 4 on P1's next turn", async () => {
    const game = await board({ exhausted: true }).build();
    await game.p1.cast("rally");
    await game.settle();
    expect(game.state("irelia").might).toBe(5);
    await game.advanceTurn();
    expect(game.state("irelia").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });
});
