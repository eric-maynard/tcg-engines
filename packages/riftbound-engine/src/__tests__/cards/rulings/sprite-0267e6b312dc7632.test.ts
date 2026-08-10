/**
 * Ruling 0267e6b312dc7632 — Sprite token (OGN-274 → ogn-274-298) "[Temporary] (Kill me at the start of
 *   your Beginning Phase, before scoring.)"
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) "[Hidden] If a friendly unit would die, kill this
 *     instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: My Sprite is about to die to Temporary at the start of my Beginning Phase and I have a Zhonya's
 *    hidden at its battlefield. Can I react to the Temporary trigger by playing the Zhonya's?
 * A: Yes. Temporary is a triggered ability that goes on the chain, which opens a priority window. Reveal
 *    the hidden Zhonya's in that window; once in play its mandatory replacement saves the Sprite when the
 *    trigger resolves (Zhonya's is killed instead; Sprite healed, exhausted, recalled). If you pass instead,
 *    the Sprite dies and it is too late.
 * Rules: 816 (Temporary), 383 / 330–337 (triggered ability → chain → priority), 811 (play from Hidden at
 *        Reaction speed for 0), 370.1.a.1 / 372 (replacement of the death event), 186.1 (dead token ceases
 *        to exist).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE = "ogn-274-298";
const ZHONYAS = "ogn-077-298";

/**
 * End of P2's turn 3. P1 controls bf1 with a Sprite token and a vanilla Buddy (so bf1 stays P1's either
 * way and the facedown card is not discarded by losing the battlefield). Zhonya's was hidden at bf1 on an
 * earlier turn.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SPRITE, "token-sprite")
    .unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy")
    .facedown(P1, "bf1", ZHONYAS, "zh");
}

/** P2 ends the turn → P1's Beginning Phase starts and the Temporary trigger is put on the chain. */
async function atTemporaryTrigger(): Promise<Game> {
  const game = await board().build();
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  return game;
}

describe("Ruling 0267e6b312dc7632 — revealing a hidden Zhonya's in response to a Sprite's Temporary trigger", () => {
  test("Temporary uses the chain: at the start of P1's Beginning Phase the Sprite's kill trigger is a chain item and P1 holds priority with the Sprite still alive", async () => {
    const game = await atTemporaryTrigger();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "token-sprite", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.zoneOf("token-sprite")).toBe("battlefield-bf1");
  });

  test("in that priority window P1 may play the hidden Zhonya's from face down (for 0)", async () => {
    const game = await atTemporaryTrigger();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("reveal", "zh")).toBe(true);
    await game.p1.reveal("zh");
    expect(game.state("zh").isHidden).toBe(false);
    expect(game.p1.energy()).toBe(0);
    // The Temporary trigger is still waiting underneath.
    expect(game.chain().some((c) => c.cardId === "token-sprite" && c.triggered)).toBe(true);
  });

  test("ruling 0267e6b312dc7632 — revealed before the trigger resolves, Zhonya's replaces the death: Zhonya's is killed instead and the Sprite survives healed, exhausted and recalled to base", async () => {
    const game = await atTemporaryTrigger();
    await game.p1.reveal("zh");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.has("token-sprite")).toBe(true);
    expect(game.zoneOf("token-sprite")).toBe("base");
    expect(game.state("token-sprite")).toMatchObject({ controller: P1, damage: 0, isExhausted: true, location: "base" });
    expect(game.p1.units("base")).toContain("token-sprite");
    // Buddy still holds bf1 for P1.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — if P1 just passes, the Temporary trigger resolves unopposed: the Sprite dies (a token ceases to exist) and the still-hidden Zhonya's did nothing", async () => {
    const game = await atTemporaryTrigger();
    await game.p1.passPriority();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(["gone", "trash"]).toContain(game.zoneOf("token-sprite"));
    expect(game.p1.units("bf1")).toEqual(["buddy"]);
    expect(game.p1.units("base")).toEqual([]);
    // Zhonya's is untouched, still face down at bf1 — too late to save anything now.
    expect(game.zoneOf("zh")).toBe("facedown-bf1");
    expect(game.state("zh").isHidden).toBe(true);
  });
});
