/**
 * Interaction: Long Sword (sfd-022-221) · Gear — Equipment · Fury · 2+[fury] · +2 Might
 *     "[Quick-Draw] (This has [Reaction]. When you play it, attach it to a unit you control.) [Equip] [fury]"
 *   × Hextech Ray (ogn-009-298) · Spell · Fury · 1+[fury] · [Action] "Deal 3 to a unit at a battlefield."
 *
 * Question (P2's turn; P1's 3-Might X holds bf1; P1 has Long Sword in hand and exactly 2+[fury]):
 *   P2 plays Hextech Ray on X and passes. P1 responds by playing Long Sword via Quick-Draw.
 *   (a) Does the GEAR itself sit on the chain / give P2 a response window?
 *   (b) Does the Quick-Draw "When you play this, attach it…" effect give P2 a window, and when is the
 *       unit chosen?
 *   (c) Chain listing + priority holder at each window; does X survive?
 *   (d) Contrast: P1 does nothing → X dies.
 *
 * Rules: 819.1/819.1.b/819.1.d (Quick-Draw = [Reaction] on the card + the TRIGGERED ability "When you
 * play this, attach it to a unit you control"); 337.2 + 359.2/359.2.d (a finalized Gear resolves at once —
 * enters the base Ready — and never waits on the chain); 383.4.a.2 (its Play Effect is then appended as a
 * Pending item); 340.3 → 337.1 + 355.5 (P1 finalizes that trigger immediately, choosing X NOW, before
 * anyone gets priority); 337.4 (then P1 — controller of the newest item — has priority; after P1 passes,
 * P2 may respond to the attach trigger); 340.1/716 (trigger resolves → attached, +2); 340.4 (priority to
 * P2, controller of the remaining Hextech Ray); 142.4 (3 damage on a 5-Might X is not lethal).
 *
 * Expected: (a) no — the gear is never a chain item; (b) yes — listing [1 Hextech Ray (P2→X), 2 Long
 * Sword attach trigger (P1→X)], target already locked, priority P1 → P2; (c) trigger resolves (X = 5),
 * priority P2 with [Hextech Ray] left; both pass → 3 to a 5-Might X → survives; (d) X dies.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LONG_SWORD = "sfd-022-221";
const HEXTECH_RAY = "ogn-009-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P2's turn. P1: 3-Might X alone at bf1 (P1-controlled), Long Sword in hand, exactly 2 energy + 1 fury. P2: Hextech Ray, 1 energy + 1 fury. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "X" }, "x")
    .hand(P1, LONG_SWORD, "sword")
    .hand(P2, HEXTECH_RAY, "ray");
}

/** P2 cast Hextech Ray on X and passed priority → P1 holds priority with the Ray on the chain. */
async function rayPending(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("ray", { targets: "x" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P2, targets: ["x"], triggered: false })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

/** …and P1 answered by playing Long Sword (Quick-Draw), naming X if/when asked. */
async function swordPlayed(): Promise<Game> {
  const game = await rayPending();
  await game.p1.play("sword", { answers: ["x"] });
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("x");
  }
  return game;
}

