/**
 * Interaction: Here to Help (sfd-111-221) · Spell · Body · 2+[body] · [Hidden] [Action]
 *     "You may play a unit from hand to a battlefield you control, reducing its cost by [3]."
 *   × Atakhan (unl-170-219) · Unit · Order · 10 + [order]×3 · 7 Might
 *     "You may kill a friendly unit as an additional cost to play me. If you do, I cost [1] less for each
 *      Energy it costs and [order] less for each Power it costs. [Ganking] When I attack, …"
 *   × Vaults of Helia (unl-219-219) · Battlefield
 *     "When you hold here, your non-token units cost [1] more to play this turn."
 *   (+ Qiyana, Victorious ogn-155-298 · 4+[body] champion unit — the would-be victim holding the Vaults;
 *    Recruit ogn-271-298 · 1-Might unit TOKEN, cost 0 — the worthless victim.)
 *
 * Rules: 419.3.b (an effect-play runs every normal step of Play, cost determination included), 419.3.c
 * (no eligible/affordable card → nothing is played, resolution continues), 356.1 (base 10+[order]×3),
 * 356.1.c (cost look-ups read the victim's PRINTED cost), 356.2.b.1 (optional non-standard additional cost
 * "kill a friendly unit", declared in step 2, its linked discount applied in 356.4, paid in 357.2), 356.3
 * (Vaults +[1] this turn), 356.4 / 356.4.d.1 (total-level discounts — Here to Help −[3] and Atakhan's own
 * −[E]/−[order]×P of the victim — in any order), 357.2 (the kill is paid in step 4, before he enters),
 * 357.3 (a payment that deterministically strands the play is not allowed → unaffordable variants are not
 * offered), 355.16, 187.4.c + riftjudge 8ea8b2e77937f533 (control of a battlefield is not lost while items
 * are on the chain / mid-play, so killing your only unit there as the cost still lets the new unit enter
 * that battlefield), 143.4 / 359.2.c (units enter exhausted).
 *
 * Question — P1 HELD the Vaults at the start of this turn (surcharge live). Qiyana is P1's only unit on the
 * Vaults; a Recruit token sits in P1's base. P1 casts Here to Help from hand and, on resolution, plays
 * Atakhan to the Vaults.
 *   (a) exact payment electing to kill Qiyana; (b) killing the Recruit token instead; (c) declining the kill;
 *   (d) pool after Here to Help = {4, order 2}: which Atakhan variants are offered? (e) pool {3, order 2}:
 *   what happens to Here to Help? (f) is killing Qiyana — the only unit on the destination — legal at all?
 *
 * Expected: (a) 10 +1 −3 −4 = 4 energy, [order]×3 − 1 (Qiyana's [body] pip) = 2 order; Qiyana dies as the
 * cost, then Atakhan enters the Vaults exhausted. (b) token cost 0 → discount 0 but the cost still counts as
 * paid: 8 energy + 3 order, the Recruit ceases to exist. (c) 8 energy + 3 order, nobody dies. (d) only the
 * kill-Qiyana variant is affordable → Atakhan IS offered, and only with Qiyana as the victim (kill-token /
 * no-kill absent, 357.3). (e) nothing affordable → Here to Help resolves, plays nothing, no prompt; its own
 * 2+[body] is gone; Atakhan stays in hand. (f) legal — the Vaults is still "a battlefield you control"
 * throughout the play; Atakhan lands there and P1 keeps control.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HERE_TO_HELP = "sfd-111-221";
const ATAKHAN = "unl-170-219";
const VAULTS_OF_HELIA = "unl-219-219";
const QIYANA = "ogn-155-298";
const RECRUIT_TOKEN = "ogn-271-298";
const CLEAVE = "ogn-004-298"; // spell-only deck: the turn draw must not put a second unit into P1's hand

const HTH_COST = { energy: 2, body: 1 };

/**
 * P2 is about to end turn 2. P1 controls the LIVE Vaults of Helia with Qiyana (4+[body]) as the only unit
 * there and has a Recruit token in base; hand = Here to Help + Atakhan. P2 holds "other" with a bystander.
 * P1's deck is ten Cleaves (no unit can be drawn), no runes (pool-only affordability).
 */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("vaults", { controller: P1, def: VAULTS_OF_HELIA, inert: false })
    .battlefield("other", { controller: P2 })
    .unit(P1, "vaults", QIYANA, "qiyana")
    .unit(P1, "base", RECRUIT_TOKEN, "recruit")
    .unit(P2, "other", { might: 2, name: "Bystander" }, "theirs")
    .hand(P1, HERE_TO_HELP, "hth")
    .hand(P1, ATAKHAN, "ata")
    .deck(P1, Array.from({ length: 10 }, () => CLEAVE))
    .fillDecks({ main: 10, runes: 0 });
}

