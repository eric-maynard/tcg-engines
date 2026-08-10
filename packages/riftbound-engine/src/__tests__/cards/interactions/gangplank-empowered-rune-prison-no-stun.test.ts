/**
 * Interaction: Gangplank, Naval (ven-181-166) · 6 Might
 *     "[Empower] [body][body]
 *      [Empowered][>] If a spell or ability that chooses me would stun me, give me -[Might],
 *      or return me to hand, give me +3 [Might] instead."
 *   × Rune Prison (ogn-050-298) "[Action] Stun a unit."
 *   × Eclipse Herald (ogn-059-298) 7 Might "When you stun an enemy unit, ready me and give me
 *     +1 [Might] this turn."
 *
 * Question: P2's Gangplank sits at bf1; P1 has an EXHAUSTED Eclipse Herald in base and Rune
 * Prison in hand. (a) Gangplank not Empowered → stunned? Herald? (b) Gangplank Empowered →
 * stunned? Might? Herald? (c) Is P2 offered the Empower activation while Rune Prison is on the
 * chain / during P1's turn? (d) Can an already-Empowered Gangplank Empower again next turn?
 *
 * Rules: 827.1.c.1 (Empower = "[Cost]: Empower this. Play only if not Empowered"), 827.2,
 * 828.1.b.1 / 828.1.c (Empowered-dependent text is live only while Empowered), 370.1.a.1 /
 * 370.1.b (a replaced event never happened → nothing triggers off it), 423.1.a.1, 381
 * (activated abilities: controller's turn, Open State only), 441.1.a-b (Empowered is binary).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GANGPLANK = "ven-181-166";
const RUNE_PRISON = "ogn-050-298";
const ECLIPSE_HERALD = "ogn-059-298";

function board(opts: { empowered?: boolean } = {}) {
  return scenario()
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .resources(P2, { power: { body: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", GANGPLANK, "gp", opts.empowered ? { empowered: true } : undefined)
    .runes(P2, "body", 2)
    .unit(P1, "base", ECLIPSE_HERALD, "herald", { exhausted: true })
    .unit(P1, "base", { might: 3 }, "scout")
    .hand(P1, RUNE_PRISON, "prison");
}

describe("Gangplank, Naval [Empowered] replacement × Rune Prison × Eclipse Herald", () => {
  // ---- (a) not Empowered -------------------------------------------------------------------

  test("(a) NOT Empowered: the dependent replacement is inactive — Rune Prison stuns him (828.1.b.1 / 828.1.c)", async () => {
    const game = await board().build();
    expect(game.state("gp").isEmpowered).toBeFalsy();
    await game.p1.cast("prison", { targets: "gp" });
    await game.settle();
    expect(game.state("gp").isStunned).toBe(true);
    expect(game.state("gp").might).toBe(6);
    expect(game.zoneOf("prison")).toBe("trash");
  });

  test("(a) NOT Empowered: P1 stunned an enemy unit → Eclipse Herald readies and goes 7→8 this turn", async () => {
    const game = await board().build();
    await game.p1.cast("prison", { targets: "gp" });
    await game.settle();
    expect(game.state("herald").isReady).toBe(true);
    expect(game.state("herald").might).toBe(8);
    await game.advanceTurn();
    expect(game.state("herald").might).toBe(7);
  });

  // ---- (b) Empowered ---------------------------------------------------------------------------

  test("(b) Empowered: the stun is REPLACED — he is not stunned and gets +3 Might (6→9) instead (370.1.b)", async () => {
    const game = await board({ empowered: true }).build();
    expect(game.state("gp").isEmpowered).toBe(true);
    await game.p1.cast("prison", { targets: "gp" });
    await game.settle();
    expect(game.state("gp").isStunned).toBe(false);
    expect(game.state("gp").might).toBe(9);
    // Rune Prison was still played and resolved: it is in the trash, resources spent.
    expect(game.zoneOf("prison")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain()).toHaveLength(0);
  });

  test("(b) Empowered: the stun never happened (370.1.a.1) → Eclipse Herald does NOT trigger (stays exhausted at 7)", async () => {
    const game = await board({ empowered: true }).build();
    await game.p1.cast("prison", { targets: "gp" });
    await game.settle();
    expect(game.state("herald").isExhausted).toBe(true);
    expect(game.state("herald").might).toBe(7);
  });

  test("(b) Empowered: the +3 is 'this turn' — next turn he is back to 6 and still Empowered", async () => {
    const game = await board({ empowered: true }).build();
    await game.p1.cast("prison", { targets: "gp" });
    await game.settle();
    expect(game.state("gp").might).toBe(9);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("gp").might).toBe(6);
    expect(game.state("gp").isEmpowered).toBe(true);
  });

  test("(b) Empowered: not stunned, so he deals full combat damage — a 3-Might attacker dies to the 9-Might Gangplank (423.1.b contrast)", async () => {
    const game = await board({ empowered: true }).build();
    await game.p1.cast("prison", { targets: "gp" });
    await game.settle();
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("gp")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("(a) contrast: a STUNNED Gangplank deals no combat damage — the 3-Might attacker survives and marks 3 damage on him", async () => {
    const game = await board().build();
    await game.p1.cast("prison", { targets: "gp" });
    await game.settle();
    expect(game.state("gp").isStunned).toBe(true);
    await game.p1.move("scout", "bf1");
    await game.settle();
    // 6-Might Gangplank takes 3 (survives), deals 0 → scout survives; attacker failed to
    // clear the defender so it is recalled to base.
    expect(game.zoneOf("gp")).toBe("battlefield-bf1");
    expect(game.zoneOf("scout")).not.toBe("trash");
    expect(game.state("scout").damage).toBe(0);
  });

  // ---- (c) Empower timing: controller's turn + Open State only (381) ---------------------------

  test("(c) while Rune Prison is on the chain (Closed State, P1's turn) P2 is NOT offered Gangplank's Empower", async () => {
    const game = await board().build();
    await game.p1.cast("prison", { targets: "gp" });
    expect(game.chain().map((i) => i.cardId)).toContain(game.card("prison"));
    // P1 holds priority first; pass it so P2 is the one deciding with the spell still pending.
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.chain()).toHaveLength(1);
    expect(game.p2.can("activate", "gp")).toBe(false);
    expect(game.p2.legal().some((o) => o.key.startsWith(`activateAbility:${game.card("gp")}#`))).toBe(false);
    await expect(game.p2.activate("gp", 0)).rejects.toThrow();
  });

  test("(c) during P1's open main phase (Open State but not P2's turn) P2 is not offered Empower either", async () => {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p2.can("activate", "gp")).toBe(false);
  });

  test("(c) control: on P2's own turn in an Open State, with [body][body] available, Empower IS offered and empowers him", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { power: { body: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", GANGPLANK, "gp")
      .build();
    expect(game.p2.can("activate", "gp")).toBe(true);
    await game.p2.activate("gp", 0);
    await game.settle();
    expect(game.state("gp").isEmpowered).toBe(true);
    expect(game.p2.power("body")).toBe(0);
  });

  // ---- (d) "Play only if not Empowered" (827.1.c.1 / 441.1.b) ---------------------------------

  test("(d) already Empowered on P2's turn with the cost available: Empower is NOT offered (827.1.c.1)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { power: { body: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", GANGPLANK, "gp", { empowered: true })
      .build();
    expect(game.state("gp").isEmpowered).toBe(true);
    expect(game.p2.can("activate", "gp")).toBe(false);
    await expect(game.p2.activate("gp", 0)).rejects.toThrow();
  });

  test("(d) after (b): the Empowered flag persists into P2's next turn, and even after recycling runes for [body][body] he cannot Empower again", async () => {
    const game = await board({ empowered: true }).build();
    await game.p1.cast("prison", { targets: "gp" });
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("gp").isEmpowered).toBe(true);
    await game.p2.recycleRune({ domain: "body" });
    await game.p2.recycleRune({ domain: "body" });
    expect(game.p2.power("body")).toBeGreaterThanOrEqual(2);
    expect(game.p2.can("activate", "gp")).toBe(false);
  });
});
