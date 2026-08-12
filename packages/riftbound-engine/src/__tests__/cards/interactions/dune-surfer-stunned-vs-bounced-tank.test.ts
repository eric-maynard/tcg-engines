/**
 * Interaction: Dune Surfer (ven-004-166) · Unit · Fury · 3 · 3 Might —
 *     "You ignore [Tank] while assigning combat damage here."
 *   × Rell, Magnetic (sfd-024-221) · Champion Unit · Fury · 4 · 4 Might — "[Tank] …"
 *   × Existential Dread (unl-134-219) · Spell · Chaos · 1 + [chaos] · [Action] [Repeat] [2] —
 *     "[Stun] an attacking enemy unit. If it's already stunned, return it to its owner's hand instead."
 *   (Towering Combatant, unl-099-219 — "[Shield 2] [Tank]" — is P1's second attacker, so P2's own
 *    assignment is bound by a Tank of its own; a 1-Might Deckhand is P2's second defender.)
 *
 * Question: Dune Surfer attacks alongside another unit into a battlefield defended by Rell
 * ([Tank]) and a second defender. Before the damage step P2 plays Existential Dread on the Surfer —
 * the first copy [Stun]s it, the [Repeat] copy (it is already stunned) returns it to its owner's
 * hand. (a) Does the Tank-ignoring permission survive the STUN? (b) Does it survive the BOUNCE?
 * (c) While it is live, does P2 — assigning its own defenders' damage at the SAME battlefield — get
 * to ignore Tank too? (d) Does Rell stop being a unit "with Tank" for other effects meanwhile?
 *
 * Expected: (a) yes. Stun is a status that only removes the unit's Might from the combat damage step
 * (423.1.b); it does not make abilities inactive. The stunned Surfer is still at the battlefield, so
 * P1's assignment procedure ignores Tank (766) — P1 may put the surviving attacker's damage on the
 * Deckhand first even though Rell has Tank, while the Surfer itself contributes 0. (b) no. The
 * second copy returns it to hand, so when the damage step runs there is no Dune Surfer "here"; the
 * permission is checked when the procedure runs (766), so Rell must be assigned lethal first (815)
 * and any assignment skipping her is rejected — here the engine does not even raise a prompt, the
 * only legal line being forced. (c) no — 767: an "ignore" applies only to the players the ability
 * directs, and this one says "YOU ignore", i.e. Dune Surfer's controller. P2's assignment onto P1's
 * attackers is fully bound by the Tank on Towering Combatant. (d) no — 766 makes the ability
 * inactive only for that procedure; Rell still READS as a unit with Tank everywhere else.
 *
 * Rules: 765 / 766 / 767 (ignoring a keyword: inactive for that procedure, and only for the players
 * the ability directs), 815 (Tank — assigned combat damage first), 423.1.b (a stunned unit deals no
 * combat damage; its abilities are untouched), 465.2.c (the assignment procedure — lethal before
 * moving on, no over-assignment while another unit remains).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DUNE_SURFER = "ven-004-166";
const RELL = "sfd-024-221";
const EXISTENTIAL_DREAD = "unl-134-219";
const TOWERING_COMBATANT = "unl-099-219";

/**
 * P1's turn. P2 holds bf1 with Rell ([Tank], 4) and a 1-Might Deckhand; P1's Dune Surfer and
 * Towering Combatant ([Tank], 3) wait in base, and P2 holds Existential Dread with 3 + [chaos].
 * `surfer: false` swaps the Surfer for a vanilla 3 under the same alias — the NO side of (a).
 */
function board(surfer = true) {
  return scenario()
    .autoProcedures(false)
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", RELL, "rell")
    .unit(P2, "bf1", { might: 1, name: "Deckhand" }, "deckhand")
    .unit(P1, "base", surfer ? DUNE_SURFER : { might: 3, name: "Sand Strider" }, "surfer")
    .unit(P1, "base", TOWERING_COMBATANT, "combatant")
    .hand(P2, EXISTENTIAL_DREAD, "dread");
}

