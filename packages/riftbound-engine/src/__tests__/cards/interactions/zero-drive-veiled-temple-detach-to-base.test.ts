/**
 * Interaction: The Zero Drive (sfd-090-221) × Veiled Temple (sfd-221-221) × Pack of Wonders (ogn-181-298)
 *
 *   The Zero Drive — Gear (Equipment) · Mind · 3 · +2 Might
 *     "[Equip] [1][mind]. [3][mind], Banish this: Play all units banished with this, ignoring their costs.
 *      (Use only if unattached.)"   Effect Text: "[Deathknell] — Banish me."
 *   Veiled Temple — Battlefield
 *     "When you conquer here, you may ready a friendly gear. If it's an Equipment, you may detach it."
 *   Pack of Wonders — Gear · Chaos · 2
 *     "[Exhaust]: Return another friendly gear, unit, or facedown card to its owner's hand."
 *   (+ Deathgrip sfd-163-221 to make the history — U dies wearing the Drive; Charm ogn-043-298 "Move an
 *    enemy unit." so that V can conquer on P2's turn; Discipline ogn-058-298 as P2's chain opener.)
 *
 * Rules: 380 (activated abilities are activated from the Board), 381 / 151.2 (only on the controller's
 * turn, in an Open State, outside Showdowns), 377.2.b ("Use only if unattached" is an activation
 * condition), 435.1.c (an attached Equipment's Rules Text is inactive; active again once detached),
 * 435.4 / 435.4.a + 457.1 (a detached gear is at the wearer's location and, loose at a battlefield, is
 * Recalled to base during the NEXT Cleanup — which follows the trigger's resolution before any Open
 * State exists), 404.1 / 402.3 (costs — [3][mind] AND "Banish this" — are paid at activation, before
 * anybody else gets priority), 427.3 / 397 ("banished with this"), 124 (a card that goes Board → hand →
 * Board is a NEW object: its "banished with this" memory is gone).
 *
 * History (played out in `history()`): P1's U (2) wearing the Drive is Deathgripped → U dies, the
 * Drive-granted Deathknell banishes U "with" the Drive, the Drive drops into P1's base; P1 re-Equips it
 * to V (3 → 5). Then V attacks Veiled Temple (held by P2's 1-Might Holder) and conquers it.
 *   (a) While the Drive is ATTACHED (base, showdown Focus windows, Closed chain windows): no Drive
 *       ability for either seat.
 *   (b) Conquer trigger: ready the Drive, detach it. At the detach prompt the Drive is still at the
 *       Temple; the recall happens in the Cleanup right after the trigger resolves, so the first time
 *       any Drive ability is enumerated the Drive is already in P1's base.
 *   (c) Neutral Open afterwards: BOTH [Equip] and "[3][mind], Banish this" listed for P1, nothing for
 *       P2. Activating: [3][mind] paid and the Drive banished as COSTS before P2's window; P2 may only
 *       React; on resolution U is played free (enters exhausted).
 *   (d) Instead: Pack of Wonders bounces the Drive to hand → no activated ability listed from hand
 *       (only "play it for 3"); replayed, it is a new object — U is stranded in banishment.
 *   (e) Instead: V conquers on P2's turn (Charmed into the Temple) → after detach + recall the Banish
 *       ability is NOT listed for P1 in any window of P2's turn; it appears on P1's next turn.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZERO_DRIVE = "sfd-090-221";
const VEILED_TEMPLE = "sfd-221-221";
const PACK_OF_WONDERS = "ogn-181-298";
const DEATHGRIP = "sfd-163-221";
const CHARM = "ogn-043-298";
const DISCIPLINE = "ogn-058-298";

const U_DEF = { cardType: "unit", energyCost: 2, might: 2, name: "Unit U" } as const;
const V_DEF = { cardType: "unit", energyCost: 3, might: 3, name: "Unit V" } as const;

/** Index of the Drive's "[3][mind], Banish this" ability (0 = the [Equip] keyword line). */
const BANISH_ABILITY = 1;