describe("(a) the Gear itself: finalized → resolves immediately, never a chain item", () => {
  test("P1's window opens only once P2 passes priority; then Long Sword (Reaction via Quick-Draw, 819.1.b) is offered in the Closed state and costs exactly 2 energy + 1 fury", async () => {
    const game = await board().build();
    await game.p2.cast("ray", { targets: "x" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.can("play", "sword")).toBe(false); // P2 still holds priority
    await game.p2.passPriority();
    expect(game.p1.can("play", "sword")).toBe(true);
    await game.p1.play("sword", { answers: ["x"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("sword")).not.toBe("hand");
  });

  test("after the play the sword is a game object on the board — not in the 'chain' zone — and the chain listing never contains a played (non-triggered) Long Sword item; Hextech Ray is still waiting (337.2, 359.2.d)", async () => {
    const game = await swordPlayed();
    expect(game.zoneOf("sword")).not.toBe("chain");
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf("sword"));
    expect(game.chain().some((i) => i.cardId === "sword" && !i.triggered)).toBe(false);
    expect(game.chain().map((i) => i.cardId)).toContain("ray");
    expect(game.state("sword").isReady).toBe(true); // 359.2.d — enters Ready
    // We are straight back at a priority window (P1 keeps it — 337.1.a / 337.4), not at a "pay/finalize the gear" step.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });
});

describe("(b) the Quick-Draw attach is a TRIGGERED ability: target chosen at once, but it lingers on the chain and P2 may respond to it", () => {
  // Expected (819.1.d, 383.4.a.2, 337.1/355.5, 337.4): right after the play the listing is
  // [Hextech Ray (P2→X), Long Sword attach trigger (P1→X, triggered)], the sword is in base UNATTACHED,
  // X is still 3, and P1 holds priority; P1 passes → P2 holds priority with that trigger still pending.
  // Actual: the engine attaches the sword the instant it is played (X = 5 immediately), no trigger item
  // ever appears, so P2 gets no window against the attach.
  test.failing("BUG: the attach trigger should be chain item #2 above Hextech Ray (P1's, triggered, target X locked), sword not yet attached, priority P1 → then P2 (383.4.a.2, 337.4)", async () => {
    const game = await swordPlayed();
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "ray", controller: P2, triggered: false }),
      expect.objectContaining({ cardId: "sword", controller: P1, targets: ["x"], triggered: true }),
    ]);
    expect(game.state("sword")).toMatchObject({ attachedTo: undefined, isReady: true, zone: "base" });
    expect(game.state("x").might).toBe(3);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    // P2's response window against the ATTACH (not against the gear):
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()).toHaveLength(2);
    expect(game.state("sword").attachedTo).toBeUndefined();
  });

  test("the unit is chosen NOW, at finalization — only units P1 controls are eligible, and by the time anyone holds priority again the choice (X) is already locked in (355.5)", async () => {
    const game = await rayPending();
    await game.p1.play("sword", { answers: ["x"] });
    if (game.decision()?.kind === "pick") {
      const d = game.decision();
      expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["x"]);
      await game.p1.pick("x");
    }
    // Back at a priority window: no target question is outstanding any more.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    // and whatever the engine did with the trigger, X is (or will be) the bearer — never an enemy / nobody.
    await game.settle();
    expect(game.state("sword").attachedTo).toBe("x");
  });
});

describe("(c) walking the chain: trigger resolves first (X = 5), then priority to P2 over [Hextech Ray], then the Ray hits a 5-Might X", () => {
  // Expected (340.1 → 340.4): P1 pass, P2 pass → the attach trigger resolves (sword on X, X = 5) and,
  // the chain not being empty, priority goes to P2 (controller of the newest remaining item, Hextech Ray)
  // with listing [Hextech Ray]. Actual: there is no trigger item, so after those two passes the Ray
  // itself has already resolved and the chain is empty.
  test.failing("BUG: after P1 pass + P2 pass the listing should be [Hextech Ray] with priority on P2 and X freshly at 5 Might, undamaged (340.4)", async () => {
    const game = await swordPlayed();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("sword").attachedTo).toBe("x");
    expect(game.state("x")).toMatchObject({ damage: 0, might: 5 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P2 })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("x")).toMatchObject({ damage: 3, might: 5, zone: "battlefield-bf1" });
  });

  test("outcome once everyone passes: Long Sword is attached to X (+2 → 5), Hextech Ray deals 3 to a 5-Might X → X survives at bf1 with 3 damage; Ray in trash; chain empty; P2 (turn player) is back in an Open main phase; bf1 still P1's", async () => {
    const game = await swordPlayed();
    await game.settle();
    expect(game.state("sword")).toMatchObject({ attachedTo: "x", zone: "battlefield-bf1" });
    expect(game.state("x")).toMatchObject({ attachments: ["sword"], damage: 3, might: 5, zone: "battlefield-bf1" });
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) contrast: no response", () => {
  test("if P1 simply passes, Hextech Ray deals 3 to the 3-Might X → lethal → X is in the trash after the Cleanup; the sword never left P1's hand and P1's 2+[fury] are unspent; P1 loses the emptied bf1", async () => {
    const game = await rayPending();
    await game.p1.passPriority();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.zoneOf("sword")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } });
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });
});
