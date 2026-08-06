/**
 * Ruling cc1dfe2325b10a8d — Azir, Sovereign (sfd-177-221) · Champion Unit · Order · 4 · 4 Might
 *   "[Accelerate] … When I attack, you may move any number of your token units to this battlefield."
 *   × Hidden Blade (ogn-213-298) "[Hidden] [Action] Kill a unit at a battlefield. Its controller draws 2."
 *   × Overzealous Fan (sfd-128-221) "When I defend, you may kill me to move an attacking unit to its base."
 *
 * Q: If Azir is killed or returned to base before his attack trigger resolves, do token units still move?
 * A: No. "This battlefield" is a referent read from Azir when the instruction executes (359.3.f.1/.2), not
 *    a target (355.10.d). If Azir is dead or in base by then there is no "this battlefield"; the move
 *    instruction cannot be followed and is ignored (359.3.e.6). Two ways this happens: Hidden Blade played
 *    from facedown in response to the trigger; or Overzealous Fan's defend trigger — added after Azir's
 *    (attacker orders first, 464.2.e.1) so it sits above and resolves first — bouncing Azir to base.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AZIR = "sfd-177-221";
const HIDDEN_BLADE = "ogn-213-298";
const OVERZEALOUS_FAN = "sfd-128-221";
/** A 2-Might Sand Soldier token of P1's (the "token-" id prefix marks it as a token instance). */
const SOLDIER = "token-sand-soldier-p1";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * Resolve Azir's own trigger once it is the top item: pass priority for both, accept the "you may",
 * and if the engine asks which token units to move, name the Sand Soldier (only ever the soldier).
 */
async function resolveAzirTrigger(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d: Decision | null = game.decision();
    if (!d) {
      return;
    }
    if (d.kind === "action") {
      if (d.context === "chain" && d.passKey) {
        await game.seat(d.seat).pass();
        continue;
      }
      return; // showdown focus / main phase — trigger is done
    }
    if (d.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
      continue;
    }
    if (d.kind === "pick" && d.seat === P1) {
      const soldier = d.options.find((o) => (o.card ?? o.key) === SOLDIER);
      if (soldier) {
        await game.p1.pick(soldier.key);
      } else {
        // "any number": stop choosing once the soldier is no longer offered.
        const r = await game.p1.try((p) => p.decline());
        if (!r.ok) {
          return;
        }
      }
      continue;
    }
    return;
  }
}

