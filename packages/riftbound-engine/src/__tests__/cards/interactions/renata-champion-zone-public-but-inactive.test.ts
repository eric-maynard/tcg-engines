/**
 * Interaction: Renata Glasc, Industrialist (sfd-171-221) · Champion Unit · Order · 4 + [order] · 4 Might
 *     "Your tokens enter ready."
 *   × Herald of the Arcane (ogn-265-298) · Legend (Viktor) · "[1], [Exhaust]: Play a 1 [Might] Recruit unit token."
 *   (+ Vengeance ogn-229-298 "Kill a unit." to kill her, Morbid Return ogn-170-298 "Return a unit from your trash to
 *    your hand.", Hallowed Tomb ogn-281-298 "When you hold here, you may return your Chosen Champion from your trash
 *    to your Champion Zone if it is empty.", and Master Yi, Unstoppable unl-059-219 "[Level 3] I cost [2][calm] less"
 *    as the contrasting champion whose Champion-Zone text DOES work there.)
 *
 * Rules: 365.1 (a permanent's passive is active only while it is on the Board), 366.1 (an off-board passive must
 * self-describe its zone), 366.2 / 366.2.a (cost-altering passives apply at all times in any zone the card can be
 * played from), 385.1 (off-board TRIGGERS depend on the zone's information level), 108.3.d / 419.1.a (the Chosen
 * Champion can be played from the Champion Zone), 108.3.e / 355.10.a / 355.10.a.1 (Champion Zone and trash are
 * Public zones — that governs targeting/knowledge), 143.4 (units — tokens included — enter exhausted), 124 (a card
 * moving to/from a non-board zone is a new object).
 *
 * Question: the Champion Zone is PUBLIC — does that switch a champion's board-style passive on?
 *   (a) Renata still in the CZ, P1 activates Herald: Recruit ready?      (b) Renata played to base, another Recruit?
 *   (c) Renata killed (→ trash, also Public): next Recruit?               (d) Renata back in the CZ / in hand: next Recruit?
 *   (e) contrast Master Yi, Unstoppable's CZ cost reduction — why does THAT work from the same zone?
 *   And: the engine's static-passive registry entry for Renata at each step.
 *
 * Expected: (a) EXHAUSTED — no registry entry while she waits in the CZ. (b) Renata herself enters exhausted (her text
 * covers tokens, not her); entry registered; the Recruit enters READY. (c) she dies → new object in the trash, entry
 * gone at once; next Recruit EXHAUSTED although the trash is Public too. (d) in the CZ again or in hand: still no
 * entry, Recruit EXHAUSTED; replaying her registers a fresh entry and Recruits enter ready again. (e) Yi's text alters
 * HIS OWN cost and 366.2.a makes it apply from any zone he can be played from (the CZ, 108.3.d) — same public zone,
 * opposite answers: the discriminator is the ability's self-described scope, not the zone's information level.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../../harness";

const RENATA = "sfd-171-221";
const HERALD = "ogn-265-298";
const VENGEANCE = "ogn-229-298";
const MORBID_RETURN = "ogn-170-298";
const HALLOWED_TOMB = "ogn-281-298";
const MASTER_YI = "unl-059-219";

/**
 * P1's turn 2. Legend Herald of the Arcane (ready), Renata waiting in the Champion Zone, plenty of energy + [order]
 * (Renata 4+[order], Vengeance 4+[order][order], Morbid Return 2, Herald [1] each).
 * P1 controls no battlefield, so every "play a token" lands in base without a destination prompt. Vengeance and
 * Morbid Return in hand for the kill / return steps. P2 only has a bystander.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 20, power: { order: 6 } })
    .legend(P1, HERALD, "herald")
    .champion(P1, RENATA, "renata")
    .hand(P1, VENGEANCE, "veng")
    .hand(P1, MORBID_RETURN, "morbid")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "foe");
}

const recruitsOf = (game: Game) => game.findAll({ name: "Recruit", owner: P1 }).filter((id) => game.locationOf(id) !== undefined);

/** Activate Herald ([1], [Exhaust]), let the ability resolve, and return the freshly played Recruit token. */
async function makeRecruit(game: Game): Promise<string> {
  const before = new Set(recruitsOf(game));
  // Herald exhausts as a cost; between activations we simply ready it again (stands in for the next Awaken).
  if (game.state("herald").isExhausted) {
    await game.p1.do("readyCard", { cardId: "herald" });
  }
  await game.p1.activate("herald");
  const r = await game.settle();
  expect(r.reason).toBe("open");
  const fresh = recruitsOf(game).filter((id) => !before.has(id));
  expect(fresh).toHaveLength(1);
  return fresh[0] as string;
}