/**
 * P2 ends → P1's turn 3: P1 HOLDS the Vaults (+1 point, the surcharge trigger resolves), reaches the open
 * main phase, then floats exactly Here to Help's 2+[body] plus `after` (the pool that must remain once the
 * spell is paid). The Vaults trigger may (engine quirk, flagged elsewhere) ask for a "target" — answered.
 */
async function holdVaultsThenFloat(game: Game, after: { energy: number; order: number }): Promise<void> {
  await game.p2.endTurn();
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "vaults") {
      await game.p1.pick("qiyana");
    } else {
      break;
    }
  }
  await game.settle();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
  expect(game.p1.points()).toBe(1); // the Hold happened → Vaults' surcharge is live this turn
  await game.p1.do("addResources", { energy: HTH_COST.energy + after.energy, power: { body: HTH_COST.body, order: after.order } });
  expect(game.p1.resources()).toEqual({ energy: HTH_COST.energy + after.energy, power: { body: 1, order: after.order } });
}

/** Cast Here to Help (pays 2+[body]) and have both players pass once so it resolves. */
async function castAndResolveHereToHelp(game: Game): Promise<void> {
  const before = game.p1.resources();
  await game.p1.cast("hth");
  expect(game.p1.resources()).toEqual({ energy: before.energy - 2, power: { body: 0, order: before.power.order ?? 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["hth"]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain().some((c) => c.cardId === "hth")).toBe(false);
}

/** The hand units Here to Help offers on resolution ([] when no prompt is raised). */
function unitsOffered(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" && d.seat === P1 ? d.options.map((o) => o.card ?? o.key) : [];
}

interface ElectResult {
  killAsked: boolean;
  killDeclinable: boolean | undefined;
  victimsOffered: string[];
  destinationsOffered: string[];
}

/**
 * Answer the effect-play dialog for Atakhan: pick him from the offer, send him to the Vaults if asked, and
 * elect the optional kill per `kill` (a victim alias, or null = decline) however the engine phrases it
 * (yes/no opt-in and/or a victim pick). Stops once nothing about the play is being asked any more.
 */
async function electAtakhan(game: Game, kill: "qiyana" | "recruit" | null): Promise<ElectResult> {
  const out: ElectResult = { destinationsOffered: [], killAsked: false, killDeclinable: undefined, victimsOffered: [] };
  await game.p1.pick("ata");
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || d.seat !== P1) {
      break;
    }
    if (d.kind === "pick" && d.semantics === "destination") {
      out.destinationsOffered = d.options.map((o) => String(o.key).replace(/^battlefield-/, "")).sort();
      const key = d.options.find((o) => String(o.key).endsWith("vaults"))?.key as string;
      await game.p1.pick(key);
    } else if (d.kind === "yes-no") {
      out.killAsked = true;
      out.killDeclinable = true;
      await (kill !== null && d.canAccept !== false ? game.p1.yes() : game.p1.no());
    } else if (d.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === "qiyana" || (o.card ?? o.key) === "recruit")) {
      out.killAsked = true;
      out.killDeclinable = d.allowDecline;
      out.victimsOffered = d.options.map((o) => o.card ?? o.key).sort();
      if (kill === null) {
        await game.p1.decline();
      } else {
        await game.p1.pick(kill);
      }
    } else {
      break;
    }
  }
  return out;
}

