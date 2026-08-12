/**
 * Interaction: Tideturner (ogn-199-298) flipped from Hidden in the middle of a combat showdown,
 * swapping an exhausted Sunlit Guardian (ogn-054-298) from base into the fight against a
 * Vanguard Sergeant (ogn-219-298).
 *
 *   Tideturner — Unit · Chaos · 2 · 2 Might
 *     "[Hidden] When you play me, you may choose a unit you control at another location. Move me
 *      to its location and it to my original location."
 *   Sunlit Guardian — Unit · Calm · 3 · 3 Might · "[Shield] (+1 Might while I'm a defender.) [Tank]"
 *   Vanguard Sergeant — Unit · Order · 4 · 4 Might (vanilla)
 *   Shipyard Skulker (ogn-175-298) — vanilla 3-Might defender already at bf1.
 *
 * Position: P1 controls bf1 with a Skulker; Tideturner has been facedown at bf1 since a previous
 * turn; Sunlit Guardian sits EXHAUSTED in P1's base. P2's turn: Vanguard Sergeant Standard-Moves
 * into bf1 → combat showdown, P2 (Attacker, Focus) passes.
 *
 * Rulings under test:
 *  (a) A Hidden card gains [Reaction] while facedown (811.1.b/811.6), overriding the default ban
 *      on playing units in a Showdown (343.1.a). It must be played TO the battlefield it was hidden
 *      at (811.1.d.1), enters exhausted (359.2.c) for [0], and — bf1 already being a combat in
 *      progress (190.3.b) — gains its controller's designation, Defender, at the next Cleanup
 *      (464.2.c.3.a / 323.2.a).
 *  (b) 811.1.d.2's "targets must be here" does not apply: Tideturner's own "at another location"
 *      makes that impossible (it is the rule's named exception) → the base Guardian is a legal
 *      pick, the co-located Skulker is not. The opt-in is decided at finalization (383.3.a); the
 *      trigger is a chain item, so P2 gets priority before the swap resolves.
 *  (c) On resolution both units relocate simultaneously; both are Moves (446.1). Next Cleanup:
 *      Guardian (present, undesignated) becomes a Defender (323.2.a) → Shield live = 4 Might
 *      (814.1.c), Tank applies; Tideturner in base loses Defender (323.2.c). Exhaustion is
 *      irrelevant. When the chain closes Focus passes to P2 (347.1.b).
 *  (d) Swap accepted: 3+4 = 7 ≥ 4 → Sergeant dies; its 4 must go to the Tank first and is exactly
 *      lethal → Guardian dies, Skulker untouched, P1 keeps bf1. Swap declined: 3+2 = 5 ≥ 4 →
 *      Sergeant dies; 4 assigned lethal-first kills exactly one defender; P1 keeps bf1. No flip:
 *      4 v 3 → Skulker dies, Sergeant survives (healed in the Combat Cleanup), P2 conquers bf1.
 *  (e) NO-side: the Standard Move is unavailable during a Showdown/Combat (144.1.c), on another
 *      player's turn (144.1.a) and for an exhausted unit (144.2).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";
const SUNLIT_GUARDIAN = "ogn-054-298";
const VANGUARD_SERGEANT = "ogn-219-298";
const SKULKER = "ogn-175-298";
const VOLIBEAR_IMPOSING = "ogn-158-298"; // move probe: "When an opponent moves to a battlefield other than mine, draw 1."

function board(opts: { guardianExhausted?: boolean } = {}) {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", SKULKER, "sk")
    .facedown(P1, "bf1", TIDETURNER, "tt")
    .unit(P1, "base", SUNLIT_GUARDIAN, "sg", opts.guardianExhausted === false ? undefined : { exhausted: true })
    .unit(P2, "base", VANGUARD_SERGEANT, "vs");
}

const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

/** P2's Sergeant walks into bf1; combat showdown opens with P2 holding Focus; P2 passes → P1 has Focus. */
async function openCombatAndPassToP1(game: Game): Promise<void> {
  await game.p2.move("vs", "bf1");
  expect(game.gameState.battlefields.bf1?.contested).toBe(true);
  expect(showdown(game)?.focusPlayer).toBe(P2);
  await game.p2.pass();
  expect(showdown(game)?.focusPlayer).toBe(P1);
  expect(game.actingSeat()).toBe(P1);
}

