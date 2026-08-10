/**
 * Ruling ca38f4f484d3eaab — Jae Medarda (SFD-142 → sfd-142-221) · Unit · Chaos · 5 Might
 *     "When you choose me with a spell, draw 1."
 *   × Frigid Touch (SFD-066 → sfd-066-221) · Spell · [Reaction] · 2 · "[Repeat] [2] … Give a unit -2 [Might] this turn."
 *
 * Q: If I choose my own Jae Medarda with my repeated Frigid Touch (both executions on Jae), do I draw 2?
 * A: Yes. Repeat executes the effect an additional time, and each execution chooses Jae — she is chosen twice, so her
 *    ability triggers twice: draw 1 + draw 1.
 * Rules: 820 (Repeat: pay the additional cost to execute the effect one more time, choosing targets for each execution),
 *        355.14.d (each choice of a target counts individually for "when chosen" triggers), 383 (triggered abilities).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const JAE = "sfd-142-221";
const FRIGID_TOUCH = "sfd-066-221";

/** P1's turn: Jae (5) in base, Frigid Touch in hand, 4 energy (2 + Repeat 2), known deck; P2 has a Bystander. */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .unit(P1, "base", JAE, "jae")
    .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander")
    .hand(P1, FRIGID_TOUCH, "ft")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

async function passBoth(game: Game): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    await game.seat(d!.seat).passPriority();
  }
}

describe("Ruling ca38f4f484d3eaab — repeated Frigid Touch choosing Jae twice draws 2", () => {
  test.failing("BUG: Repeat is ONE spell that chooses a unit twice: the cast offers a two-target tuple and [jae, jae] is a legal choice", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "ft")?.fields.find((f) => f.name === "targets");
    expect(targets?.max).toBe(2);
    expect(targets?.options).toContainEqual(["jae", "jae"]);
    await game.p1.cast("ft", { repeat: 1, targets: ["jae", "jae"] });
    expect(game.p1.energy()).toBe(0); // 2 + Repeat 2
    const spell = game.chain().find((c) => c.cardId === "ft");
    expect(spell).toMatchObject({ controller: P1, targets: ["jae", "jae"], triggered: false });
    expect(game.chain().filter((c) => !c.triggered)).toHaveLength(1); // one spell, not two
  });

  test.failing("BUG: each choice triggers Jae separately: TWO Jae triggers sit above the spell; first resolves → draw 1, second → draw 1 (2 cards), then Frigid Touch gives Jae −2 twice (5 → 1)", async () => {
    const game = await board().build();
    await game.p1.cast("ft", { repeat: 1, targets: ["jae", "jae"] });
    await game.acceptTriggerOrder();
    const jaeTriggers = game.chain().filter((c) => c.cardId === "jae" && c.triggered);
    expect(jaeTriggers).toHaveLength(2);
    expect(game.chain()[0]?.cardId).toBe("ft"); // spell at the bottom
    expect(game.p1.hand()).toEqual([]);
    await passBoth(game); // first trigger
    expect(game.p1.hand()).toEqual(["d1"]);
    await passBoth(game); // second trigger
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ft"]);
    await passBoth(game); // the spell itself
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ft")).toBe("trash");
    expect(game.state("jae").might).toBe(1); // 5 − 2 − 2
    expect(game.p1.hand()).toEqual(["d1", "d2"]); // exactly two draws
    expect(game.p1.deck()[0]).toBe("d3");
    expect(game.violations()).toEqual([]);
  });

  test("control — no Repeat (Jae chosen once): one trigger, one card, Jae 5 → 3", async () => {
    const game = await board().build();
    await game.p1.cast("ft", { targets: "jae" });
    expect(game.p1.energy()).toBe(2);
    expect(game.chain().filter((c) => c.cardId === "jae" && c.triggered)).toHaveLength(1);
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.state("jae").might).toBe(3);
  });
});
