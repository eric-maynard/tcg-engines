/**
 * Interaction: Dancing Grenade (unl-020-219) · Spell · Fury · 2+[fury]
 *     "Deal 2 to a unit. Its controller may play this spell again for [rainbow]. If they do, this deals 1 additional
 *      Bonus Damage for each time this spell has dealt damage this turn."
 *   × Counter Strike (sfd-194-221) · Spell · Calm/Body · 2+[rainbow] · [Reaction]
 *     "Choose a unit. The next time that unit would be dealt damage this turn, prevent it. Draw 1."
 *   × Annie, Fiery (ogs-001-024) · Champion Unit · Fury · 4 Might
 *     "Your spells and abilities deal 1 Bonus Damage."
 *
 * Rules: 417.6.a (a spell with no named source IS the source), 417.6.b.4 (the source's controller is responsible
 * for the Deal — whoever PLAYS the replay controls that cast), 713/714 (Bonus Damage instances are summed once),
 * 715.4.a (prevention absorbs the bonus-inclusive total), 437.4 + 417.1.e.1 (fully prevented damage was never
 * dealt), 356.1.a ("play … for [rainbow]" replaces the base cost).
 *
 * Question / expected — P1 controls Annie, Fiery (4 Might) and casts Dancing Grenade on P2's X:
 *   (a) X takes 2+1 (Annie) = 3. P2 (X's controller) may replay it for [rainbow] onto Annie: P2 now controls the
 *       cast ⇒ no Annie bonus, but +1 grenade bonus (dealt damage once) ⇒ Annie takes 3, survives (4 Might). Then P1
 *       (Annie's controller) may replay: +2 grenade (two dealing events) +1 Annie = 5.
 *   (b) P2 answers the FIRST cast with Counter Strike on X: all 3 prevented (715.4.a) ⇒ not dealt (437.4). X was
 *       still the chosen unit ⇒ P2 may still replay for [rainbow], but with zero prior dealing events and no Annie
 *       bonus for P2 the replay onto Annie deals exactly 2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DANCING_GRENADE = "unl-020-219";
const COUNTER_STRIKE = "sfd-194-221";
const ANNIE_FIERY = "ogs-001-024";

/**
 * P1's turn. P1: Annie, Fiery in base, Dancing Grenade in hand, exactly 2 energy + [fury] for the cast plus one
 * [rainbow] for a later replay. P2: X (default 6 Might) in base, Counter Strike in hand, 2 energy + 3 rainbow
 * (Counter Strike's 2+[rainbow] AND a replay).
 */
function board(opts: { xMight?: number } = {}) {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1, rainbow: 1 } })
    .resources(P2, { energy: 2, power: { rainbow: 3 } })
    .unit(P1, "base", ANNIE_FIERY, "annie")
    .unit(P2, "base", { might: opts.xMight ?? 6, name: "X" }, "x")
    .hand(P1, DANCING_GRENADE, "grenade")
    .hand(P2, COUNTER_STRIKE, "cs");
}

/** P1 casts the grenade on X and everyone passes: it resolves and stops at the replay offer (if any). */
async function firstCast(opts: { xMight?: number } = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.cast("grenade", { targets: "x" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 1 } });
  await game.settle();
  return game;
}

/**
 * The seat holding the replay offer accepts it, aims the new cast at `target`, and everyone passes until it has
 * resolved (stops at the NEXT replay offer or the open state).
 */