/** Flip Tideturner, accept the swap (Guardian is the only legal partner) and let both players pass priority. */
async function flipAndSwap(game: Game): Promise<void> {
  await game.p1.reveal("tt");
  await game.p1.yes();
  const d = game.decision();
  if (d?.kind === "pick" && d.semantics === "target") {
    await game.p1.pick("sg");
  }
  await game.p1.pass();
  await game.p2.pass(); // trigger resolves
}

describe("Tideturner flipped mid-combat swaps an exhausted base Guardian into the defence", () => {
  // ---------------------------------------------------------------- (a)
  test("(a) during the combat showdown on P2's turn, P1 (Focus) is offered the flip: Hidden grants [Reaction] (811.6) despite 343.1.a; it costs [0]", async () => {
    const game = await board().build();
    await openCombatAndPassToP1(game);
    expect(game.p1.can("reveal", "tt")).toBe(true);
    expect(game.p1.legal().map((o) => o.key)).toContain("revealHidden:tt");
    const energyBefore = game.p1.energy();
    await game.p1.reveal("tt");
    expect(game.p1.energy()).toBe(energyBefore); // ignoring its cost (811.1.b)
    expect(game.state("tt").isHidden).toBe(false);
  });

  test("(a) it enters AT bf1 (811.1.d.1), exhausted (359.2.c), bf1 stays contested with the combat still open, and Tideturner is designated a Defender (464.2.c.3.a / 323.2.a)", async () => {
    const game = await board().build();
    await openCombatAndPassToP1(game);
    // No destination is asked: the only place it can go is bf1.
    expect(game.p1.option("revealHidden", "tt")?.fields.some((f) => f.arg === "to")).toBe(false);
    await game.p1.reveal("tt");
    expect(game.zoneOf("tt")).toBe("battlefield-bf1");
    expect(game.state("tt").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(showdown(game)).toBeDefined();
    expect(game.state("tt").combatRole).toBe("defender");
    expect(game.state("sk").combatRole).toBe("defender");
    expect(game.state("vs").combatRole).toBe("attacker");
  });

  // ---------------------------------------------------------------- (b)
  test("(b) the 'you may' is asked at finalization (383.3.a); on yes the ONLY legal partner is the Guardian in BASE — the co-located Skulker is not 'at another location' and 811.1.d.2's 'here' restriction is waived", async () => {
    const game = await board().build();
    await openCombatAndPassToP1(game);
    await game.p1.reveal("tt");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN", source: { cardId: "tt" } });
    await game.p1.yes();
    const d = game.decision();
    if (d?.kind === "pick" && d.semantics === "target") {
      expect(d.options.map((o) => o.card)).toEqual(["sg"]);
      await game.p1.pick("sg");
    }
    // A single legal choice is bound and public on the chain item.
    expect(game.chain()).toMatchObject([{ cardId: "tt", controller: P1, targets: ["sg"], triggered: true, type: "ability" }]);
  });

  test("(b) the swap is a chain item: P2 receives priority before it resolves, with both units still where they were", async () => {
    const game = await board().build();
    await openCombatAndPassToP1(game);
    await game.p1.reveal("tt");
    await game.p1.yes();
    const d = game.decision();
    if (d?.kind === "pick" && d.semantics === "target") {
      await game.p1.pick("sg");
    }
    await game.p1.pass();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.chain()).toHaveLength(1);
    expect(game.locationOf("tt")).toBe("bf1");
    expect(game.locationOf("sg")).toBe("base");
  });

  // ---------------------------------------------------------------- (c)
  test("(c) after resolution: Guardian is at bf1 as a DEFENDER with Shield live (4 Might) although exhausted and late to the fight; Tideturner sits in base with no designation (323.2.a / 323.2.c / 814.1.c)", async () => {
    const game = await board().build();
    await openCombatAndPassToP1(game);
    await flipAndSwap(game);
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("sg")).toBe("bf1");
    expect(game.locationOf("tt")).toBe("base");
    expect(game.locationOf("sk")).toBe("bf1");
    expect(game.state("sg").combatRole).toBe("defender");
    expect(game.state("sg").isExhausted).toBe(true); // moved by an effect: no cost, no readying
    expect(game.state("sg").might).toBe(4); // 3 + Shield 1 while defending
    expect(game.state("sg").keywords).toEqual(expect.arrayContaining(["Shield", "Tank"]));
    expect(game.state("tt").combatRole).toBeNull();
    expect(game.state("tt").isExhausted).toBe(true);
    expect(game.state("sk").combatRole).toBe("defender");
    expect(game.state("vs").combatRole).toBe("attacker");
    // the showdown is still open — combat has not resolved yet
    expect(showdown(game)).toBeDefined();
    expect(game.zoneOf("vs")).toBe("battlefield-bf1");
  });

  // 347.1.b / 340.2.a: P1 used its Focus to play a card; when the resulting chain closes,
  // Focus passes to the next player in turn order (P2) and the pass sequence restarts.
  test("(c) once the swap's chain closes Focus passes to P2 (347.1.b), the same as a play from hand", async () => {
    const game = await board().build();
    await openCombatAndPassToP1(game);
    await flipAndSwap(game);
    expect(game.chain()).toEqual([]);
    expect(showdown(game)?.passedPlayers ?? []).toEqual([]);
    expect(showdown(game)?.focusPlayer).toBe(P2);
    expect(game.actingSeat()).toBe(P2);
  });

  // rule 144.4 (ruling 30b2fb1d5002156d) — Volibear must stand AT a battlefield for "other than
  // mine" to name anything, so the probe sits at P2's bf2, not in base.
  test("(c) both relocations are MOVES (446.1): an enemy Volibear, Imposing ('When an opponent moves to a battlefield other than mine, draw 1') at P2's bf2 sees the Guardian move base→bf1 and draws", async () => {
    const game = await board().unit(P2, "bf2", VOLIBEAR_IMPOSING, "voli").build();
    await openCombatAndPassToP1(game);
    const p2Hand = game.p2.hand().length;
    await flipAndSwap(game);
    await game.settle({ maxSteps: 10, policy: (d) => (d.kind === "action" && d.context === "chain" && d.passKey ? { key: d.passKey, kind: "action" } : undefined) });
    expect(game.locationOf("sg")).toBe("bf1");
    // Guardian moved TO a battlefield (Volibear is at bf2, so bf1 is "other than mine") → exactly one draw;
    // Tideturner moved to BASE, which is not a battlefield (144.4) → no second draw.
    expect(game.p2.hand().length).toBe(p2Hand + 1);
  });

  // ---------------------------------------------------------------- (d)
  test("(d) swap ACCEPTED, all pass: defenders 3+4=7 kill the Sergeant; its 4 must go to the Tank first and is exactly lethal on the 4-Might Guardian → Guardian dies, Skulker untouched; P1 keeps bf1, nobody scores", async () => {
    const game = await board().build();
    await openCombatAndPassToP1(game);
    await flipAndSwap(game);
    // Drive to the damage step by passing focus; if P2 is asked to assign, Tank makes {sg:4} the only line.
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.passKey && d.context === "showdown") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    const d = game.decision();
    if (d?.kind === "distribute" && d.seat === P2) {
      expect(d.total).toBe(4);
      const dodgeTank = await game.p2.try((p) => p.distribute({ sg: 1, sk: 3 }));
      expect(dodgeTank.ok).toBe(false); // 465.2.c.6 — Tank must be assigned first
      if (game.decision()?.kind === "distribute") {
        await game.p2.distribute({ sg: 4 });
      }
    }
    await game.settle();
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.zoneOf("sg")).toBe("trash");
    expect(game.zoneOf("sk")).toBe("battlefield-bf1");
    expect(game.state("sk").damage).toBe(0);
    expect(game.zoneOf("tt")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("(d) swap DECLINED (Tideturner stays as a 2-Might defender): 3+2=5 kills the Sergeant; P2's 4 damage is assigned lethal-first (465.2.c.3/.4) → exactly one defender dies; P1 keeps bf1", async () => {
    const game = await board().build();
    await openCombatAndPassToP1(game);
    await game.p1.reveal("tt");
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("tt")).toBe("bf1");
    expect(game.locationOf("sg")).toBe("base");
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.passKey && d.context === "showdown") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P2, total: 4 });
    if (d?.kind === "distribute") {
      expect(d.buckets.map((b) => [b.card, b.lethal]).sort()).toEqual([["sk", 3], ["tt", 2]]);
      // over-assigning the 2-Might Tideturner while the Skulker is still unassigned is illegal (465.2.c.4)
      const illegal = await game.p2.try((p) => p.distribute({ sk: 1, tt: 3 }));
      expect(illegal.ok).toBe(false);
      await game.p2.distribute({ sk: 3, tt: 1 }); // 3 lethal to Skulker first, the odd 1 to Tideturner
    }
    await game.settle();
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.zoneOf("sk")).toBe("trash");
    expect(game.zoneOf("tt")).toBe("battlefield-bf1");
    expect(game.state("tt").damage).toBe(0); // healed in the Combat Cleanup (466.1.a.1)
    expect(game.zoneOf("sg")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("(d) swap DECLINED, the other legal line: 2 lethal to Tideturner then 2 to the Skulker → Tideturner dies, Skulker survives; still P1's battlefield", async () => {
    const game = await board().build();
    await openCombatAndPassToP1(game);
    await game.p1.reveal("tt");
    await game.p1.no();
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.passKey && d.context === "showdown") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2 });
    await game.p2.distribute({ sk: 2, tt: 2 });
    await game.settle();
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.zoneOf("tt")).toBe("trash");
    expect(game.zoneOf("sk")).toBe("battlefield-bf1");
    expect(game.state("sk").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("(d) NO flip at all: 4 v 3 → the Skulker dies, the Sergeant survives (damage healed in the Combat Cleanup), P2 conquers bf1 for a point; the stranded facedown Tideturner is removed (466.5.c)", async () => {
    const game = await board().build();
    await game.p2.move("vs", "bf1");
    await game.settle();
    expect(game.zoneOf("sk")).toBe("trash");
    expect(game.zoneOf("vs")).toBe("battlefield-bf1");
    expect(game.state("vs").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.zoneOf("tt")).not.toBe("facedown-bf1");
    expect(game.zoneOf("tt")).toBe("trash");
    expect(game.locationOf("sg")).toBe("base");
  });

  // ---------------------------------------------------------------- (e)
  test("(e) NO-side: during the showdown P1 cannot Standard-Move the Guardian into bf1 — not with it exhausted (144.2), and not even with a READY Guardian (144.1.a another player's turn, 144.1.c no Standard Move during a Showdown/Combat)", async () => {
    const exhausted = await board().build();
    await openCombatAndPassToP1(exhausted);
    expect(exhausted.p1.can("move")).toBe(false);
    await expect(exhausted.p1.move("sg", "bf1")).rejects.toThrow();

    const ready = await board({ guardianExhausted: false }).build();
    await openCombatAndPassToP1(ready);
    expect(ready.state("sg").isReady).toBe(true);
    expect(ready.p1.can("move")).toBe(false);
    expect(ready.p1.legal().map((o) => o.verb)).not.toContain("move");
    await expect(ready.p1.move("sg", "bf1")).rejects.toThrow();
    // Only the effect route exists: the flip is still on the menu.
    expect(ready.p1.can("reveal", "tt")).toBe(true);
  });

  test("(e) contrast: on P1's own turn in an Open state a READY Guardian may Standard-Move to bf1, but once a showdown is open there the move option disappears (144.1.c)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", VANGUARD_SERGEANT, "vs")
      .unit(P1, "base", SUNLIT_GUARDIAN, "sg")
      .unit(P1, "base", SKULKER, "sk")
      .build();
    expect(game.p1.can("move")).toBe(true);
    await game.p1.move("sk", "bf1"); // opens a combat showdown at bf1, P1 has Focus
    expect(showdown(game)?.focusPlayer).toBe(P1);
    expect(game.state("sg").isReady).toBe(true);
    expect(game.p1.can("move")).toBe(false);
    await expect(game.p1.move("sg", "bf1")).rejects.toThrow();
  });
});
