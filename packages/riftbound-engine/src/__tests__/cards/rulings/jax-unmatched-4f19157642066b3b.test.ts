/**
 * Ruling 4f19157642066b3b — Jax, Unmatched (SFD-054 → sfd-054-221) · 5 Might · [Deflect] "Your Equipment everywhere have
 *   [Quick-Draw]." (each gains [Reaction]; when you play it, attach it to a unit you control)
 *   × Shady Spectacles (VEN-137 → ven-137-166) · Equipment · [4] · [Equip] [1][order] "As this is attached to a unit, choose
 *     another friendly unit. The equipped unit becomes a copy of that unit for as long as this is attached to it."
 *   × Star-Crossed (UNL-128 → unl-128-219) · Reaction · [3][chaos] "Return a friendly unit and an enemy unit to their owners' hands."
 *
 * Q: Star-Crossed is on the chain targeting my Jax; I respond by Quick-Drawing Shady Spectacles onto him, making him a copy of
 *    another unit. Is he still bounced, or is he now a "new" object?
 * A: Still bounced. Targets are fixed at finalization; becoming a copy changes Jax's copiable traits (name, text, Might) but not
 *    his zone, controller or unit-ness, so he remains a legal "enemy unit" for Star-Crossed when it resolves.
 * Rules: 355.14.b (targets locked when finalized), 359.3.e.2 (illegal only if requirement no longer met / zone change), 819 (Quick-Draw).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const JAX = "sfd-054-221";
const SHADY_SPECTACLES = "ven-137-166";
const STAR_CROSSED = "unl-128-219";

/**
 * P2's turn. P1 holds bf1 with Jax and has a 7-Might Bruiser in base (the unit to copy) plus Shady Spectacles in hand with
 * [5][order]. P2: Pawn in base (Star-Crossed's friendly half), Star-Crossed, [3] + chaos×2 (one extra pip for Jax's Deflect).
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 5, power: { order: 1 } })
    .resources(P2, { energy: 3, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", JAX, "jax")
    .unit(P1, "base", { might: 7, name: "Bruiser" }, "bruiser")
    .unit(P2, "base", { might: 1, name: "Pawn" }, "pawn")
    .hand(P1, SHADY_SPECTACLES, "specs")
    .hand(P2, STAR_CROSSED, "sc");
}

/** P2 Star-Crosses [Pawn, Jax] (paying Deflect) and passes; P1 Quick-Draws the Spectacles onto Jax in response. */
async function starCrossedThenSpectacles(): Promise<Game> {
  const game = await board().build();
  // Jax's static is live: the Equipment in P1's HAND already has Quick-Draw.
  expect(game.state("specs").keywords).toContain("Quick-Draw");
  await game.p2.cast("sc", { targets: ["pawn", "jax"] });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } }); // 3 + chaos, + 1 pip for Deflect
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sc", targets: ["pawn", "jax"] })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  // Reaction-speed play of a gear on the opponent's turn with a spell on the chain — only possible via Quick-Draw.
  expect(game.p1.can("play", "specs")).toBe(true);
  await game.p1.play("specs");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "specs" } }); // "attach it to a unit you control"
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["bruiser", "jax"]);
  await game.p1.pick("jax");
  return game;
}

describe("Ruling 4f19157642066b3b — Quick-Drawing Shady Spectacles onto a Star-Crossed Jax does not save him", () => {
  test("with Star-Crossed on the chain, P1 can Quick-Draw the Spectacles (Reaction, thanks to Jax) and attach them to Jax; Star-Crossed still waits with Jax as its locked target", async () => {
    const game = await starCrossedThenSpectacles();
    // Let any attach step settle without resolving Star-Crossed (P1 still to pass).
    expect(game.zoneOf("specs")).not.toBe("hand");
    expect(game.state("jax").attachments).toContain("specs");
    expect(game.state("specs").attachedTo).toBe("jax");
    expect(game.chain().find((c) => c.cardId === "sc")).toMatchObject({ targets: ["pawn", "jax"] });
    expect(game.zoneOf("jax")).toBe("battlefield-bf1");
  });

  // Expected: "As this is attached … choose another friendly unit. The equipped unit becomes a copy of that unit" — P1 is asked
  // to choose (only the Bruiser qualifies) and Jax then reads as a copy: name "Bruiser", 7 base Might. Actual: the copy clause
  // is not implemented (raw text) — no choice is offered and Jax keeps his own name/Might.
  test("ruling 4f19157642066b3b — once attached, Jax becomes a copy of the chosen Bruiser (name/Might)", async () => {
    const game = await starCrossedThenSpectacles();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["bruiser"]); // "another friendly unit"
      await game.p1.pick("bruiser");
    }
    expect(game.state("jax").name).toBe("Bruiser");
    expect(game.state("jax").baseMight).toBe(7);
    expect(game.zoneOf("jax")).toBe("battlefield-bf1"); // still the same object in the same place
  });

  test("Star-Crossed then resolves and STILL returns Jax (and P2's Pawn) to hand — copy or not, he never stopped being an enemy unit on the board; the Spectacles fall off and stay behind", async () => {
    const game = await starCrossedThenSpectacles();
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.answer({ keys: [d.options[0]!.key], kind: "pick" }); // copy choice, if the engine asks
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("jax")).toBe("hand");
    expect(game.p1.hand()).toContain("jax");
    expect(game.zoneOf("pawn")).toBe("hand");
    expect(game.state("jax").attachments).toEqual([]);
    expect(game.zoneOf("specs")).not.toBe("hand");
    expect(game.state("specs").attachedTo).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
