/**
 * Keeper of Masks — unl-081-219 · Unit · Mind · 2 energy · 1 might
 *
 *   [Hidden]
 *   [Temporary]
 *   When you play me, play two Reflection unit tokens here. They become copies of me.
 *
 * rule 477.1.b.1: "become a copy" replaces the token's copiable values (name, Might,
 * abilities) with the source card's — the printed 0-Might "Reflection" stats are gone.
 * The engine registers each token instance with the copied definition; the shared
 * `token-def-reflection` definition keeps the literal stats, so anything reading the
 * token through its *definition id* (the app snapshot / card art) must be told which
 * card the token copies.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "unl-081-219";

describe("Keeper of Masks (unl-081-219)", () => {
  test("the two Reflection tokens become copies of Keeper of Masks: 1 Might, its name, and its copied definition id", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .hand(P1, CARD, "keeper")
      .build();

    await game.p1.play("keeper", { to: "bf1" });
    await game.settle();

    const tokens = game.p1.units("bf1").filter((id) => game.state(id).isToken);
    expect(tokens).toHaveLength(2);
    for (const id of tokens) {
      const st = game.state(id);
      expect(st.name).toBe("Keeper of Masks");
      expect(st.baseMight).toBe(1);
      expect(st.might).toBe(1);
      // rule 477.1.b.1: readers that resolve the token through its definition
      // (the app snapshot's card art/name) must be able to follow it to the
      // copied card — the token's own definitionId stays token-def-reflection.
      expect((st.meta as { copyOfCardId?: string }).copyOfCardId).toBe("keeper");
    }
    expect(game.state("keeper").might).toBe(1);
  });
});