/**
 * Both attackers walk into bf1; P1 passes Focus and P2 answers with Existential Dread
 * (`repeat: 1` = the stun copy plus the bounce copy). The combat-resolution step is then P1's.
 */
async function attack(o: { surfer?: boolean; repeat?: number; dread?: boolean } = {}): Promise<Game> {
  const game = await board(o.surfer ?? true).build();
  await game.p1.move(["surfer", "combatant"], "bf1");
  await game.p1.passFocus();
  if (o.dread === false) {
    await game.p2.passFocus();
  } else {
    await game.p2.cast("dread", o.repeat === undefined ? { targets: "surfer" } : { repeat: o.repeat, targets: ["surfer"] });
    await game.p2.passPriority();
    await game.p1.passPriority();
  }
  const settled = await game.settle();
  expect(settled.reason).toBe("open");
  expect(game.p1.can("resolveFullCombat:bf1")).toBe(true);
  return game;
}

/** Drive the rest of combat; P1 answers with `p1Line` when asked. Returns how often P2 was asked. */
async function finishCombat(game: Game, p1Line?: Record<string, number>): Promise<number> {
  let p2Asked = 0;
  for (let i = 0; i < 6; i++) {
    for (let d = game.decision(); d?.kind === "distribute"; d = game.decision()) {
      if (d.seat === P1) {
        await game.p1.distribute(p1Line ?? { ...(d.defaultAllocation as Record<string, number>) });
      } else {
        p2Asked++;
        await game.p2.distribute({ ...(d.defaultAllocation as Record<string, number>) });
      }
    }
    await game.settle();
    if (!game.p1.can("resolveFullCombat:bf1")) {
      break;
    }
    await game.p1.choose("resolveFullCombat:bf1");
  }
  return p2Asked;
}

/** Total combat damage dealt to `target` (public damageLog). */
function dealt(game: Game, target: string): number {
  return (game.gameState.damageLog ?? []).filter((r) => r.combat && r.target === target).reduce((n, r) => n + r.amount, 0);
}

