/**
 * Ruling bec99c45abdc1766 — Hwei, Brooding Painter (UNL-080 → unl-080-219) · Unit · Mind · 5 · 5 Might
 *     "When I move, draw 1, then discard 1. Then, … based on the discarded card's type …"
 *   × Vex, Apathetic (UNL-150 → unl-150-219) · Unit · Chaos · 4 · 4 Might
 *     "[Deflect] When an opponent plays a unit while I'm at a battlefield, Stun it. They can't move it this turn."
 *   × Teemo, Scout (OGN-197 → ogn-197-298) · Unit · Chaos · 2 · 1 Might "[Hidden] When you play me, give me +3 Might this turn."
 *
 * Q: The opponent moves Hwei and Vex to my battlefield together. Can I react to Hwei's move trigger by flipping my
 *    hidden Teemo there so he is played "before Vex is at the battlefield" and dodges the Stun?
 * A: No. The move is one simultaneous event: by the time anyone can react, Vex is already at the battlefield. Teemo
 *    revealed in that window is "a unit played while I'm at a battlefield" → Vex's trigger goes on the chain and stuns him.
 * Rules: 383.2.c (trigger conditions evaluated after the inciting event), 140-ish simultaneous move, 811 (hidden play as
 *        a Reaction), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HWEI = "unl-080-219";
const VEX_APATHETIC = "unl-150-219";
const TEEMO_SCOUT = "ogn-197-298";

/** P2's turn. P1 holds bf1 with a Holder (2) and Teemo hidden there since an earlier turn. P2: Hwei + Vex ready in base, a junk unit in hand to discard. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .facedown(P1, "bf1", TEEMO_SCOUT, "teemo")
    .unit(P2, "base", HWEI, "hwei")
    .unit(P2, "base", VEX_APATHETIC, "vex")
    .hand(P2, { cardType: "unit", energyCost: 1, might: 1, name: "Junk" }, "junk");
}

/** P2 moves Hwei + Vex into bf1 as ONE move; Hwei's move trigger opens a chain; P2 passes so P1 holds priority. */
async function moveBothIn(game: Game): Promise<void> {
  await game.p2.move(["hwei", "vex"], "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hwei", controller: P2, triggered: true })]);
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
}

describe("Ruling bec99c45abdc1766 — flipping hidden Teemo in response to Hwei's move trigger does not dodge Vex's Stun", () => {
  test("there is no 'before Vex arrives' window: at the very first moment P1 can act (responding to Hwei's trigger), Vex is ALREADY at bf1 alongside Hwei", async () => {
    const game = await board().build();
    await moveBothIn(game);
    expect(game.locationOf("hwei")).toBe("bf1");
    expect(game.locationOf("vex")).toBe("bf1");
    expect(game.p1.can("reveal", "teemo")).toBe(true); // the reaction IS available …
  });

  test("… P1 reveals Teemo there (for [0]): he enters bf1 and Vex's 'opponent played a unit while I'm at a battlefield' trigger goes on the chain (with Teemo's own play trigger)", async () => {
    const game = await board().build();
    await moveBothIn(game);
    await game.p1.reveal("teemo");
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    const ids = game.chain().map((c) => c.cardId);
    expect(ids[0]).toBe("hwei"); // still underneath
    expect(ids).toContain("vex");
    expect(ids).toContain("teemo");
    expect(game.chain().find((c) => c.cardId === "vex")).toMatchObject({ controller: P2, triggered: true });
    expect(game.state("teemo").isStunned).toBe(false); // not yet — it is a chain item
  });

  test("the chain resolves (LIFO): Teemo gets his +3 (1 → 4) but IS stunned by Vex and can't be moved this turn; Hwei's draw/discard then completes", async () => {
    const game = await board().build();
    await moveBothIn(game);
    await game.p1.reveal("teemo");
    for (let i = 0; i < 20; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context !== "chain")) {
        break;
      }
      if (d.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else if (d.kind === "order" && d.defaultable) {
        await game.acceptTriggerOrder();
      } else if (d.kind === "pick" && d.seat === P2) {
        // Hwei: "discard 1" — P2 discards the Junk.
        await game.p2.pick(d.options.find((o) => (o.card ?? o.key) === "junk")?.key ?? (d.options[0]?.key as string));
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.state("teemo")).toMatchObject({ isStunned: true, might: 4 });
    expect(game.state("teemo").grantedKeywords).toContainEqual(expect.objectContaining({ duration: "turn", keyword: "NoMove" }));
    expect(game.zoneOf("junk")).toBe("trash");
    // We are now in the bf1 showdown with P2 (attacker) holding Focus.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
