/**
 * Interaction: Sprite Mother (ogn-106-298) · Unit · Mind · 3 Might
 *     "When you play me, play a ready 3 [Might] Sprite unit token with [Temporary] here."
 *   × Thrill of the Hunt (unl-184-219) · Spell [Reaction]
 *     "Banish a friendly unit, then its owner plays it to any battlefield, ignoring its cost."
 *   × Sprite Call (ogn-094-298) · Spell [Hidden][Action]
 *     "Play a ready 3 [Might] Sprite unit token with [Temporary]."   (no location word)
 *
 * Board: P1's turn. P1 controls bf1 (Holder there) and has Sprite Mother in base; P2 controls bf2 with a lone
 * 2-Might defender D. Thrill of the Hunt and Sprite Call in P1's hand.
 *
 * (a) Thrill on Sprite Mother, re-played to ENEMY bf2: Thrill grants the location permission (355.2.b); she enters
 *     exhausted (143.4) and contests bf2 (190.3.a.1); combat is staged but waits while her play trigger is on the
 *     chain. "play … here" both directs and permits the token's destination (439.2 / 439.2.c, 184.2) so the Sprite is
 *     created at bf2 although P1 controls nothing there; "ready" is a stipulation of the creating effect (184.1) that
 *     overrides the enters-exhausted default (143.4 / 185.2.d). Token per 187.2 / 185.3 / 439.4: unit token, 3 Might,
 *     Temporary, no domain, cost 0, owner = controller = P1, at bf2, ready. Then combat: Mother 3 + Sprite 3 vs D 2 →
 *     D dies, P1 conquers bf2 (+1), both attackers stay.
 * (b) Sprite Call names no zone → normal unit placement (439.2.c → 185.2.a → 355.2.a): P1's base or a battlefield P1
 *     controls (bf1); bf2 is not legal. It still enters READY (184.1).
 * (c) Each Sprite is killed at the start of P1's next Beginning Phase, before scoring (816), and as a token ceases
 *     to exist off the board (186.1).
 * (The Fae tag of 187.2 is not observable through the harness CardState and is not asserted.)
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_MOTHER = "ogn-106-298";
const THRILL_OF_THE_HUNT = "unl-184-219";
const SPRITE_CALL = "ogn-094-298";

function board() {
  return scenario()
    .resources(P1, { energy: 10, power: { mind: 2, rainbow: 3 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "Defender" }, "D")
    .unit(P1, "base", SPRITE_MOTHER, "mother")
    .hand(P1, THRILL_OF_THE_HUNT, "thrill")
    .hand(P1, SPRITE_CALL, "call");
}

/** P1's live Sprite tokens (Sprite Mother herself excluded). */
function sprites(game: Game): string[] {
  return game
    .findAll({ name: "Sprite", owner: P1 })
    .filter((id) => game.state(id).defId !== SPRITE_MOTHER && game.zoneOf(id) !== "gone");
}

/** Cast Thrill on Sprite Mother, let it resolve, and answer the "any battlefield" destination with bf2. Stops with her trigger on the chain. */
async function thrillMotherToBf2(game: Game): Promise<void> {
  await game.p1.cast("thrill", { targets: "mother" });
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  const d = game.decision() as PickDecision;
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "mother" } });
  await game.p1.pick("battlefield-bf2");
}