describe("Dune Surfer's Tank-ignore under a Stun and under a bounce", () => {
  test("premise: the first copy stuns the Surfer and it stays at bf1; attackers therefore deal only the Combatant's 3 (423.1.b), defenders 5", async () => {
    const game = await attack();
    expect(game.state("surfer")).toMatchObject({ combatRole: "attacker", isStunned: true, zone: "battlefield-bf1" });
    expect(game.state("combatant").might).toBe(3); // Shield 2 is defender-only
    expect(game.state("rell").might + game.state("deckhand").might).toBe(5);
    await game.p1.choose("resolveFullCombat:bf1");
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 3 });
  });

  test("(a) the STUN does not switch the ability off: P1's prompt offers BOTH defenders with no forced minimum, and {deckhand 1, rell 2} is accepted — the Deckhand dies while Rell (lethal 4) lives", async () => {
    const game = await attack();
    await game.p1.choose("resolveFullCombat:bf1");
    const d = game.decision();
    expect(d?.kind === "distribute" ? Object.fromEntries(d.buckets.map((b) => [b.key, { lethal: b.lethal, min: b.min }])) : {}).toEqual({
      deckhand: { lethal: 1, min: 0 },
      rell: { lethal: 4, min: 0 }, // no Tank-first minimum for P1
    });
    await finishCombat(game, { deckhand: 1, rell: 2 });
    expect(dealt(game, "deckhand")).toBe(1);
    expect(dealt(game, "rell")).toBe(2);
    expect(game.zoneOf("deckhand")).toBe("trash");
    expect(game.state("rell")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // healed, survived
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // a defender remains — no conquer
    expect(game.violations()).toEqual([]);
  });

  test("(a) NO side — the same stunned attacker without Dune Surfer's text (a vanilla 3 in its place): Tank binds P1, no assignment prompt is raised at all and all 3 land on Rell", async () => {
    const game = await attack({ surfer: false });
    await game.p1.choose("resolveFullCombat:bf1");
    expect(game.decision()).not.toMatchObject({ kind: "distribute", seat: P1 });
    await finishCombat(game);
    expect(dealt(game, "rell")).toBe(3);
    expect(dealt(game, "deckhand")).toBe(0);
    expect(game.zoneOf("deckhand")).toBe("battlefield-bf1");
  });

  test("(b) the BOUNCE takes the permission with it: the [Repeat] copy puts the Surfer in its owner's hand, so when the procedure runs nothing is 'here' — Rell must be assigned first, P1 is offered no line that skips her, and the Deckhand is untouched (766, 815)", async () => {
    const game = await attack({ repeat: 1 });
    expect(game.zoneOf("surfer")).toBe("hand");
    expect(game.state("surfer").owner).toBe(P1);
    await game.p1.choose("resolveFullCombat:bf1");
    expect(game.decision()).not.toMatchObject({ kind: "distribute", seat: P1 }); // the only legal line is forced
    await finishCombat(game);
    expect(dealt(game, "rell")).toBe(3); // all of it, though 3 < her lethal 4
    expect(dealt(game, "deckhand")).toBe(0);
    expect(game.zoneOf("rell")).toBe("battlefield-bf1");
    expect(game.zoneOf("deckhand")).toBe("battlefield-bf1");
    expect(game.zoneOf("combatant")).toBe("trash"); // the lone attacker eats all 5
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("(c) 767 — 'YOU ignore' binds only Dune Surfer's controller: in the very same combat P2's assignment obeys the Tank on Towering Combatant, so P2 is never asked, the Combatant takes its lethal 3 first and the Surfer survives on 2", async () => {
    const game = await attack();
    await game.p1.choose("resolveFullCombat:bf1");
    const p2Asked = await finishCombat(game, { deckhand: 1, rell: 2 });
    expect(p2Asked).toBe(0); // forced Tank order, no choice to make
    expect(dealt(game, "combatant")).toBe(3);
    expect(dealt(game, "surfer")).toBe(2); // a Tank-ignoring P2 would have killed the Surfer instead
    expect(game.zoneOf("combatant")).toBe("trash");
    expect(game.zoneOf("surfer")).toBe("base"); // survived and was recalled (466)
    expect(game.state("surfer").damage).toBe(0);
  });

  test("(d) Rell never stops being a unit with [Tank]: her printed keyword reads the same before the procedure, inside P1's assignment prompt (which prices her lethal at 4) and after combat — nothing is granted or stripped", async () => {
    const game = await attack();
    expect(game.state("rell")).toMatchObject({ grantedKeywords: [], keywords: ["Tank"] });
    await game.p1.choose("resolveFullCombat:bf1");
    const d = game.decision();
    expect(game.state("rell")).toMatchObject({ grantedKeywords: [], keywords: ["Tank"], might: 4 });
    expect(d?.kind === "distribute" ? d.buckets.find((b) => b.key === "rell")?.label : "").toContain("lethal at 4");
    await finishCombat(game, { deckhand: 1, rell: 2 });
    expect(game.state("rell")).toMatchObject({ grantedKeywords: [], keywords: ["Tank"], might: 4, zone: "battlefield-bf1" });
  });

  test("control — no Existential Dread at all: the un-stunned Surfer adds its 3, P1 still assigns freely (6, both defenders offered) and Tank never binds P1", async () => {
    const game = await attack({ dread: false });
    expect(game.state("surfer").isStunned).toBe(false);
    await game.p1.choose("resolveFullCombat:bf1");
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 6 });
    await finishCombat(game, { deckhand: 1, rell: 5 });
    expect(game.zoneOf("rell")).toBe("trash");
    expect(game.zoneOf("deckhand")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // both defenders gone — conquered
    expect(game.violations()).toEqual([]);
  });
});
