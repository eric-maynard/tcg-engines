/**
 * Guards! — sfd-154-221 · Spell · Order · 3 energy (no power)
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   Play a 2 [Might] Sand Soldier unit token. You may pay [order] to ready it.
 *   (errata: "Then do this:" before the ready clause — the payment is asked after the token lands.)
 *
 * Head-judge notes — the tricky spots for this card:
 *  - The token is PLAYED (185.2.a/d): a domainless 2-Might unit token, controller = caster, enters
 *    EXHAUSTED like any unit, to the caster's base or a battlefield the caster controls.
 *  - "You may pay [order] to ready it": optional and only on resolution — with an order power the
 *    caster may pay exactly one [order] and the fresh token is ready; declining (or having no order
 *    power) leaves it exhausted and the pool untouched. Energy can never substitute for the [order].
 *  - No [Action]/[Reaction] printed → from HAND it is standard speed: own turn, Open state only; not on
 *    the opponent's turn, not even with Focus in a showdown.
 *  - Hidden (811): hide for one power at a controlled battlefield; from the next turn play it from
 *    facedown for 0 with Reaction timing (811.6) — and a hidden spell that plays a unit must play it
 *    AT that battlefield (811.1.d.3): revealed in answer to an attack, the Sand Soldier arrives as an
 *    extra defender before combat damage.
 *  - A token that leaves the board ceases to exist (186.1).
 *  - Cost 3; unaffordable at 2.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-154-221";

const soldiers = (game: Game, seat: typeof P1 = P1) =>
  game.findAll({ name: "Sand Soldier", owner: seat }).filter((id) => game.zoneOf(id) === "base" || game.zoneOf(id).startsWith("battlefield-"));

/**
 * Resolve the spell: pass priority, answer the token's location with `to`, and answer the
 * "pay [order] to ready it?" question with `pay` (recording whether it was asked / acceptable).
 */
async function resolve(game: Game, opts: { to?: string; pay?: boolean } = {}): Promise<{ askedPay: boolean; canAccept?: boolean }> {
  const out: { askedPay: boolean; canAccept?: boolean } = { askedPay: false };
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && (d.context === "main" || d.context === "showdown"))) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick" && d.seat === P1) {
      const keys = d.options.map((o) => o.key);
      const want = opts.to ?? "base";
      await game.p1.pick(keys.find((k) => k === want || k === `battlefield-${want}`) ?? (keys[0] as string));
    } else if (d.kind === "yes-no" && d.seat === P1) {
      out.askedPay = true;
      out.canAccept = d.canAccept;
      await (opts.pay && d.canAccept !== false ? game.p1.yes() : game.p1.no());
    } else {
      throw new Error(`unexpected ${d.kind} prompt for ${d.seat}: ${d.prompt}`);
    }
  }
  return out;
}

