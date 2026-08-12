/**
 * Ruling 3365413873f90883 — Gust (OGN-169 → ogn-169-298) · Reaction · [1][chaos]
 *   "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × an [Exhaust] ability that plays unit tokens (here Ultrasoft Poro, UNL-160 → unl-160-219:
 *     "[Exhaust]: Play two 1 [Might] Bird unit tokens with [Deflect]. Use this ability only while
 *      I'm at a battlefield.")
 *
 * Q: I activate a token-making ability; my opponent Gusts away the unit holding a battlefield so I
 *    lose control of it. Can I still play the token there because I picked the location first?
 * A: You never picked a location when you activated the ability — the destination is chosen when the
 *    TOKEN IS PLAYED, after the ability has resolved, so a Gust in response is a legal answer.
 *    (Whether control has already lapsed by then is the control-timing question below.)
 * Rules: 355.4 / 419.3 (a played card's destination is chosen as it is played), 336–337 (LIFO),
 *        190.4 / 323.6 (control lapses only at a Cleanup that runs in an OPEN state).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const PORO = "unl-160-219";

/**
 * P1's turn. P1 holds bf1 with a lone 2-Might Holder (Gust bait) and bf2 with the Poro.
 * P2 has Gust and exactly [1][chaos].
 */
function board() {
  return scenario()
    .resources(P2, { energy: 1, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "bf2", PORO, "poro")
    .hand(P2, GUST, "gust");
}

const destinations = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.key).toSorted() : []);

/** Drive chain priority until something other than a priority window is pending. */
async function passChain(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling 3365413873f90883 — the token's location is chosen when the token is played, not when the ability is activated", () => {
  test("activating the ability asks for NO location — the chain item carries no destination and P2 gets a window to answer", async () => {
    const game = await board().build();
    await game.p1.activate("poro");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P1, triggered: false })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "gust")).toBe(true); // Gust is a legal response: no illegal state is created
  });

  test("ruling: the destination prompt only appears AFTER the ability resolves — one per token, at play time", async () => {
    const game = await board().build();
    await game.p1.activate("poro");
    await passChain(game);
    const first = game.decision();
    expect(first).toMatchObject({ kind: "pick", seat: P1 });
    expect(first?.prompt).toContain("destination");
    expect(destinations(first)).toEqual(["base", "battlefield-bf1", "battlefield-bf2"]);
    await game.p1.pick("base");
    const second = game.decision();
    expect(second).toMatchObject({ kind: "pick", seat: P1 }); // the second token is asked separately
    await game.p1.pick("base");
    expect(game.p1.base().filter((id) => game.state(id).name === "Bird")).toHaveLength(2);
  });

  test("Gust in response really does empty bf1 — the Holder is back in P1's hand before the ability resolves", async () => {
    const game = await board().build();
    await game.p1.activate("poro");
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "holder" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["poro", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves (LIFO)
    expect(game.zoneOf("holder")).toBe("hand");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["poro"]);
  });

  // RULING-CONFLICT: riftjudge 3365413873f90883 says the emptied battlefield is no longer "a
  // battlefield you control", so the token cannot be played there. CR 190.4 / 323.6 lapse control
  // only at a Cleanup that runs in an OPEN state, and the ability is still resolving (a Closed
  // State), so the recorded controller is unchanged and bf1 is still a legal destination — engine
  // follows CR. What the ruling gets right is the timing: the choice is made now, not at activation.
  test("after the Gust the destination list is still offered at token-play time, bf1 included (control had not yet lapsed mid-resolution)", async () => {
    const game = await board().build();
    await game.p1.activate("poro");
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "holder" });
    await passChain(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(destinations(d)).toContain("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    await game.p1.pick("battlefield-bf1");
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.p1.units("bf1")).toHaveLength(2);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("…and the choice is genuinely free: sending both Birds to base instead leaves bf1 with no units of P1's on it", async () => {
    const game = await board().build();
    await game.p1.activate("poro");
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "holder" });
    await passChain(game);
    await game.p1.pick("base");
    await game.p1.pick("base");
    await game.settle();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p1.base().filter((id) => game.state(id).name === "Bird")).toHaveLength(2);
    expect(game.violations()).toEqual([]);
  });
});
