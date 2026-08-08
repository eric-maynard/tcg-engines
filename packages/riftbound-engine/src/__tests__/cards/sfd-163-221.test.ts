/**
 * Deathgrip — sfd-163-221 · Spell · Order · 2 energy (no power) · Reaction
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Kill a friendly unit. If you do, give +[Might] equal to its Might to another friendly unit this turn.
 *   Draw 1.
 *
 * Rules: 813 (Reaction: may be played whenever you hold Priority — including on top of an opponent's
 * spell on their turn; in a Neutral Open state on the opponent's turn you hold no Priority, 316.5.b),
 * 355.5/355.8 (the victim and the "another friendly unit" recipient are both chosen as it is played;
 * only FRIENDLY units qualify as victim), 359.3.e.14.b (this very card is the rules' example: "If you
 * do" references the kill ACTION — if the death is replaced, no Might is given), 359.3.e.5 ("Draw 1" is
 * an unlinked instruction: it happens even when the kill cannot), 359.3.f.2 ("its Might" = the victim's
 * Might as it is killed, buffs included), 336 (LIFO: a Reaction resolves before the item under it).
 *
 * Head-judge notes — trickiest situations for this card:
 *  - In response to an enemy removal spell on your unit: Deathgrip it yourself → you draw (and should
 *    pump a survivor); their spell then finds no target and does nothing.
 *  - Zhonya's Hourglass on board: the victim "would die" → Hourglass dies instead, victim is healed /
 *    exhausted / recalled → "If you do" is FALSE → nobody gets +Might, but you still Draw 1.
 *  - "+Might equal to its Might": a buffed 3-Might victim gives +4, for this turn only.
 *  - Enemy units are never legal victims; with no friendly unit on the board the spell is uncastable.
 *  - Reaction ≠ "any time at all": on the opponent's turn with nothing happening P1 has no priority.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-163-221";
const HOURGLASS = "ogn-077-298"; // Zhonya's Hourglass: "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
const CULL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Cull",
  timing: "action",
};

function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Victim" }, "victim")
    .unit(P1, "bf1", { might: 2, name: "Heir" }, "heir")
    .unit(P1, "base", { might: 1, name: "Homebody" }, "homebody")
    .unit(P2, "base", { might: 4, name: "Foe" }, "foe")
    .hand(P1, CARD, "dg");
}

/** Cast Deathgrip killing `victim`, naming `heir` as the +Might recipient however the engine asks for it. */
async function castKilling(game: Game, victim: string, heir: string): Promise<void> {
  const two = await game.p1.try((p) => p.cast("dg", { targets: [victim, heir] }));
  if (!two.ok) {
    await game.p1.cast("dg", { answers: [heir], targets: victim });
  }
  await game.settle();
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick(heir);
    await game.settle();
  }
}