describe("Guards! (sfd-154-221)", () => {
  test("cost 3 energy (no power); one spell item on the chain; resolves into ONE 2-Might domainless Sand Soldier unit token in P1's base, EXHAUSTED; spell → trash", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "guards").build();
    await game.p1.cast("guards");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "guards", controller: P1, triggered: false })]);
    await resolve(game);
    const made = soldiers(game);
    expect(made).toHaveLength(1);
    expect(game.state(made[0] as string)).toMatchObject({ cardType: "unit", controller: P1, isExhausted: true, isToken: true, might: 2, owner: P1, zone: "base" });
    expect(game.state(made[0] as string).domains).toEqual([]);
    expect(soldiers(game, P2)).toEqual([]);
    expect(game.zoneOf("guards")).toBe("trash");
    expect((await scenario().resources(P1, { energy: 2, power: { order: 3 } }).hand(P1, CARD, "g").build()).p1.can("cast", "g")).toBe(false);
  });

  test("the token is played: with a controlled battlefield it may enter there instead of the base (185.2.a)", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 3 }, "holder").battlefield("bf2", { controller: P2 }).hand(P1, CARD, "guards").build();
    await game.p1.cast("guards");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" && d.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf1"]); // never the enemy's bf2
    await resolve(game, { to: "bf1" });
    const made = soldiers(game);
    expect(made).toHaveLength(1);
    expect(game.zoneOf(made[0] as string)).toBe("battlefield-bf1");
  });

  test("'You may pay [order] to ready it' — with an order power the caster must be offered the payment; yes → one [order] spent and the token is READY", async () => {
    // Expected: after the token lands P1 is asked; yes → power.order 2→1, token ready.
    // Actual: the parsed spell only carries create-token — no payment is offered, token stays exhausted.
    const game = await scenario().resources(P1, { energy: 3, power: { order: 2 } }).hand(P1, CARD, "guards").build();
    await game.p1.cast("guards");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 2 } }); // [order] is not part of the play cost
    const r = await resolve(game, { pay: true });
    expect(r.askedPay).toBe(true);
    const made = soldiers(game);
    expect(made).toHaveLength(1);
    expect(game.state(made[0] as string).isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 1 } });
  });

  test("declining the payment keeps the [order] and leaves the token exhausted", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { order: 1 } }).hand(P1, CARD, "guards").build();
    await game.p1.cast("guards");
    await resolve(game, { pay: false });
    const made = soldiers(game);
    expect(made).toHaveLength(1);
    expect(game.state(made[0] as string).isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 1 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("no order power (spare ENERGY and off-domain power do not substitute): the ready cannot be bought — token exhausted, pools untouched", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { fury: 1 } }).hand(P1, CARD, "guards").build();
    await game.p1.cast("guards");
    const r = await resolve(game, { pay: true });
    if (r.askedPay) {
      expect(r.canAccept).toBe(false);
    }
    const made = soldiers(game);
    expect(made).toHaveLength(1);
    expect(game.state(made[0] as string).isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } });
  });

  test("standard timing from hand: not castable on the opponent's turn — neither in their Open state nor with Focus in a showdown", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "holder")
      .unit(P2, "base", { might: 2 }, "poker")
      .hand(P1, CARD, "guards")
      .build();
    expect(game.p1.can("cast", "guards")).toBe(false);
    await game.p2.move("poker", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "guards")).toBe(false);
  });

  test("standard timing: not onto an already-open chain on your own turn either", async () => {
    const ping = { abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }], cardType: "spell", domain: "order", energyCost: 0, name: "Ping", timing: "action" };
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, ping, "ping").hand(P1, CARD, "guards").build();
    expect(game.p1.can("cast", "guards")).toBe(true);
    await game.p1.cast("ping");
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("cast", "guards")).toBe(false);
  });

  test("Hidden: hide for one power at a battlefield you control (energy untouched, no chain); not revealable the same turn; no power ⇒ no hide", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { rainbow: 1 } }).battlefield("bf1", { controller: P1 }).battlefield("bf2", { controller: P2 }).hand(P1, CARD, "guards").build();
    expect(game.p1.option("hide", "guards")?.fields.find((f) => f.arg === "to")?.options).toEqual(["bf1"]);
    await game.p1.hide("guards", "bf1");
    expect(game.zoneOf("guards")).toBe("facedown-bf1");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("reveal", "guards")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3 }).battlefield("bf1", { controller: P1 }).hand(P1, CARD, "g").build()).p1.can("hide", "g")).toBe(false);
  });

  test("from facedown on a later turn: played for 0 and the Sand Soldier must be played AT that battlefield (811.1.d.3) — no base option", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .hand(P1, CARD, "guards")
      .build();
    await game.p1.hide("guards", "bf1");
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    expect(game.p1.can("reveal", "guards")).toBe(true);
    await game.p1.reveal("guards");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.options.some((o) => o.key === "base" || o.key.startsWith("battlefield-"))) {
      expect(d.options.map((o) => o.key)).toEqual(["battlefield-bf1"]); // 811.1.d.3: no "base"
    }
    await resolve(game, { to: "bf1" });
    const made = soldiers(game);
    expect(made).toHaveLength(1);
    expect(game.zoneOf(made[0] as string)).toBe("battlefield-bf1");
    expect(game.zoneOf("guards")).toBe("trash");
  });

  test("Hidden ⇒ Reaction (811.6): revealed in answer to a 2-Might attack on its battlefield, the Soldier joins the defense before damage — the raider dies, bf1 holds, no points for P2", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .hand(P1, CARD, "guards")
      .build();
    await game.p1.hide("guards", "bf1");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.move("raider", "bf1"); // alone the 1-Might guard would lose bf1
    expect(game.p1.can("reveal", "guards")).toBe(false); // attacker has Focus first
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "guards")).toBe(true);
    await game.p1.reveal("guards");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "guards", controller: P1 })]);
    await resolve(game, { to: "bf1" });
    expect(soldiers(game).map((id) => game.zoneOf(id))).toEqual(["battlefield-bf1"]);
    await game.settle(); // showdown closes → combat: 1 + 2 = 3 ≥ 2 kills the raider
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.units("bf1").length).toBeGreaterThanOrEqual(1);
    expect(game.turnPlayer()).toBe(P2);
  });

  test("186.1: a Sand Soldier that leaves the board ceases to exist — killed in combat it is in nobody's trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .hand(P1, CARD, "guards")
      .build();
    await game.p1.cast("guards");
    await resolve(game);
    const [tok] = soldiers(game);
    expect(tok).toBeDefined();
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1); // it readied at Awaken
    expect(game.state(tok as string).isReady).toBe(true);
    await game.p1.move(tok as string, "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(soldiers(game)).toEqual([]);
    expect(game.p1.trash()).not.toContain(tok as string);
    expect(game.findAll({ name: "Sand Soldier" }).filter((id) => game.zoneOf(id) === "trash")).toEqual([]);
  });

  test("parsed abilities should be Hidden + ONE spell ability = create Sand Soldier token THEN optional pay-[order] → ready it", async () => {
    // Expected: the spell ability carries both instructions (create-token, then an optional
    // pay {power:[order]} → ready that token). Actual: only create-token was parsed.
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", energyCost: 3, name: "Guards!" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.timing ?? "standard").toBe("standard");
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities[0]).toEqual({ keyword: "Hidden", type: "keyword" });
    expect(abilities).toHaveLength(2);
    expect(abilities[1]).toMatchObject({ type: "spell" });
    const text = JSON.stringify(abilities[1]);
    expect(text).toContain('"create-token"');
    expect(text).toContain('"Sand Soldier"');
    expect(text).toContain('"ready"'); // the "pay [order] to ready it" rider must survive the parse
    expect(text).toContain('"order"');
  });
});