/**
 * P1's turn 2. P1: U (2) wearing the Drive (→ 4), V (3), W (1, Deathgrip's pump recipient so V's Might
 * stays clean), a READY Pack of Wonders, Deathgrip in hand; energy 6 + [mind][mind] = Deathgrip 2 +
 * Equip [1][mind] + Banish [3][mind] exactly. Veiled Temple = bf1 (live text), held by P2's 1-Might
 * Holder; bf2 is P1's (a unit there keeps it) so Charm has two destinations and P2 has somewhere to
 * attack in (e). P2: a 4-Might Bystander in base, Charm + Discipline in hand.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 2 } })
    .battlefield("bf1", { controller: P2, def: VEILED_TEMPLE, inert: false, owner: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 1, name: "Holder" }, "holder")
    .unit(P1, "bf2", { might: 2, name: "P1 Keeper" }, "keeper")
    .unit(P1, "base", U_DEF, "u", { equippedWith: ["zd"] })
    .card("zd", { def: ZERO_DRIVE, meta: { attachedTo: "u" }, owner: P1, zone: "base" })
    .unit(P1, "base", V_DEF, "v")
    .unit(P1, "base", { might: 1, name: "Unit W" }, "w")
    .gear(P1, PACK_OF_WONDERS, "pack")
    .unit(P2, "base", { might: 4, name: "Bystander" }, "foe")
    .hand(P1, DEATHGRIP, "dg")
    .hand(P2, CHARM, "charm")
    .hand(P2, DISCIPLINE, "disc");
}

/** The history: U dies wearing the Drive (→ banished "with" it), the Drive drops to base, P1 re-Equips it to V. */
async function history(game: Game): Promise<void> {
  expect(game.state("u")).toMatchObject({ attachments: ["zd"], might: 4 });
  await game.p1.cast("dg", { targets: "u" });
  await game.settle();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("w"); // Deathgrip's "+Might to another friendly unit" → W, not V
    await game.settle();
  }
  expect(game.zoneOf("u")).toBe("banishment");
  expect(game.state("zd")).toMatchObject({ attachedTo: undefined, zone: "base" });
  await game.p1.choose("equipCard:-", { params: { equipmentId: "zd", unitId: "v" } });
  await game.settle();
  expect(game.state("v")).toMatchObject({ attachments: ["zd"], might: 5, zone: "base" });
  expect(game.p1.resources()).toEqual({ energy: 3, power: { mind: 1 } });
}

/** Pass focus/priority (recording whether P1 could activate the Drive at each window) until a non-action prompt or the open main phase. */
async function passWindows(game: Game, seen: { seat: string; context: string; driveListed: boolean }[] = []): Promise<typeof seen> {
  for (let i = 0; i < 24; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main") {
      break;
    }
    seen.push({ context: d.context, driveListed: game.p1.can("activate", "zd"), seat: d.seat });
    await game.seat(d.seat).pass();
  }
  return seen;
}

/** P1's turn: history, then V attacks the Temple and combat resolves (5 v 1) up to the Temple's "you may" opt-in. */
async function conquerOnP1Turn(game: Game): Promise<void> {
  await history(game);
  await game.p1.move("v", "bf1");
  await passWindows(game);
  expect(game.zoneOf("holder")).toBe("trash");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  expect(game.decision()?.source?.cardId).toBe("bf1");
}

/** Accept the Temple's opt-in, choose the Drive, pass priority until the "Detach it?" question. */
async function readyDriveToDetachPrompt(game: Game): Promise<void> {
  await game.p1.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("zd");
  for (let i = 0; i < 8 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "chain"; i++) {
    await game.acting().pass();
  }
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  expect(game.decision()?.prompt ?? "").toMatch(/detach/i);
}