describe("Ruling cc1dfe2325b10a8d — Azir's 'this battlefield' is read on resolution; gone Azir ⇒ tokens stay put", () => {
  // ── Case A: Hidden Blade from facedown kills Azir in response ───────────────────────────────

  /** Turn 3 (blade was hidden earlier). P2 holds bf1 with a 2-Might defender and a facedown Hidden Blade. */
  function bladeBoard() {
    return scenario()
      .turn(3)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Defender" }, "def")
      .facedown(P2, "bf1", HIDDEN_BLADE, "blade")
      .unit(P1, "base", AZIR, "azir")
      .unit(P1, "base", { might: 2, name: "Sand Soldier" }, SOLDIER)
      .autoProcedures(false);
  }

  test("Case A setup: Azir attacking bf1 puts his 'When I attack' trigger on the chain, and P2 may reveal the facedown Hidden Blade in response (it lands above the trigger)", async () => {
    const game = await bladeBoard().build();
    expect(game.state(SOLDIER).isToken).toBe(true);
    await game.p1.move("azir", "bf1");
    expect(game.state("azir").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "azir", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    expect(game.p2.can("reveal", "blade")).toBe(true);
    await game.p2.reveal("blade");
    expect(game.chain().map((c) => c.cardId)).toEqual(["azir", "blade"]);
    // Hidden Blade resolves first: P2 picks Azir → Azir dies while his trigger is still waiting.
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    await game.p2.pick("azir");
    expect(game.zoneOf("azir")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "azir", triggered: true })]);
  });

  // Expected: with Azir in the trash, "this battlefield" has no referent — the Sand Soldier token stays
  // in P1's base (359.3.e.6). Actual: the engine resolves "here" to Azir's CURRENT zone (the trash) and
  // moves the token there, where — being a token — it ceases to exist.
  test.failing("BUG: ruling cc1dfe2325b10a8d — Case A: after Hidden Blade kills Azir, his trigger moves nothing; the token stays in base (engine sends it to Azir's trash)", async () => {
    const game = await bladeBoard().build();
    await game.p1.move("azir", "bf1");
    await game.p1.passPriority();
    await game.p2.reveal("blade");
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p2.pick("azir");
    expect(game.zoneOf("azir")).toBe("trash");
    await resolveAzirTrigger(game);
    expect(game.chain()).toEqual([]);
    expect(game.has(SOLDIER)).toBe(true);
    expect(game.zoneOf(SOLDIER)).toBe("base");
    expect(game.cardsAt("bf1")).not.toContain(SOLDIER);
    expect(game.p1.trash()).not.toContain(SOLDIER);
  });

  // ── Case B: Overzealous Fan bounces Azir first ──────────────────────────────────────────────

  /** P2 holds bf1 with Overzealous Fan + another defender (so combat continues after the Fan dies). */
  function fanBoard() {
    return scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", OVERZEALOUS_FAN, "fan")
      .unit(P2, "bf1", { might: 2, name: "Other Defender" }, "def")
      .unit(P1, "base", AZIR, "azir")
      .unit(P1, "base", { might: 2, name: "Sand Soldier" }, SOLDIER)
      .autoProcedures(false);
  }

  test("Case B ordering: Azir's attack trigger and the Fan's defend trigger fire together; the attacker's is placed first, so the Fan's sits ABOVE it and resolves first (464.2.e.1)", async () => {
    const game = await fanBoard().build();
    await game.p1.move("azir", "bf1");
    expect(game.state("azir").combatRole).toBe("attacker");
    expect(game.state("fan").combatRole).toBe("defender");
    expect(game.chain().map((c) => [c.cardId, c.controller, c.triggered])).toEqual([
      ["azir", P1, true],
      ["fan", P2, true],
    ]);
    // Both pass → the Fan's trigger (top) resolves: P2 may kill it to send the attacking Azir home.
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.yes();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2 && d.options.some((o) => (o.card ?? o.key) === "azir")) {
      await game.p2.pick("azir");
    }
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.zoneOf("azir")).toBe("base");
    // Azir's own trigger is still on the chain, unresolved.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "azir", triggered: true })]);
  });

  test("Case B: with Azir back in base when his trigger resolves, there is no 'this battlefield' — the Sand Soldier token does not move to bf1 and stays in base (359.3.f.2, 359.3.e.6)", async () => {
    const game = await fanBoard().build();
    await game.p1.move("azir", "bf1");
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p2.yes();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2 && d.options.some((o) => (o.card ?? o.key) === "azir")) {
      await game.p2.pick("azir");
    }
    expect(game.zoneOf("azir")).toBe("base");
    await resolveAzirTrigger(game);
    expect(game.chain()).toEqual([]);
    expect(game.has(SOLDIER)).toBe(true);
    expect(game.zoneOf(SOLDIER)).toBe("base");
    expect(game.cardsAt("bf1")).not.toContain(SOLDIER);
    expect(game.cardsAt("bf1")).not.toContain("azir");
    expect(game.state(SOLDIER).isExhausted).toBe(false);
  });

  // ── Control: nothing interferes ─────────────────────────────────────────────────────────────

  test("control: if Azir is still at bf1 when the trigger resolves, 'this battlefield' = bf1 and the Sand Soldier token moves there", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Defender" }, "def")
      .unit(P1, "base", AZIR, "azir")
      .unit(P1, "base", { might: 2, name: "Sand Soldier" }, SOLDIER)
      .autoProcedures(false)
      .build();
    await game.p1.move("azir", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "azir", triggered: true })]);
    await resolveAzirTrigger(game);
    expect(game.zoneOf("azir")).toBe("battlefield-bf1");
    expect(game.zoneOf(SOLDIER)).toBe("battlefield-bf1");
  });
});