describe("(a) Thrill of the Hunt re-plays Sprite Mother to ENEMY-held bf2; her 'here' token is created there, READY, and joins the attack", () => {
  test("Thrill's destination offer is 'any battlefield' — both P1's bf1 and P2's bf2 are legal, base is not (355.2.b)", async () => {
    const game = await board().build();
    await game.p1.cast("thrill", { targets: "mother" });
    await game.settle();
    const d = game.decision() as PickDecision;
    expect(d.kind).toBe("pick");
    expect(d.options.map((o) => o.key).toSorted()).toEqual(["battlefield-bf1", "battlefield-bf2"]);
    expect(game.zoneOf("mother")).toBe("banishment"); // banished first, then played
  });

  test("she enters bf2 EXHAUSTED (143.4), bf2 becomes contested by P1 (190.3.a.1), and her play trigger is on the chain — combat has not begun (no showdown, D untouched)", async () => {
    const game = await board().build();
    await thrillMotherToBf2(game);
    expect(game.zoneOf("thrill")).toBe("trash");
    expect(game.locationOf("mother")).toBe("bf2");
    expect(game.state("mother").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mother", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(sprites(game)).toEqual([]);
    expect(game.zoneOf("D")).toBe("battlefield-bf2");
    expect(game.state("D").damage).toBe(0);
  });

  test("the trigger resolves: a Sprite token is created AT bf2 (a battlefield P1 does not control — 'here' permits it, 439.2.c/184.2) and it is READY (184.1 overrides 143.4); only then does the showdown open", async () => {
    const game = await board().build();
    await thrillMotherToBf2(game);
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    const made = sprites(game);
    expect(made).toHaveLength(1);
    const sprite = made[0] as string;
    expect(game.locationOf(sprite)).toBe("bf2");
    expect(game.state(sprite).isReady).toBe(true);
    // Combat now begins: attacker (P1) has Focus in the showdown at bf2.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bf2?.contested).toBe(true);
  });

  test("token characteristics (187.2, 185.3, 439.4): unit TOKEN, 3 Might, Temporary, domainless, cost 0, owner P1, controller P1, at bf2, ready, undamaged", async () => {
    const game = await board().build();
    await thrillMotherToBf2(game);
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    const sprite = sprites(game)[0] as string;
    expect(game.state(sprite)).toMatchObject({
      baseMight: 3,
      cardType: "unit",
      controller: P1,
      damage: 0,
      domains: [],
      energyCost: 0,
      isExhausted: false,
      isReady: true,
      isToken: true,
      location: "bf2",
      might: 3,
      owner: P1,
      powerCost: [],
    });
    expect(game.state(sprite).keywords).toContain("Temporary");
  });

  test("combat: Sprite Mother (3) + Sprite (3) attack D (2) — D dies, neither attacker dies, P1 conquers bf2 (+1); afterwards Mother is still exhausted and the Sprite still ready, both at bf2", async () => {
    const game = await board().build();
    await thrillMotherToBf2(game);
    await game.settle(); // trigger resolves, both pass focus, combat resolves
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    const sprite = sprites(game)[0] as string;
    expect(game.p1.units("bf2").toSorted()).toEqual(["mother", sprite].toSorted());
    expect(game.state("mother").isExhausted).toBe(true);
    expect(game.state(sprite).isReady).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) contrast — Sprite Call has no location word: the token follows normal unit placement (355.2.a), never bf2, and is still READY", () => {
  test("the destination offer is exactly {P1's base, bf1 (controlled)}; bf2 is not offered and picking it is rejected", async () => {
    const game = await board().build();
    await game.p1.cast("call");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d.options.map((o) => o.key).toSorted()).toEqual(["base", "battlefield-bf1"]);
    const illegal = await game.p1.try((p) => p.pick("battlefield-bf2"));
    expect(illegal.ok).toBe(false);
    expect(sprites(game).filter((s) => game.locationOf(s) === "bf2")).toEqual([]);
  });

  test("to base: a ready 3-Might Temporary Sprite token in P1's base", async () => {
    const game = await board().build();
    await game.p1.cast("call");
    await game.settle();
    await game.p1.pick("base");
    await game.settle();
    const sprite = sprites(game)[0] as string;
    expect(game.state(sprite)).toMatchObject({ controller: P1, isReady: true, isToken: true, location: "base", might: 3, owner: P1 });
    expect(game.state(sprite).keywords).toContain("Temporary");
    expect(game.zoneOf("call")).toBe("trash");
  });

  test("to bf1 (a battlefield P1 controls): legal, and ready there too", async () => {
    const game = await board().build();
    await game.p1.cast("call");
    await game.settle();
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    const sprite = sprites(game)[0] as string;
    expect(game.locationOf(sprite)).toBe("bf1");
    expect(game.state(sprite).isReady).toBe(true);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
  });
});

describe("(c) Temporary: each Sprite is killed at the start of P1's NEXT Beginning Phase, before scoring, and ceases to exist (816, 186.1)", () => {
  test("Thrill path: the bf2 Sprite survives P2's turn, is gone once P1's next turn opens; Sprite Mother still holds bf2 (P1: 1 conquer + 2 holds = 3)", async () => {
    const game = await board().build();
    await thrillMotherToBf2(game);
    await game.settle();
    const sprite = sprites(game)[0] as string;
    await game.advanceTurn(); // → P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf(sprite)).toBe("battlefield-bf2"); // not P1's Beginning Phase yet
    await game.advanceTurn(); // → P1's turn: Beginning Phase kills it, then scoring
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf(sprite)).toBe("gone");
    expect(game.has(sprite)).toBe(false);
    expect(game.p1.trash()).not.toContain(sprite); // a token does not persist in the trash
    expect(game.locationOf("mother")).toBe("bf2");
    expect(game.p1.points()).toBe(3);
  });

  test("'before scoring': a Sprite left ALONE at bf1 dies first, so P1 does not hold bf1 that turn (no point from it)", async () => {
    const game = await board().build();
    await game.p1.cast("call");
    await game.settle();
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    const sprite = sprites(game)[0] as string;
    await game.p1.move("holder", "base"); // leave the Sprite as P1's only unit at bf1
    await game.settle();
    expect(game.p1.units("bf1")).toEqual([sprite]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    const before = game.p1.points();
    await game.advanceTurn(); // P2's turn
    await game.advanceTurn(); // P1's turn: Temporary kill → (cleanup) → scoring finds nothing to hold at bf1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf(sprite)).toBe("gone");
    expect(game.p1.points()).toBe(before);
    expect(game.violations()).toEqual([]);
  });
});
