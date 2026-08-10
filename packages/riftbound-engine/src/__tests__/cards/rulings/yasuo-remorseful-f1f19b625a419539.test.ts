/**
 * Ruling f1f19b625a419539 — Yasuo, Remorseful (OGN-076 → ogn-076-298) · 6 Might · "When I attack, deal damage equal to my
 *     Might to an enemy unit here."
 *   × Zenith Blade (OGN-262 → ogn-262-298) · [Action] · "Stun an enemy unit at a battlefield. You may move a friendly unit to
 *     that enemy unit's battlefield."
 *   × Leona, Determined (OGN-238 → ogn-238-298) · 4 Might · [Shield] · "When I attack, stun an enemy unit here."
 *   × Mask of Foresight (OGN-060 → ogn-060-298) · Gear · "When a friendly unit attacks or defends alone, give it +1 Might this turn."
 *   × Radiant Dawn (OGN-261 → ogn-261-298) · Legend · "When you stun one or more enemy units, buff a friendly unit."
 *
 * Q: Yasuo moves to an EMPTY battlefield (non-combat showdown); the opponent answers with Zenith Blade — stun Yasuo, move
 *    Leona there (both players own a Mask of Foresight). Which triggers happen, who attacks/defends, what is the outcome?
 * A: Yasuo (first to contest) is the ATTACKER, Leona the DEFENDER. No Mask trigger during the non-combat showdown; when
 *    combat begins both Masks trigger plus Yasuo's attack trigger (each player orders their own). Radiant Dawn buffs Leona
 *    off the stun. Yasuo — though stunned — still resolves his attack trigger: 7 (6 + Mask) kills Leona.
 * Rules: 344.1 (arrival into an ongoing showdown → combat showdown), 442.1.a / 464.2 (attacker = who applied Contested),
 *        383.3.d (order own simultaneous triggers), 423.1.b (stun only stops COMBAT damage), 740.2.a (alone).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";
const ZENITH_BLADE = "ogn-262-298";
const LEONA = "ogn-238-298";
const MASK = "ogn-060-298";
const RADIANT_DAWN = "ogn-261-298";

/** P1's turn. bf1 open & empty. P1: Yasuo ready in base + Mask. P2 (Radiant Dawn): Leona in base + Mask, Zenith Blade + 3/[R][R]. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .gear(P1, MASK, "mask1")
    .gear(P2, MASK, "mask2")
    .legend(P2, RADIANT_DAWN, "dawn")
    .unit(P1, "base", YASUO, "yasuo")
    .unit(P2, "base", LEONA, "leona")
    .hand(P2, ZENITH_BLADE, "zb")
    .resources(P2, { energy: 3, power: { rainbow: 2 } });
}

const showdown = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).find((s) => s.active);

/** Yasuo → bf1; P1 passes Focus; P2 Zenith Blades (stun Yasuo, move Leona); both pass so it resolves; P2 confirms bf1 for Leona. */
async function yasuoThenZenithBlade(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("yasuo", "bf1");
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "zb")).toBe(true);
  await game.p2.cast("zb", { targets: ["yasuo", "leona"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "zb", controller: P2, targets: ["yasuo", "leona"] })]);
  expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  for (let i = 0; i < 2; i++) {
    const cur = game.decision();
    expect(cur).toMatchObject({ context: "chain", kind: "action" });
    await game.acting().passPriority();
  }
  // Zenith Blade resolving: the optional move asks P2 where Leona goes (only "that enemy unit's battlefield").
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P2) {
    expect(d.options.map((o) => o.key)).toEqual(["battlefield-bf1"]);
    await game.p2.pick("battlefield-bf1");
  }
  expect(game.zoneOf("zb")).toBe("trash");
  return game;
}