async function replayOnto(game: Game, seat: "p1" | "p2", target: string): Promise<void> {
  expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: seat === "p1" ? P1 : P2 });
  await game[seat].yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: seat === "p1" ? P1 : P2 });
  await game[seat].pick(target);
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      break;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Dancing Grenade × Annie, Fiery × Counter Strike — whose bonus, whose damage, what counts as 'dealt'", () => {
  // ── (a) baseline ping-pong ─────────────────────────────────────────────────────────────────────

  test("(a) first cast by P1: the spell is the source, P1's Annie adds +1 ⇒ X takes 3 and lives (6 Might)", async () => {
    const game = await firstCast();
    expect(game.state("x")).toMatchObject({ damage: 3, zone: "base" });
    expect(game.chain()).toEqual([]);
  });

  test("(a) after it resolves, X's CONTROLLER (P2) — not P1 — is offered 'play this spell again for [rainbow]', and can afford it", async () => {
    const game = await firstCast();
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
    expect(game.actingSeat()).toBe(P2);
  });

  test("(a) P2 accepts: pays exactly one [rainbow] (356.1.a — base 2+[fury] replaced, energy untouched), the grenade goes back on the chain CONTROLLED BY P2, and P2 chooses its target (Annie offered)", async () => {
    const game = await firstCast();
    await game.p2.yes();
    expect(game.p2.resources()).toEqual({ energy: 2, power: { rainbow: 2 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "grenade", controller: P2, triggered: false })]);
    expect(game.zoneOf("grenade")).toBe("chain");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toContain("annie");
  });

  test("(a) P2's replay onto Annie deals 2 + 1 (grenade: has dealt damage once) = 3 — P1's Annie ('YOUR spells') does NOT add to a cast P2 controls (417.6.b.4); Annie survives with 3 marked on 4 Might", async () => {
    const game = await firstCast();
    await replayOnto(game, "p2", "annie");
    expect(game.state("annie")).toMatchObject({ damage: 3, might: 4, zone: "base" });
    expect(game.chain()).toEqual([]);
  });

  test("(a) control for the attribution: WITHOUT Annie the same two casts deal 2 then 3 — so the +1 on P2's replay is the grenade's own bonus, not Annie's", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1, rainbow: 1 } })
      .resources(P2, { energy: 2, power: { rainbow: 3 } })
      .unit(P1, "base", { might: 9, name: "B" }, "b")
      .unit(P2, "base", { might: 9, name: "X" }, "x")
      .hand(P1, DANCING_GRENADE, "grenade")
      .build();
    await game.p1.cast("grenade", { targets: "x" });
    await game.settle();
    expect(game.state("x").damage).toBe(2);
    await replayOnto(game, "p2", "b");
    expect(game.state("b").damage).toBe(3);
  });

  test("(a) then Annie's controller P1 gets the replay option; P1's third cast carries +2 (grenade, two dealing events) +1 (Annie) = 5 (714: summed once) — measured on a 12-Might X: 3 + 5 = 8", async () => {
    const game = await firstCast({ xMight: 12 });
    await replayOnto(game, "p2", "annie");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await replayOnto(game, "p1", "x");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 0 } });
    expect(game.state("x")).toMatchObject({ damage: 8, zone: "base" });
    // …and the dance continues: X's controller P2 is asked again.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
  });

  test("(a) on the printed 6-Might X that third cast (5) is lethal: X → trash; declining the next offer ends it with the grenade in its OWNER P1's trash", async () => {
    const game = await firstCast();
    await replayOnto(game, "p2", "annie");
    await replayOnto(game, "p1", "x");
    expect(game.zoneOf("x")).toBe("trash");
    if (game.decision()?.kind === "yes-no") {
      await game.acting().no();
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("grenade")).toBe("trash");
    expect(game.state("grenade").owner).toBe(P1);
    expect(game.p1.trash()).toContain("grenade");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(a) P2 may simply decline the replay: nothing more happens, grenade → P1's trash, P2 keeps all 3 rainbow", async () => {
    const game = await firstCast();
    await game.p2.no();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("grenade")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 2, power: { rainbow: 3 } });
    expect(game.state("annie").damage).toBe(0);
  });

  // ── (b) Counter Strike on the first cast ───────────────────────────────────────────────────────

  /** P1 casts on X; P2 responds with Counter Strike on X; everything resolves. */
  async function counterStruck(): Promise<Game> {
    const game = await board().build();
    await game.p1.cast("grenade", { targets: "x" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "cs")).toBe(true);
    await game.p2.cast("cs", { targets: "x" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 2 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["grenade", "cs"]);
    await game.settle();
    return game;
  }

  test("(b) Counter Strike resolves first and prevents the WHOLE bonus-inclusive 3 (715.4.a): X takes 0; P2 drew 1; both spells in trash", async () => {
    const game = await counterStruck();
    expect(game.state("x")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.p2.hand()).toHaveLength(1); // Counter Strike's "Draw 1"
    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.chain()).toEqual([]);
  });

  test("(b) X was still the chosen unit, so its controller P2 must still be OFFERED the replay for [rainbow] even though the damage was fully prevented — the engine skips the offer", async () => {
    // Expected: after the prevented hit the grenade's "Its controller may play this spell again" is asked of P2
    // (the instruction keys off the chosen unit's controller, not off damage having been dealt).
    // Actual: the engine drops straight back to P1's open main phase with the grenade in the trash.
    const game = await counterStruck();
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
  });

  test("(b) P2 replays the prevented grenade onto Annie for exactly 2 — zero prior dealing events (437.4 / 417.1.e.1 ⇒ no grenade bonus) and no Annie bonus for P2; Annie survives with 2 marked", async () => {
    // Expected: replay offered → P2 pays 1 rainbow → Annie takes 2. Actual: no offer is raised (see above), so
    // the replay cannot be taken at all.
    const game = await counterStruck();
    await replayOnto(game, "p2", "annie");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.state("annie")).toMatchObject({ damage: 2, might: 4, zone: "base" });
  });

  test("(b) either way P1 is never the one asked after the prevented first cast (X is P2's), P1's payment is gone and X is untouched", async () => {
    const game = await counterStruck();
    const d = game.decision();
    expect(d?.kind === "yes-no" ? d.seat : P2).toBe(P2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 1 } });
    expect(game.state("x").damage).toBe(0);
    expect(game.state("annie").damage).toBe(0);
  });
});