describe("Deathgrip (sfd-163-221)", () => {
  test("cost: 2 energy, no power — deducted on cast, spell waits on the chain; unaffordable at 1 energy", async () => {
    const game = await board().build();
    await game.p1.cast("dg", { targets: "victim" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dg", controller: P1, triggered: false })]);
    expect(game.zoneOf("victim")).toBe("battlefield-bf1"); // nothing dies before resolution
    const poor = await board().resources(P1, { energy: 1, power: { order: 2 } }).build();
    expect(poor.p1.can("cast", "dg")).toBe(false);
  });

  test("'Kill a friendly unit': only FRIENDLY units (base or battlefield) are offered — the enemy Foe never is; the chosen one dies and the spell goes to trash", async () => {
    const game = await board().build();
    const victims = game.p1.option("cast", "dg")?.fields.find((f) => f.arg === "targets")?.options ?? [];
    expect(victims.map((v) => (v as string[])[0]).sort()).toEqual(["heir", "homebody", "victim"]);
    expect((await game.p1.try((p) => p.cast("dg", { targets: "foe" }))).ok).toBe(false);
    await game.p1.cast("dg", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("base");
    // rule 359.3.d — the spell leaves the chain only once its effect has finished,
    // so answer the prompt(s) its resolution is still waiting on.
    await game.settle({ policy: "first" });
    expect(game.zoneOf("dg")).toBe("trash");
  });

  test("'Draw 1': the caster draws exactly one card as it resolves (opponent draws nothing)", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    const deckBefore = game.p1.deck().length;
    await game.p1.cast("dg", { targets: "homebody" });
    expect(game.p1.hand()).toHaveLength(0);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck()).toHaveLength(deckBefore - 1);
    expect(game.p2.hand()).toHaveLength(p2Hand);
  });

  test("no friendly unit on the board (only enemies) → no legal victim → not castable (355.8)", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 1 }, "e1").unit(P2, "base", { might: 1 }, "e2").hand(P1, CARD, "dg").build();
    expect(game.p1.can("cast", "dg")).toBe(false);
  });

  test("'If you do, give +Might equal to its Might to another friendly unit this turn' — killing the 3-Might Victim must give the chosen Heir +3 (2 → 5) until end of turn", async () => {
    // Expected: the recipient is chosen (as a second target at play time, 355.5 — or at worst prompted) and ends
    // at 5 Might this turn, back to 2 next turn. Actual: the parsed spell is only [kill, draw 1]; no Might is given.
    const game = await board().build();
    await castKilling(game, "victim", "heir");
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.state("heir").might).toBe(5);
    expect(game.state("homebody").might).toBe(1); // only ONE other friendly unit is pumped
    await game.advanceTurn();
    expect(game.state("heir").might).toBe(2);
  });

  test("359.3.f.2 — 'its Might' is the victim's Might as it dies, buffs included: a buffed 3(+1) Victim gives +4 (Heir 2 → 6)", async () => {
    // Expected: heir 6. Actual: no Might bonus is implemented at all.
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Victim" }, "victim", { buffed: true })
      .unit(P1, "base", { might: 2, name: "Heir" }, "heir")
      .hand(P1, CARD, "dg")
      .build();
    expect(game.state("victim").might).toBe(4);
    await castKilling(game, "victim", "heir");
    expect(game.state("heir").might).toBe(6);
  });

  test("[Reaction] on the opponent's turn: in response to their removal spell on Victim, Deathgrip resolves first (LIFO) — Victim dies on YOUR terms, you draw 1, and their spell then does nothing", async () => {
    const game = await board().active(P2).resources(P2, { energy: 1 }).hand(P2, CULL, "cull").build();
    await game.p2.cast("cull", { targets: "victim" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "dg")).toBe(true);
    // the linked "+Might to another friendly unit" is a resolution-time choice (355.10)
    await game.p1.cast("dg", { answers: ["heir"], targets: "victim" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["cull", "dg"]); // Deathgrip on top
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("cull")).toBe("trash");
    // rule 359.3.d — the spell leaves the chain only once its effect has finished,
    // so answer the prompt(s) its resolution is still waiting on.
    await game.settle({ policy: "first" });
    expect(game.zoneOf("dg")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(1); // drew 1
    expect(game.zoneOf("heir")).toBe("battlefield-bf1"); // the fizzled Cull did not retarget anything
    expect(game.zoneOf("homebody")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("[Reaction] is not 'literally any time': on the opponent's turn in a Neutral Open state P1 holds no priority, so it is not offered (316.5.b)", async () => {
    const game = await board().active(P2).build();
    expect(game.p1.can("cast", "dg")).toBe(false);
    expect(game.zoneOf("dg")).toBe("hand");
  });

  test("[Reaction] during a combat showdown on the opponent's turn: with Focus passed to P1 it is castable; the kill and the draw resolve before combat damage", async () => {
    const game = await board().active(P2).unit(P2, "base", { might: 2, name: "Raider" }, "raider").build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "dg")).toBe(true);
    await game.p1.cast("dg", { answers: ["heir"], targets: "homebody" });
    await game.settle();
    expect(game.zoneOf("homebody")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(1);
    // Combat then resolves: Victim 3 + Heir 2 = 5 vs Raider 2 → raider dies, P1 keeps bf1.
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("359.3.e.14.b (the rules' own Deathgrip example) with Zhonya's Hourglass: the death is REPLACED — Hourglass dies instead, Victim is healed/exhausted/recalled, nobody gains Might, and Draw 1 still happens", async () => {
    const game = await board().gear(P1, HOURGLASS, "hourglass").build();
    await game.p1.cast("dg", { targets: "victim" });
    await game.settle();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("heir");
      await game.settle();
    }
    expect(game.zoneOf("hourglass")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.state("heir").might).toBe(2); // "If you do" is false → no bonus
    expect(game.state("homebody").might).toBe(1);
    expect(game.p1.hand()).toHaveLength(1); // Draw 1 is not linked to the kill
    // rule 359.3.d — the spell leaves the chain only once its effect has finished,
    // so answer the prompt(s) its resolution is still waiting on.
    await game.settle({ policy: "first" });
    expect(game.zoneOf("dg")).toBe("trash");
  });

  test("359.3.e.5: if the victim is gone before resolution (killed in response), the kill can't be followed — but the unlinked 'Draw 1' still resolves", async () => {
    const game = await board().resources(P2, { energy: 1 }).hand(P2, { ...CULL, abilities: [{ ...CULL.abilities[0], timing: "reaction" }], name: "Reaction Cull", timing: "reaction" }, "snipe").build();
    await game.p1.cast("dg", { targets: "victim" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("snipe", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash"); // died to the snipe, not to Deathgrip
    // rule 359.3.d — the spell leaves the chain only once its effect has finished,
    // so answer the prompt(s) its resolution is still waiting on.
    await game.settle({ policy: "first" });
    expect(game.zoneOf("dg")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(1); // still drew
    expect(game.state("heir").might).toBe(2); // and certainly no bonus
    expect(game.zoneOf("heir")).toBe("battlefield-bf1"); // Deathgrip did not retarget another friendly unit
    expect(game.zoneOf("homebody")).toBe("base");
  });

  test("parsed abilities must match the printed text — Reaction spell: kill friendly unit → linked '+Might equal to its Might to ANOTHER friendly unit this turn' → draw 1", async () => {
    // Actual: abilities = [{ spell/reaction: sequence[ kill{friendly unit}, draw 1 ] }] — the "If you do, give +Might…"
    // linked instruction is silently dropped by the parser.
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "order", energyCost: 2, name: "Deathgrip", timing: "reaction" });
    expect(def?.powerCost ?? []).toEqual([]);
    const abilities = (def?.abilities ?? []) as { type: string; timing?: string; effect?: { type: string; effects?: Record<string, unknown>[] } }[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({ timing: "reaction", type: "spell" });
    const steps = abilities[0]?.effect?.type === "sequence" ? (abilities[0].effect.effects ?? []) : [abilities[0]?.effect as Record<string, unknown>];
    expect(steps[0]).toMatchObject({ target: { controller: "friendly", type: "unit" }, type: "kill" });
    expect(steps.at(-1)).toMatchObject({ amount: 1, type: "draw" });
    const json = JSON.stringify(abilities);
    expect(json).toMatch(/modify-might|grant-might|give-might/);
    expect(json).toMatch(/"duration":"turn"/);
    expect(json).toMatch(/excludeSelf|another|other/);
    expect(json).toMatch(/if-you-do|ifYouDo|conditional|linked/i);
  });
});