describe("Here to Help → Atakhan onto the held Vaults of Helia: −[3], +[1] and the kill discount on ONE effect-play", () => {
  test("premise: printed costs the discounts read (356.1.c) — Atakhan 10+[order]×3, Qiyana 4+[body], the Recruit is a cost-0 token; after the Hold P1 has 1 point", async () => {
    const game = await board().build();
    await holdVaultsThenFloat(game, { energy: 8, order: 3 });
    expect(game.state("ata")).toMatchObject({ energyCost: 10, powerCost: ["order", "order", "order"] });
    expect(game.state("qiyana")).toMatchObject({ energyCost: 4, location: "vaults", powerCost: ["body"] });
    expect(game.state("recruit")).toMatchObject({ energyCost: 0, isToken: true, location: "base", powerCost: [] });
    expect(game.p1.units("vaults")).toEqual(["qiyana"]); // Qiyana is the ONLY unit holding the Vaults
    expect(game.gameState.battlefields.vaults?.controller).toBe(P1);
    expect(game.p1.hand()).toHaveLength(3); // + the drawn Cleave (a spell — never a Here to Help candidate)
    expect(game.p1.hand()).toEqual(expect.arrayContaining(["ata", "hth"]));
  });

  test("Here to Help itself: pays 2+[body], goes on the chain as P1's item, P2 gets a priority window; nothing of Atakhan's is paid before resolution", async () => {
    const game = await board().build();
    await holdVaultsThenFloat(game, { energy: 8, order: 3 });
    await game.p1.cast("hth");
    expect(game.p1.resources()).toEqual({ energy: 8, power: { body: 0, order: 3 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hth", controller: P1, triggered: false })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.zoneOf("ata")).toBe("hand");
  });

  // ── (c) decline the kill: 10 + 1 − 3 = 8 energy + [order]×3 ────────────────────────────────────────

  test("(c) pool {8, order 3}: on resolution P1 is offered exactly {Atakhan} (declinable 'you may'); NOT killing anything he costs 10+1−3 = 8 energy + 3 order → pool 0/0", async () => {
    const game = await board().build();
    await holdVaultsThenFloat(game, { energy: 8, order: 3 });
    await castAndResolveHereToHelp(game);
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(unitsOffered(game)).toEqual(["ata"]);
    await electAtakhan(game, null);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, order: 0 } });
    expect(game.zoneOf("qiyana")).toBe("battlefield-vaults");
    expect(game.zoneOf("recruit")).toBe("base");
  });

  test("(c) …and Atakhan enters the VAULTS (the only battlefield P1 controls — base is not a legal destination for this instruction, so no destination prompt), EXHAUSTED, beside Qiyana; Here to Help → trash; back to P1's open main phase", async () => {
    const game = await board().build();
    await holdVaultsThenFloat(game, { energy: 8, order: 3 });
    await castAndResolveHereToHelp(game);
    const seen = await electAtakhan(game, null);
    expect(seen.destinationsOffered).toEqual([]); // forced: {vaults}
    await game.settle();
    expect(game.state("ata")).toMatchObject({ controller: P1, isExhausted: true, location: "vaults", might: 7 });
    expect(game.p1.units("vaults").sort()).toEqual(["ata", "qiyana"]);
    expect(game.p1.base()).not.toContain("ata");
    expect(game.zoneOf("hth")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.vaults?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  // ── (a) kill Qiyana: 10 + 1 − 3 − 4 = 4 energy, [order]×3 − 1 = 2 ─────────────────────────────────
  // Expected (419.3.b + 356.2.b.1): the effect-play offers Atakhan's optional "kill a friendly unit" cost
  // exactly like a hand play does; electing Qiyana discounts by her printed 4+[body].
  // Actual: the effect-play dialog never offers the kill (only Accelerate/pay-style optional costs are), so
  // Atakhan is only ever priced at 8 + [order]×3 — at {4, 2} he is not even offered.

  test("(a) pool {4, order 2}: Atakhan is offered and, killing Qiyana as the additional cost, costs exactly 4 energy + 2 order → pool 0/0 (356.2.b.1, 356.4.d.1, 419.3.b)", async () => {
    const game = await board().build();
    await holdVaultsThenFloat(game, { energy: 4, order: 2 });
    await castAndResolveHereToHelp(game);
    expect(unitsOffered(game)).toEqual(["ata"]);
    const seen = await electAtakhan(game, "qiyana");
    expect(seen.killAsked).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, order: 0 } });
  });

  test("(a) the kill is PAID before he enters (357.2): Qiyana → trash, then Atakhan enters the Vaults exhausted; the Recruit is untouched; Here to Help → trash", async () => {
    const game = await board().build();
    await holdVaultsThenFloat(game, { energy: 4, order: 2 });
    await castAndResolveHereToHelp(game);
    await electAtakhan(game, "qiyana");
    await game.settle();
    expect(game.zoneOf("qiyana")).toBe("trash");
    expect(game.state("ata")).toMatchObject({ isExhausted: true, location: "vaults" });
    expect(game.p1.units("vaults")).toEqual(["ata"]);
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.zoneOf("hth")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (f) killing the ONLY unit on the destination battlefield is a legal cost choice ────────────────
  // Expected (187.4.c, riftjudge 8ea8b2e77937f533 — Atakhan specifically; engine BATTLEFIELD CONTROL model:
  // control is KEPT through any Closed State): the Vaults stays "a battlefield you control" while Here to
  // Help resolves and Atakhan is played, so Qiyana IS a legal victim and Atakhan lands on the Vaults; P1
  // never loses control. Actual: unobservable through Here to Help — the kill is never offered (see (a)).

  test("(f) via Here to Help, Qiyana — the lone unit on the Vaults — is offered as the victim, Atakhan still enters the Vaults and P1 controls it afterwards (355.16 does not bite, 187.4.c)", async () => {
    const game = await board().build();
    await holdVaultsThenFloat(game, { energy: 4, order: 2 });
    await castAndResolveHereToHelp(game);
    const seen = await electAtakhan(game, "qiyana");
    expect(seen.victimsOffered).toContain("qiyana");
    await game.settle();
    expect(game.locationOf("ata")).toBe("vaults");
    expect(game.gameState.battlefields.vaults?.controller).toBe(P1);
    expect(game.p1.battlefields({ controlled: true })).toContain("vaults");
  });

  test("(f) control — the same cost choice on a DIRECT hand play is accepted by the engine: at {7, order 3} (10+1−4 / 3−1) Atakhan → Vaults killing Qiyana resolves, Qiyana → trash, Atakhan on the Vaults, P1 keeps control, pool → 0 energy / 1 order", async () => {
    const game = await board().build();
    await holdVaultsThenFloat(game, { energy: 5, order: 3 }); // 2 + 5 = 7 energy floating, no spell cast
    expect(game.p1.can("play", "ata")).toBe(true); // only thanks to the kill-Qiyana discount
    // Raw move: the enumerator's discount-only variants name base as the location (asserted below), but the
    // move's own legality check accepts the controlled Vaults with its lone unit as the victim.
    await game.p1.do("playUnit", { cardId: "ata", location: "battlefield-vaults", paidAdditionalCost: true, playerId: P1, sacrificeId: "qiyana" });
    await game.settle();
    expect(game.zoneOf("qiyana")).toBe("trash");
    expect(game.state("ata")).toMatchObject({ isExhausted: true, location: "vaults" });
    expect(game.gameState.battlefields.vaults?.controller).toBe(P1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1, order: 1 } });
    // (the harness's generic `costPaid` invariant does not know the kill discount — not asserted here)
  });

  test("(f) the direct kill-Qiyana play is OFFERED to the Vaults, not just to base (355.2.a — a controlled battlefield is a valid location)", async () => {
    const game = await board().build();
    await holdVaultsThenFloat(game, { energy: 5, order: 3 });
    const locations = [...new Set((game.p1.option("play", "ata")?.variants ?? []).filter((v) => v.params.sacrificeId === "qiyana").map((v) => game.normalizeZone(String(v.params.location))))].sort();
    expect(locations).toEqual(["base", "battlefield-vaults"].map((z) => game.normalizeZone(z)).sort());
    await game.p1.play("ata", { sacrifice: "qiyana", to: "vaults" });
    expect(game.locationOf("ata")).toBe("vaults");
  });

  // ── (b) kill the Recruit TOKEN: discount 0, cost still paid ────────────────────────────────────────
  // Expected (356.4.f.1 / 357.2): the token's printed cost is 0 → no discount, but the kill is still a paid
  // cost: 8 energy + 3 order AND the Recruit ceases to exist (186.1). Actual: no kill is offered, so the
  // Recruit survives (the 8 + 3 price happens to coincide).

  test("(b) pool {8, order 3}: electing to kill the Recruit token is possible — it dies for nothing (discount 0): pool 0/0, Recruit gone, Qiyana stays, Atakhan on the Vaults", async () => {
    const game = await board().build();
    await holdVaultsThenFloat(game, { energy: 8, order: 3 });
    await castAndResolveHereToHelp(game);
    const seen = await electAtakhan(game, "recruit");
    await game.settle();
    expect(seen.killAsked).toBe(true);
    expect(seen.victimsOffered.sort()).toEqual(["qiyana", "recruit"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, order: 0 } });
    expect(game.has("recruit") && game.zoneOf("recruit") !== "gone").toBe(false);
    expect(game.zoneOf("qiyana")).toBe("battlefield-vaults");
    expect(game.locationOf("ata")).toBe("vaults");
  });

  // ── (d) {4, order 2}: only the kill-Qiyana variant exists ──────────────────────────────────────────
  // Expected (357.3 / 419.2.a): Atakhan is offered because ONE variant is payable, and once picked the only
  // way through is killing Qiyana — the kill cannot be declined and the Recruit is not a candidate (either
  // would strand the play at 8 + [order]×3). Actual: Atakhan is absent from the offer altogether.

  test("(d) pool {4, order 2}: Atakhan IS offered; the kill is then mandatory-in-fact (not declinable) and its candidate set is {Qiyana} only — kill-token / no-kill variants are absent, not offered-then-rejected (357.3)", async () => {
    const game = await board().build();
    await holdVaultsThenFloat(game, { energy: 4, order: 2 });
    await castAndResolveHereToHelp(game);
    expect(unitsOffered(game)).toEqual(["ata"]);
    const seen = await electAtakhan(game, "qiyana");
    expect(seen.killAsked).toBe(true);
    expect(seen.killDeclinable).toBe(false);
    expect(seen.victimsOffered).toEqual(["qiyana"]);
  });

  test("(d) the Recruit TOKEN on the board is never a 'unit from hand' candidate; declining whatever is offered leaves Atakhan in hand, the 2 order untouched and Here to Help in the trash", async () => {
    const game = await board().build();
    await holdVaultsThenFloat(game, { energy: 4, order: 2 });
    await castAndResolveHereToHelp(game);
    expect(unitsOffered(game)).not.toContain("recruit"); // a board token is never a "unit from hand"
    if (game.decision()?.kind === "pick") {
      await game.p1.decline();
    }
    await game.settle();
    expect(game.zoneOf("hth")).toBe("trash");
    expect(game.p1.resources().power.order).toBe(2);
    expect(game.zoneOf("ata")).toBe("hand");
    expect(game.zoneOf("recruit")).toBe("base");
  });

  // ── (e) {3, order 2}: nothing is affordable → Here to Help plays nothing ───────────────────────────

  test("(e) pool {3, order 2}: no Atakhan variant is payable (kill-Qiyana needs 4) → Here to Help resolves and finds no eligible play: NO prompt at all (419.3.c), straight back to P1's main phase", async () => {
    const game = await board().build();
    await holdVaultsThenFloat(game, { energy: 3, order: 2 });
    await castAndResolveHereToHelp(game);
    const d = game.decision();
    expect(d?.kind).not.toBe("pick");
    expect(d).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(e) …Here to Help's own 2+[body] is NOT refunded (pool stays {3, order 2, body 0}), it is in the trash, Atakhan is still in hand, Qiyana and the Recruit are untouched", async () => {
    const game = await board().build();
    await holdVaultsThenFloat(game, { energy: 3, order: 2 });
    await castAndResolveHereToHelp(game);
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 3, power: { body: 0, order: 2 } });
    expect(game.zoneOf("hth")).toBe("trash");
    expect(game.p1.trash()).toEqual(["hth"]);
    expect(game.zoneOf("ata")).toBe("hand");
    expect(game.zoneOf("qiyana")).toBe("battlefield-vaults");
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(e)/(c) control — the +[1] really is the Vaults': on an INERT Vaults (held, no surcharge) the kill-less play through Here to Help costs 10 − 3 = 7 energy + 3 order → offered and played at exactly {7, order 3}", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("vaults", { controller: P1, def: VAULTS_OF_HELIA, inert: true })
      .battlefield("other", { controller: P2 })
      .unit(P1, "vaults", QIYANA, "qiyana")
      .unit(P1, "base", RECRUIT_TOKEN, "recruit")
      .unit(P2, "other", { might: 2, name: "Bystander" }, "theirs")
      .hand(P1, HERE_TO_HELP, "hth")
      .hand(P1, ATAKHAN, "ata")
      .deck(P1, Array.from({ length: 10 }, () => CLEAVE))
      .fillDecks({ main: 10, runes: 0 })
      .build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(1); // held, but the inert Vaults adds no surcharge
    await game.p1.do("addResources", { energy: 2 + 7, power: { body: 1, order: 3 } });
    await castAndResolveHereToHelp(game);
    expect(unitsOffered(game)).toEqual(["ata"]);
    await electAtakhan(game, null);
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, order: 0 } });
    expect(game.locationOf("ata")).toBe("vaults");
  });
});