describe("Ruling f1f19b625a419539 — Yasuo to an empty field, Zenith Blade brings Leona: Yasuo attacks, Leona defends, Yasuo's 7 kills her", () => {
  test("Yasuo's move to the empty bf1 opens a NON-combat showdown contested by P1: no roles, no Mask trigger, nothing on the chain", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1");
    expect(game.locationOf("yasuo")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: false });
    expect(game.state("yasuo").combatRole).toBeNull();
    expect(game.chain()).toEqual([]); // no Mask of Foresight trigger, no attack trigger
    expect(game.state("yasuo").mightModifier).toBe(0);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("Zenith Blade resolves inside that showdown: Yasuo is stunned, Radiant Dawn triggers for P2 (buff → Leona), Leona is moved to bf1", async () => {
    const game = await yasuoThenZenithBlade();
    expect(game.state("yasuo").isStunned).toBe(true);
    expect(game.locationOf("leona")).toBe("bf1");
    expect(game.chain()).toContainEqual(expect.objectContaining({ cardId: "dawn", controller: P2, targets: ["leona"], triggered: true }));
  });

  // RULING-CONFLICT: riftjudge f1f19b625a419539 says the non-combat showdown must first CLOSE (Focus passed round) before a
  // separate combat showdown begins; CR 344.1 says a showdown already ongoing at a battlefield that becomes contested between
  // two players "will become a Combat Showdown and a Combat will initiate there" — engine follows CR: Leona's arrival upgrades
  // the SAME showdown to combat at once, with Yasuo (who applied Contested) attacking and Leona defending.
  test("Leona's arrival turns the ongoing showdown into a COMBAT showdown (CR 344.1): P1/Yasuo attacker, P2/Leona defender", async () => {
    const game = await yasuoThenZenithBlade();
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.state("leona").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
  });

  test("combat's initial triggers: BOTH Masks (each unit is alone) and Yasuo's attack trigger (aimed at Leona) go on the chain; P1 is offered the order of ITS two", async () => {
    const game = await yasuoThenZenithBlade();
    const triggered = game.chain().filter((c) => c.triggered);
    expect(triggered).toContainEqual(expect.objectContaining({ cardId: "mask1", controller: P1 }));
    expect(triggered).toContainEqual(expect.objectContaining({ cardId: "mask2", controller: P2 }));
    expect(triggered).toContainEqual(expect.objectContaining({ cardId: "yasuo", controller: P1, targets: ["leona"] }));
    // Being stunned did not stop Yasuo's "When I attack" from triggering.
    expect(game.state("yasuo").isStunned).toBe(true);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1, defaultable: true });
    if (d?.kind === "order") {
      expect(new Set(d.items.map((i) => i.card))).toEqual(new Set(["mask1", "yasuo"]));
    }
  });

  test("P1 orders Mask to resolve before Yasuo's trigger: Yasuo is 7 Might (6 + Mask) and deals 7 to Leona — she dies even with Shield, Mask and the Radiant Dawn buff available to her", async () => {
    const game = await yasuoThenZenithBlade();
    const d = game.decision();
    expect(d?.kind).toBe("order");
    if (d?.kind !== "order") {
      return;
    }
    const maskKey = d.items.find((i) => i.card === "mask1")!.key;
    const yasuoKey = d.items.find((i) => i.card === "yasuo")!.key;
    await game.p1.order([yasuoKey, maskKey]); // first = bottom, last = top → Mask resolves first
    // Drain the chain item by item.
    let sawSeven = false;
    for (let i = 0; i < 12 && game.chain().length > 0; i++) {
      const cur = game.decision();
      if (cur?.kind !== "action") {
        break;
      }
      await game.seat(cur.seat).passPriority();
      if (game.chain().some((c) => c.cardId === "yasuo") && game.state("yasuo").mightModifier === 1) {
        sawSeven = game.state("yasuo").might === 7;
      }
    }
    expect(sawSeven).toBe(true); // Mask's +1 landed before Yasuo's trigger resolved
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("leona")).toBe("trash"); // 7 damage ≥ her Might in every reading (4 +1 Shield +1 Mask +1 buff)
    expect(game.state("yasuo")).toMatchObject({ isStunned: true, location: "bf1", might: 7 });
  });

  test("outcome: with Leona dead Yasuo is alone at bf1 when the showdown ends — P1 conquers bf1 and scores 1; Yasuo took no damage", async () => {
    const game = await yasuoThenZenithBlade();
    const d = game.decision();
    if (d?.kind === "order") {
      const maskKey = d.items.find((i) => i.card === "mask1")!.key;
      const yasuoKey = d.items.find((i) => i.card === "yasuo")!.key;
      await game.p1.order([yasuoKey, maskKey]);
    }
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("leona")).toBe("trash");
    expect(game.zoneOf("yasuo")).toBe("battlefield-bf1");
    expect(game.state("yasuo").damage).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