/**
 * The engine's static-passive registry, as observable through the harness: while a permanent's static ability is
 * live, the recalculation pass stamps its grant marker (`EntersReady`, duration "static") on the source. No marker ⇒
 * the passive is not registered.
 */
const renataPassiveRegistered = (game: Game): boolean =>
  game.state("renata").grantedKeywords.some((g) => g.keyword === "EntersReady" && g.duration === "static");

describe("Renata Glasc in the (public) Champion Zone × Herald of the Arcane — public ≠ active", () => {
  // ── (a) Renata waiting in the Champion Zone ────────────────────────────────────────────────────────

  test("(a) the Champion Zone is a public zone: P2's view of the game shows Renata's identity there (108.3.e / 355.10.a.1)", async () => {
    const game = await board().build();
    expect(game.zoneOf("renata")).toBe("championZone");
    const seenByP2 = game.p2.view().zones["championZone"] ?? [];
    const entry = seenByP2.find((c) => "id" in c && c.id === "renata");
    expect(entry).toBeDefined();
    expect(entry && "hidden" in entry ? entry.hidden : false).toBe(false);
  });

  test("(a) …yet with Renata only in the CZ, Herald's Recruit enters EXHAUSTED — public information level does not switch a board passive on (365.1, 143.4)", async () => {
    const game = await board().build();
    const recruit = await makeRecruit(game);
    expect(game.state(recruit)).toMatchObject({ controller: P1, isExhausted: true, isToken: true, might: 1, zone: "base" });
    expect(game.state("herald").isExhausted).toBe(true); // [Exhaust] paid
    expect(game.p1.energy()).toBe(19); // [1] paid
    expect(game.zoneOf("renata")).toBe("championZone");
  });

  // Expected: no registry entry for "Your tokens enter ready" while Renata merely waits in the Champion Zone — 365.1
  // keeps a permanent's passive off until it is on the Board, and 366.1 would need the text to name the CZ itself.
  // Actual: the static recalculation treats the Champion Zone like the board for this self-sourced grant and stamps
  // the live `EntersReady` marker on the unplayed Renata (token creation ignores it, so (a) above still holds).
  test("(a) the static-passive registry must hold NO Renata entry while she is in the Champion Zone (365.1 / 366.1)", async () => {
    const game = await board().build();
    expect(game.zoneOf("renata")).toBe("championZone");
    expect(renataPassiveRegistered(game)).toBe(false);
    await makeRecruit(game);
    expect(renataPassiveRegistered(game)).toBe(false); // making a token did not wake her up either
  });

  // ── (b) Renata played to the board ─────────────────────────────────────────────────────────────────

  test("(b) P1 plays Renata from the CZ (108.3.d / 419.1.a): she enters base EXHAUSTED herself ('tokens', not her) and her passive is now registered", async () => {
    const game = await board().build();
    await game.p1.playChampion("base");
    await game.settle();
    expect(game.zoneOf("renata")).toBe("base");
    expect(game.state("renata")).toMatchObject({ isExhausted: true, isToken: false, might: 4 });
    expect(game.p1.resources()).toEqual({ energy: 16, power: { order: 5 } });
    expect(game.p1.champion()).toBeUndefined();
    expect(renataPassiveRegistered(game)).toBe(true);
  });

  test("(b) with Renata on the board the next Recruit enters READY; the Recruit made while she was still in the CZ stays exhausted ('enter' is not retroactive)", async () => {
    const game = await board().build();
    const first = await makeRecruit(game); // (a): exhausted
    await game.p1.playChampion("base");
    await game.settle();
    const second = await makeRecruit(game);
    expect(game.state(second)).toMatchObject({ isReady: true, isToken: true, might: 1, zone: "base" });
    expect(game.state(first).isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) Renata killed → trash (public, but off-board) ──────────────────────────────────────────────

  test("(c) Vengeance kills Renata → she is in P1's trash (a Public zone too) as a new object; the registry entry is gone IMMEDIATELY and the next Recruit enters EXHAUSTED (124, 365.1)", async () => {
    const game = await board().build();
    await game.p1.playChampion("base");
    await game.settle();
    const readyOne = await makeRecruit(game);
    expect(game.state(readyOne).isReady).toBe(true);
    await game.p1.cast("veng", { targets: "renata" });
    await game.settle();
    expect(game.zoneOf("renata")).toBe("trash");
    expect(renataPassiveRegistered(game)).toBe(false);
    expect(game.state("renata").grantedKeywords).toEqual([]); // 124.1: nothing tracked on the new object
    const after = await makeRecruit(game);
    expect(game.state(after).isExhausted).toBe(true);
    expect(game.state(readyOne).isReady).toBe(true); // the earlier token is untouched
  });

  // ── (d) back in hand / back in the Champion Zone ───────────────────────────────────────────────────

  test("(d) Morbid Return puts the dead Renata into P1's HAND: still no entry, Recruit EXHAUSTED; replaying her from hand registers a FRESH entry and the Recruit after that enters READY", async () => {
    const game = await board().build();
    await game.p1.playChampion("base");
    await game.settle();
    await game.p1.cast("veng", { targets: "renata" });
    await game.settle();
    await game.p1.cast("morbid", { targets: "renata" });
    await game.settle();
    expect(game.zoneOf("renata")).toBe("hand");
    expect(renataPassiveRegistered(game)).toBe(false);
    const fromHandEra = await makeRecruit(game);
    expect(game.state(fromHandEra).isExhausted).toBe(true);

    await game.p1.play("renata", { to: "base" });
    await game.settle();
    expect(game.zoneOf("renata")).toBe("base");
    expect(game.state("renata").isExhausted).toBe(true);
    expect(renataPassiveRegistered(game)).toBe(true);
    const afterReplay = await makeRecruit(game);
    expect(game.state(afterReplay).isReady).toBe(true);
    // 20 − Renata 4 − Vengeance 4 − Morbid Return 2 − Herald 1 − Renata 4 − Herald 1; order 6 − 1 − 2 − 1.
    expect(game.p1.resources()).toEqual({ energy: 4, power: { order: 2 } });
    expect(game.violations()).toEqual([]);
  });

  /**
   * Champion-Zone return via Hallowed Tomb. Hallowed Tomb returns "your Chosen Champion" — the champion whose tag
   * matches your legend (103.2.a.3) — so for this variant P1's legend is Herald of the Arcane's own definition with
   * only its champion tag re-pointed at Renata Glasc (everything else, including the Recruit ability, is Herald's).
   * P2 is finishing turn 2; P1 holds the Tomb with a vanilla unit; Renata (already died) lies in P1's trash next to
   * an exhausted Recruit from her on-board era.
   */
  async function tombBoard(): Promise<Game> {
    const herald = (await loadDefaultCardPool()).get(HERALD);
    expect(herald).toBeDefined();
    const game = await scenario()
      .active(P2)
      .legend(P1, { ...(herald as NonNullable<typeof herald>), championTag: "Renata Glasc" }, "herald")
      .battlefield("tomb", { controller: P1, def: HALLOWED_TOMB, inert: false })
      .unit(P1, "tomb", { might: 3, name: "Tomb Holder" }, "holder")
      .trash(P1, RENATA, "renata")
      .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
      .build();
    expect(game.zoneOf("renata")).toBe("trash");
    expect(renataPassiveRegistered(game)).toBe(false);
    return game;
  }

  /** P2 ends turn 2 → P1's Beginning Phase: the Tomb's optional hold trigger is accepted → open main phase. */
  async function holdAndReturn(game: Game): Promise<void> {
    await game.p2.endTurn();
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
  }

  const baseDestination = (d: { kind: string; semantics?: string }) => (d.kind === "pick" && d.semantics === "destination" ? "base" : undefined);

  test("(d) Hallowed Tomb's hold trigger returns Renata trash → Champion Zone at the start of P1's turn (she is P1's Chosen Champion again, publicly visible there); the hold also scored", async () => {
    const game = await tombBoard();
    await holdAndReturn(game);
    expect(game.zoneOf("renata")).toBe("championZone");
    expect(game.p1.champion()).toBe("renata");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.can("playChampion")).toBe(false); // no resources yet — but the play itself is on the menu once paid for:
    await game.p1.do("addResources", { energy: 4, power: { order: 1 } });
    expect(game.p1.can("playChampion")).toBe(true);
  });

  test("(d) …and Herald's Recruit made while the returned Renata waits in the CZ enters EXHAUSTED; playing her out of the CZ again → the following Recruit enters READY (a fresh object, a fresh passive)", async () => {
    const game = await tombBoard();
    await holdAndReturn(game);
    await game.p1.do("addResources", { energy: 10, power: { order: 1 } });
    // P1 now controls the Tomb, so "play a token" asks base-or-there: answer base.
    game.script(P1, [baseDestination]);
    const waiting = await makeRecruit(game);
    expect(game.state(waiting)).toMatchObject({ isExhausted: true, zone: "base" });

    await game.p1.playChampion("base");
    await game.settle();
    expect(game.zoneOf("renata")).toBe("base");
    expect(renataPassiveRegistered(game)).toBe(true);
    game.script(P1, [baseDestination]);
    const afterReplay = await makeRecruit(game);
    expect(game.state(afterReplay)).toMatchObject({ isReady: true, zone: "base" });
    expect(game.state(waiting).isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  // Expected: trash → CZ is another non-board → non-board hop; the entry deregistered at her death must NOT reappear
  // until she is played to the board again. Actual: as in (a), the recalculation re-registers the `EntersReady`
  // marker the moment she lands back in the Champion Zone.
  test("(d) a Renata returned to the Champion Zone has NO registry entry until she is actually replayed (365.1 / 124)", async () => {
    const game = await tombBoard();
    await holdAndReturn(game);
    expect(game.zoneOf("renata")).toBe("championZone");
    expect(renataPassiveRegistered(game)).toBe(false);
  });

  // ── (e) contrast: Master Yi, Unstoppable's self-cost passive DOES apply from the CZ ────────────────

  test("(e) Master Yi, Unstoppable in the CZ at 3 XP: '[Level 3] I cost [2][calm] less' prices the Champion-Zone play at 10 + [calm][calm] (366.2.a / 108.3.d) — legal with exactly that, not with 9 + 2 or 10 + 1", async () => {
    const yi = (energy: number, calm: number, xp = 3) =>
      scenario().xp(P1, xp).resources(P1, { energy, power: { calm } }).champion(P1, MASTER_YI, "yi").unit(P2, "base", { might: 2 }, "foe").build();
    expect((await yi(10, 2)).p1.can("playChampion")).toBe(true);
    expect((await yi(9, 2)).p1.can("playChampion")).toBe(false);
    expect((await yi(10, 1)).p1.can("playChampion")).toBe(false);
    expect((await yi(10, 2, 2)).p1.can("playChampion")).toBe(false); // below Level 3 the full 12 + 3 applies

    const game = await yi(10, 2);
    await game.p1.playChampion("base");
    await game.settle();
    expect(game.zoneOf("yi")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("calm")).toBe(0); // the two remaining pips were charged — 10 + [calm][calm] exactly
    expect(game.state("yi")).toMatchObject({ isExhausted: true, might: 12 });
  });

  test("(e) same public zone, opposite answers: side by side, Yi's CZ passive changes what P1 can do (his own play becomes affordable) while Renata's CZ passive changes nothing (the Recruit still enters exhausted)", async () => {
    const game = await scenario()
      .xp(P1, 3)
      .resources(P1, { energy: 11, power: { calm: 2 } })
      .legend(P1, HERALD, "herald")
      .champion(P1, RENATA, "renata")
      .champion(P2, MASTER_YI, "yi") // P2's chosen champion, P2 at 3 XP too
      .xp(P2, 3)
      .resources(P2, { energy: 10, power: { calm: 2 } })
      .unit(P2, "base", { might: 2 }, "foe")
      .build();
    // Renata: public, inactive — nothing P1 does is affected.
    const recruit = await makeRecruit(game);
    expect(game.state(recruit).isExhausted).toBe(true);
    // Yi: public, and his SELF-cost passive is live from the CZ — on P2's turn the discounted play is offered.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 10, power: { calm: 2 } });
    expect(game.p2.resources()).toMatchObject({ energy: 10, power: { calm: 2 } });
    expect(game.p2.can("playChampion")).toBe(true);
    await game.p2.playChampion("base");
    await game.settle();
    expect(game.zoneOf("yi")).toBe("base");
    expect(game.p2.resources().energy).toBe(0);
  });
});