/** Everything on P1's turn up to the first Neutral Open state after the detach. */
async function detachedOnP1Turn(): Promise<Game> {
  const game = await board().build();
  await conquerOnP1Turn(game);
  await readyDriveToDetachPrompt(game);
  await game.p1.yes();
  const r = await game.settle();
  expect(r.reason).toBe("open");
  return game;
}

describe("The Zero Drive × Veiled Temple × Pack of Wonders — where and when the Banish ability is listed", () => {
  // ── (a) attached: nothing listed, for anyone, anywhere ─────────────────────────────────────

  test("(a) Neutral Open, P1's turn, Drive ATTACHED to V in base with [3][mind] in the pool: neither the Banish ability nor an [Equip] of the Drive is listed for P1 (435.1.c / 377.2.b); nothing for P2", async () => {
    const game = await board().build();
    await history(game);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "zd")).toBe(false);
    // The only loose Equipment was the Drive; now that it is worn, no Equip action names it.
    const equip = game.p1.option("equipCard");
    expect(equip?.fields.find((f) => f.name === "equipmentId")?.options ?? []).not.toContain("zd");
    expect(game.p2.can("activate", "zd")).toBe(false);
    expect(game.p2.legal().some((o) => o.card === "zd")).toBe(false);
  });

  test("(a) V attacks the Temple: in P1's Focus window, P2's Focus window and every Closed window up to the conquer trigger the Drive (attached, at bf1) is never listed (381 / 151.2 on top of 435.1.c)", async () => {
    const game = await board().build();
    await history(game);
    await game.p1.move("v", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("zd")).toMatchObject({ attachedTo: "v", location: "bf1", zone: "battlefield-bf1" });
    const seen = await passWindows(game);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen.map((w) => w.seat)).toContain(P1);
    expect(seen.map((w) => w.seat)).toContain(P2);
    expect(seen.every((w) => !w.driveListed)).toBe(true);
    expect(game.p2.can("activate", "zd")).toBe(false);
    // combat: 5 v 1 → conquer, +1 point, Temple trigger pending for P1
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", controller: P1, triggered: true })]);
    expect(game.state("v")).toMatchObject({ attachments: ["zd"], might: 5, zone: "battlefield-bf1" });
  });

  // ── (b) detach → recall before any Open State ──────────────────────────────────────────────

  test("(b) the Temple's pick offers P1's friendly gear — the ATTACHED Drive and the Pack; in the Closed windows while the trigger waits the Drive is still worn at bf1 and not listed", async () => {
    const game = await board().build();
    await conquerOnP1Turn(game);
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["pack", "zd"]);
    await game.p1.pick("zd");
    const seen = await passWindows(game);
    expect(seen.every((w) => w.context === "chain" && !w.driveListed)).toBe(true);
    expect(game.decision()?.prompt ?? "").toMatch(/detach/i);
    // At the instant of the detach question the Drive is (still) attached, at V's location — the Temple (435.4).
    expect(game.state("zd")).toMatchObject({ attachedTo: "v", location: "bf1", zone: "battlefield-bf1" });
    expect(game.p1.can("activate", "zd")).toBe(false);
  });

  test("(b) 'yes, detach': V drops 5 → 3 at once; the loose Drive is Recalled to P1's base by the Cleanup that follows the trigger (435.4.a / 457.1) — by the first decision of any kind after the detach it is already in base, unattached, ready", async () => {
    const game = await board().build();
    await conquerOnP1Turn(game);
    await readyDriveToDetachPrompt(game);
    await game.p1.yes();
    // Whatever the very next decision is, the Drive must not be sitting loose at the Temple any more.
    expect(game.state("zd")).toMatchObject({ attachedTo: undefined, isReady: true, location: "base", zone: "base" });
    expect(game.state("v")).toMatchObject({ attachments: [], isExhausted: true, might: 3, zone: "battlefield-bf1" });
    expect(game.cardsAt("battlefield-bf1").sort()).toEqual(["v"]);
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("(b) there is NO window in which the Banish ability is offered while the Drive is physically at the Temple: the first time it is enumerated for P1, the Drive's location is already 'base'", async () => {
    const game = await board().build();
    await conquerOnP1Turn(game);
    await readyDriveToDetachPrompt(game);
    await game.p1.yes();
    let firstListedAt: string | undefined;
    for (let i = 0; i < 12; i++) {
      if (game.p1.can("activate", "zd")) {
        firstListedAt = game.state("zd").location;
        break;
      }
      const d = game.decision();
      if (!d || d.kind !== "action" || d.context === "main") {
        break;
      }
      expect(game.state("zd").location).not.toBe("bf1"); // never loose at the Temple during a priority window
      await game.seat(d.seat).pass();
    }
    expect(firstListedAt).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (c) Neutral Open on P1's turn: both abilities listed; activation pays + banishes as costs ─

  test("(c) first Neutral Open after the cleanup: P1's menu lists BOTH the Drive's [Equip] (equipmentId = zd → v | w | keeper) and its '[3][mind], Banish this' (380 / 381 / 151.2); P2's menu has nothing of the Drive", async () => {
    const game = await detachedOnP1Turn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { mind: 1 } });
    expect(game.p1.can("activate", "zd")).toBe(true);
    expect(game.p1.option("activate", "zd")?.key).toBe(`activateAbility:zd#${BANISH_ABILITY}`);
    const equip = game.p1.option("equipCard");
    expect(equip).toBeDefined();
    expect(equip?.fields.find((f) => f.name === "equipmentId")?.options).toEqual(["zd"]);
    expect([...((equip?.fields.find((f) => f.name === "unitId")?.options as string[]) ?? [])].sort()).toEqual(["keeper", "v", "w"]);
    expect(game.state("zd").keywords).toContain("Equip");
    expect(game.p2.legal()).toEqual([]); // not P2's decision at all
    expect(game.p2.can("activate", "zd")).toBe(false);
  });

  test("(c) activating the Banish ability: [3][mind] is paid AND the Drive is in BANISHMENT the moment the ability hits the chain — both are costs (404.1) settled before P2 ever holds priority; U is not played yet", async () => {
    const game = await detachedOnP1Turn();
    await game.p1.activate("zd", BANISH_ABILITY);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("zd")).toBe("banishment");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "zd", controller: P1, triggered: false })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // controller first (337.4)
    expect(game.zoneOf("u")).toBe("banishment");
    expect(game.p1.gear()).toEqual(["pack"]);
  });

  test("(c) P2's window on the Drive's ability is a Closed State: P2 may pass or play its Reaction (Discipline) — no Action-speed play, no move; the Drive is already gone from the board so there is nothing of it to interact with", async () => {
    const game = await detachedOnP1Turn();
    await game.p2.do("addResources", { energy: 2 });
    await game.p1.activate("zd", BANISH_ABILITY);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    const keys = game.p2.legal().map((o) => o.key);
    expect(keys).toContain("passChainPriority:-");
    expect(keys).toContain("playSpell:disc"); // Reaction — fine
    expect(game.p2.legal().some((o) => o.verb === "move" || o.verb === "play" || o.verb === "endTurn")).toBe(false);
    expect(game.zoneOf("zd")).toBe("banishment");
  });

  test("(c) resolution: U — the unit banished WITH THIS Drive — is played ignoring its cost: P1 (who now holds bf1) picks base; U enters exhausted at its printed 2 Might, 0 energy charged; the Drive stays in banishment", async () => {
    const game = await detachedOnP1Turn();
    await game.p1.activate("zd", BANISH_ABILITY);
    const r = await game.settle();
    if (r.reason === "unanswered") {
      // P1 controls the Temple now, so the free play asks base-or-bf1 (a play, 419.3): choose base.
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick("base");
      await game.settle();
    }
    expect(game.zoneOf("u")).toBe("base");
    expect(game.state("u")).toMatchObject({ attachments: [], controller: P1, isExhausted: true, might: 2 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // U's 2 never charged
    expect(game.zoneOf("zd")).toBe("banishment");
    expect(game.p1.banishment()).toEqual(["zd"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (d) bounced to hand by Pack of Wonders ─────────────────────────────────────────────────

  test("(d) Pack of Wonders [Exhaust] offers the loose Drive ('another friendly gear'); it resolves returning the Drive to P1's HAND; Pack exhausted", async () => {
    const game = await detachedOnP1Turn();
    const offered = (game.p1.option("activate", "pack")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("zd");
    expect(offered).not.toContain("pack"); // "another"
    await game.p1.activate("pack", 0, { targets: "zd" });
    expect(game.state("pack").isExhausted).toBe(true);
    await game.settle();
    expect(game.zoneOf("zd")).toBe("hand");
    expect(game.p1.hand()).toContain("zd");
    expect(game.p1.gear()).toEqual(["pack"]);
  });

  test("(d) with the Drive in HAND and [3][mind] still in the pool, NO activated ability of it is listed (380 — not on the Board); the only legal action involving it is PLAYING it as a gear for 3", async () => {
    const game = await detachedOnP1Turn();
    await game.p1.activate("pack", 0, { targets: "zd" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 3, power: { mind: 1 } }); // affordable — that is not the issue
    expect(game.p1.can("activate", "zd")).toBe(false);
    expect(game.p1.legal().filter((o) => o.card === "zd").map((o) => o.moveId)).toEqual(["playGear"]);
    expect(game.p1.can("play", "zd")).toBe(true);
    const equip = game.p1.option("equipCard");
    expect(equip?.fields.find((f) => f.name === "equipmentId")?.options ?? []).not.toContain("zd");
    await expect(game.p1.activate("zd", BANISH_ABILITY)).rejects.toThrow();
    expect(game.zoneOf("u")).toBe("banishment");
  });

  test("(d) replaying the Drive from hand costs its printed 3 (energy 3 → 0) and puts it back in base unattached; with fresh [3][mind] the Banish ability is listed again", async () => {
    const game = await detachedOnP1Turn();
    await game.p1.activate("pack", 0, { targets: "zd" });
    await game.settle();
    await game.p1.play("zd");
    await game.settle();
    expect(game.state("zd")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } });
    expect(game.p1.can("activate", "zd")).toBe(false); // can't afford [3][mind] right now
    await game.p1.do("addResources", { energy: 3 });
    expect(game.p1.can("activate", "zd")).toBe(true);
  });

  // Expected: the replayed Drive is a NEW object (rule 124 — Board → hand → Board); "banished with this"
  // (427.3 / 397) refers to what THIS object's linked Deathknell banished, which is nothing — so the
  // activation banishes the Drive, resolves, and plays nobody: U stays in banishment.
  test("(d) the replayed Drive is a new object (124) — activating it plays NOTHING; U is stranded in banishment (427.3)", async () => {
    const game = await detachedOnP1Turn();
    await game.p1.activate("pack", 0, { targets: "zd" });
    await game.settle();
    await game.p1.play("zd");
    await game.settle();
    await game.p1.do("addResources", { energy: 3 });
    await game.p1.activate("zd", BANISH_ABILITY);
    expect(game.zoneOf("zd")).toBe("banishment");
    const r = await game.settle();
    if (r.reason === "unanswered" && game.decision()?.kind === "pick") {
      await game.p1.pick("base"); // (only reached while the bug stands — a destination for U)
      await game.settle();
    }
    expect(game.zoneOf("u")).toBe("banishment");
    expect(game.p1.banishment().sort()).toEqual(["u", "zd"]);
    expect(game.p1.units("base").sort()).toEqual(["w"]);
  });

  // ── (e) the conquer happens on P2's turn ───────────────────────────────────────────────────

  /**
   * Same history on P1's turn, but P1 then ends the turn with V (wearing the Drive) still in base. On
   * P2's turn P2 Charms V into the Temple → combat on P2's turn, V (5) kills the Holder (1) → P1 conquers
   * → the Temple's trigger is P1's → ready + detach the Drive → recalled to P1's base. Pools refilled by
   * hand after the turn change (P1 gets its [3][mind] back so affordability is never the reason).
   */
  async function conquerOnP2Turn(): Promise<{ game: Game; windows: { seat: string; context: string; driveListed: boolean }[] }> {
    const game = await board().build();
    await history(game);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p1.do("addResources", { energy: 3, power: { mind: 1 } });
    await game.p2.do("addResources", { energy: 5, power: { calm: 1 } });
    expect(game.state("v")).toMatchObject({ attachments: ["zd"], might: 5, zone: "base" });
    await game.p2.cast("charm", { targets: "v" });
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("bf1");
    }
    const windows = await passWindows(game); // Charm resolves → V at the Temple → showdown → combat
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.decision()?.source?.cardId).toBe("bf1");
    await game.p1.yes();
    await game.p1.pick("zd");
    await passWindows(game, windows);
    expect(game.decision()?.prompt ?? "").toMatch(/detach/i);
    await game.p1.yes();
    return { game, windows };
  }

  test("(e) V Charmed into the Temple on P2's turn conquers it for P1 (+1 point on the opponent's turn); through every P1/P2 window on the way (Charm's chain, both Focus windows, the Temple trigger's chain) the attached Drive is never listed", async () => {
    const { game, windows } = await conquerOnP2Turn();
    expect(game.p1.points()).toBe(1);
    expect(windows.some((w) => w.seat === P1 && w.context === "showdown")).toBe(true); // P1 did get Focus
    expect(windows.some((w) => w.seat === P1 && w.context === "chain")).toBe(true); // and Closed-state priority
    expect(windows.every((w) => !w.driveListed)).toBe(true);
  });

  test("(e) after detach + recall on P2's turn the Drive is loose and ready in P1's base, V is 3 at the Temple — and the game is back in P2's Main Phase with nothing offered to P1", async () => {
    const { game } = await conquerOnP2Turn();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.state("zd")).toMatchObject({ attachedTo: undefined, isReady: true, location: "base", zone: "base" });
    expect(game.state("v")).toMatchObject({ attachments: [], might: 3, zone: "battlefield-bf1" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { mind: 1 } });
    expect(game.p1.legal()).toEqual([]);
    expect(game.p1.can("activate", "zd")).toBe(false);
    expect(game.p2.can("activate", "zd")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("(e) P1's Closed-state priority on P2's turn (P2 casts Discipline) does NOT list the Drive's Banish ability even with [3][mind] in P1's pool — plain activated abilities are controller's-turn + Open State only (381)", async () => {
    const { game } = await conquerOnP2Turn();
    await game.settle();
    await game.p2.cast("disc", { targets: "foe" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { mind: 1 } });
    expect(game.p1.can("activate", "zd")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "zd")).toBe(false);
    await expect(game.p1.activate("zd", BANISH_ABILITY)).rejects.toThrow();
    await game.settle();
    expect(game.zoneOf("zd")).toBe("base");
  });

  test("(e) P1's Focus window on P2's turn (P2's Bystander attacks bf2) does not list it either; it finally appears at P1's next Main Phase (Drive still in base, U still waiting in banishment)", async () => {
    const { game } = await conquerOnP2Turn();
    await game.settle();
    await game.p2.move("foe", "bf2");
    const windows = await passWindows(game);
    expect(windows.some((w) => w.seat === P1 && w.context === "showdown")).toBe(true);
    expect(windows.every((w) => !w.driveListed)).toBe(true);
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 3, power: { mind: 1 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("zd")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.zoneOf("u")).toBe("banishment");
    expect(game.p1.can("activate", "zd")).toBe(true);
    expect(game.p1.option("activate", "zd")?.key).toBe(`activateAbility:zd#${BANISH_ABILITY}`);
  });
});
