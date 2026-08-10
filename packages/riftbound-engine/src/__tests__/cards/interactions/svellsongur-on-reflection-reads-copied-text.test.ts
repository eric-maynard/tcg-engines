/**
 * Interaction: Svellsongur (sfd-059-221) · Equipment · Calm · 3+[calm] · +0
 *     "[Equip] [1][calm]. As this is attached to a unit, copy that unit's text to this Equipment's effect
 *      text for as long as this is attached to it."
 *   × Mirror Image (unl-200-219) · Spell · Mind/Order · 3+[mind][order]
 *     "Choose a unit. Play a ready Reflection unit token to your base. It becomes a copy of that unit.
 *      Give it [Temporary]."
 *   × Watchful Sentry (ogn-096-298) · Unit · Mind · 2 · 1 Might — "[Deathknell] — Draw 1."
 *
 * Rules: 477.1.b.2 (a PARTIAL copy copies only the named trait — here rules TEXT), 477.1.b.1.b (a copy's
 * copyable traits ARE the copied ones — "printed or copied", cf. 206 for cost), 477.2.a / 477.2.c / 718.3
 * (an attached card's Effect Text is APPENDED in layer 2 — not a copyable trait; neither is a granted
 * keyword), 718.4 (+0 bonus), 816.1.b (Temporary kills at the start of the controller's Beginning Phase),
 * 808.1.d.2/.3 (Deathknell is noted before the permanent leaves, attachments still on), 186.1 (a token in
 * the trash ceases to exist), 435.1.c (detached → Effect Text inactive/blank again).
 *
 * Question: P1 Mirror-Images P2's Watchful Sentry → a ready Temporary Reflection-Sentry in P1's base.
 *  (a) P1 Equips Svellsongur to the Reflection: it copies the Reflection's COPIED Sentry text (not
 *      "nothing"), and not the granted [Temporary]. Sheet: Watchful Sentry, Mind, cost 2, 1 Might (+0),
 *      Deathknell ×2 (own copy + appended), Temporary ×1, equipped, ready, token, P1's.
 *  (b) Next P1 Beginning Phase, Temporary kills it: both Deathknells were noted before it left → P1 draws 2;
 *      the token ceases to exist; Svellsongur falls off blank and unattached in P1's base, re-Equippable.
 *  (c) A second Mirror Image on the equipped Reflection copies copyable text only → ONE Deathknell (plus
 *      its own Temporary, not equipped); when it dies P1 draws 1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SVELLSONGUR = "sfd-059-221";
const MIRROR_IMAGE = "unl-200-219";
const WATCHFUL_SENTRY = "ogn-096-298";

/**
 * P1's turn (turn 2). P2: Watchful Sentry in base (the copy source), a 6-Might Wall holding bf1 (anything
 * P1 walks in dies). P1: vanilla Anchor (2) in base, Svellsongur unattached in base, two Mirror Images in
 * hand; 8 energy + calm (Equip) + mind×2/order×2 (two Mirror Images).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { calm: 1, mind: 2, order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
    .unit(P2, "base", WATCHFUL_SENTRY, "sentry")
    .unit(P1, "base", { might: 2, name: "Anchor" }, "anchor")
    .gear(P1, SVELLSONGUR, "sv")
    .hand(P1, MIRROR_IMAGE, "mi1")
    .hand(P1, MIRROR_IMAGE, "mi2");
}

const tokensOf = (game: Game) => game.p1.units().filter((id) => game.state(id).isToken);

/** Cast Mirror Image `mi` on `target`, resolve it, return the new Reflection's id. */
async function reflect(game: Game, mi: "mi1" | "mi2", target: string): Promise<string> {
  const before = new Set(tokensOf(game));
  await game.p1.cast(mi, { targets: target });
  await game.settle();
  const fresh = tokensOf(game).filter((t) => !before.has(t));
  expect(fresh).toHaveLength(1);
  return fresh[0]!;
}

/** Activate Svellsongur's [Equip] onto `unit` and let it resolve. */
async function equip(game: Game, unit: string): Promise<void> {
  expect(game.p1.option("equipCard")?.fields.find((f) => f.name === "unitId")?.options ?? []).toContain(unit);
  await game.p1.choose("equipCard:-", { params: { equipmentId: "sv", unitId: unit } });
  await game.settle();
  expect(game.state("sv").attachedTo).toBe(unit);
}

/** (a): Reflection of Sentry wearing Svellsongur. */
async function equippedReflection(): Promise<{ game: Game; tok: string }> {
  const game = await board().build();
  const tok = await reflect(game, "mi1", "sentry");
  await equip(game, tok);
  return { game, tok };
}

/** Walk `unit` into the 6-Might Wall at bf1 and fight it out (it dies). Returns P1's hand delta. */
async function suicideIntoWall(game: Game, unit: string): Promise<number> {
  const hand = game.p1.hand().length;
  await game.p1.move(unit, "bf1");
  await game.settle();
  expect(game.has(unit) ? game.zoneOf(unit) : "gone").not.toBe("battlefield-bf1");
  expect(game.zoneOf("wall")).toBe("battlefield-bf1");
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game.p1.hand().length - hand;
}

describe("(a) Svellsongur on a Reflection copies the Reflection's COPIED text", () => {
  test("setup: Mirror Image on P2's Sentry → a READY Reflection token in P1's base that is a copy of Watchful Sentry (Mind, cost 2, 1 Might, Deathknell) with exactly one granted Temporary; P2's Sentry untouched", async () => {
    const game = await board().build();
    const tok = await reflect(game, "mi1", "sentry");
    expect(game.state(tok)).toMatchObject({
      attachments: [],
      baseMight: 1,
      controller: P1,
      domains: ["mind"],
      energyCost: 2,
      isExhausted: false,
      isReady: true,
      isToken: true,
      might: 1,
      name: "Watchful Sentry",
      owner: P1,
      zone: "base",
    });
    expect(game.state(tok).keywords).toEqual(expect.arrayContaining(["Deathknell", "Temporary"]));
    expect(game.state(tok).grantedKeywords).toEqual([{ duration: "permanent", keyword: "Temporary" }]);
    expect(game.state(tok).meta.copyOfCardId).toBe("sentry");
    expect(game.state("sentry")).toMatchObject({ controller: P2, might: 1, zone: "base" });
    expect(game.state("sentry").keywords).not.toContain("Temporary");
    expect(game.p1.resources()).toEqual({ energy: 5, power: { calm: 1, mind: 1, order: 1 } });
  });

  test("Equip [1][calm] onto the Reflection is legal; Svellsongur records the REFLECTION as its copy source (it reads the token's current copyable text, 477.1.b.1.b) and stays 'Svellsongur' itself", async () => {
    const { game, tok } = await equippedReflection();
    expect(game.p1.resources()).toEqual({ energy: 4, power: { calm: 0, mind: 1, order: 1 } });
    expect(game.state("sv")).toMatchObject({ attachedTo: tok, cardType: "equipment", controller: P1, location: "base", name: "Svellsongur" });
    expect(game.state("sv").meta.copiedFromCardId).toBe(tok);
    // a layer-2 grant is not copyable text: the Equipment did not pick up Temporary
    expect(game.state("sv").keywords).not.toContain("Temporary");
    expect(game.state("sv").keywords).not.toContain("Deathknell"); // its RULES text is just [Equip]; the copy lives in Effect Text
  });

  test("resulting sheet of the Reflection: Watchful Sentry · Mind · cost 2 · 1 Might (1 + 0 bonus, 718.4) · Deathknell · exactly ONE Temporary · equipped with Svellsongur · ready · token · P1's", async () => {
    const { game, tok } = await equippedReflection();
    expect(game.state(tok)).toMatchObject({
      attachments: ["sv"],
      baseMight: 1,
      controller: P1,
      domains: ["mind"],
      energyCost: 2,
      isReady: true,
      isToken: true,
      might: 1,
      name: "Watchful Sentry",
      owner: P1,
      zone: "base",
    });
    expect(game.state(tok).keywords).toEqual(expect.arrayContaining(["Deathknell", "Temporary"]));
    expect(game.state(tok).grantedKeywords.filter((k) => k.keyword === "Temporary")).toHaveLength(1);
    expect(game.violations()).toEqual([]);
  });

  test("TWO Deathknell instances, proven by dying: the equipped Reflection walked into the Wall dies and P1 draws 2 (own copied Deathknell + Svellsongur's appended copy, 718.3/808.1.d.2) — an unequipped Reflection draws 1", async () => {
    const { game, tok } = await equippedReflection();
    expect(await suicideIntoWall(game, tok)).toBe(2);
    expect(game.has(tok)).toBe(false); // 186.1

    const control = await board().build();
    const bare = await reflect(control, "mi1", "sentry");
    expect(await suicideIntoWall(control, bare)).toBe(1);
  });
});

describe("(b) Temporary kills the equipped Reflection at the start of P1's next Beginning Phase", () => {
  /** (a), then P1 ends, P2 ends → P1's Beginning Phase has begun with the Temporary kill pending. */
  async function atTemporaryKill(): Promise<{ game: Game; tok: string; hand: number }> {
    const { game, tok } = await equippedReflection();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    const hand = game.p1.hand().length;
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    return { game, hand, tok };
  }

  test("Temporary is a triggered kill (816.1.b): one chain item sourced from the Reflection opens P1's Beginning Phase, the token still on the board wearing Svellsongur", async () => {
    const { game, tok } = await atTemporaryKill();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: tok, controller: P1, triggered: true })]);
    expect(game.zoneOf(tok)).toBe("base");
    expect(game.state(tok).attachments).toEqual(["sv"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("when it resolves the Reflection really dies (a 'die' event), ceases to exist at once (186.1 — in no zone, not in any trash) and TWO separate Deathknell triggers from it are on the chain, noted before it left (808.1.d.2/.3)", async () => {
    const { game, tok, hand } = await atTemporaryKill();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.acceptTriggerOrder(); // 383.3.d soft offer for two same-controller triggers, if raised
    expect(game.has(tok)).toBe(false);
    expect(game.zoneOf(tok)).toBe("gone");
    expect(game.p1.trash()).not.toContain(tok);
    expect((game.gameState.turnEventCounts ?? {})[`die|c:${tok}`]).toBe(1);
    const knells = game.chain().filter((c) => c.cardId === tok && c.triggered);
    expect(knells).toHaveLength(2);
    expect(knells.every((k) => k.controller === P1)).toBe(true);
    expect(game.p1.hand()).toHaveLength(hand); // nothing drawn yet
  });

  test("P1 draws 2 from the two Deathknells (the effect needs no 'me', so the vanished token voids nothing), then +1 in the Draw step → main phase with hand +3", async () => {
    const { game, hand } = await atTemporaryKill();
    // resolve the kill, then each Deathknell, by passing priority around
    for (let i = 0; i < 12 && game.phase() === "beginning"; i++) {
      const d = game.decision();
      if (d?.kind === "order") {
        await game.acceptTriggerOrder();
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect((game.gameState.turnEventCounts ?? {})["draw|p:player-1"]).toBe(3);
    expect(game.p1.hand()).toHaveLength(hand + 3);
    expect(game.violations()).toEqual([]);
  });

  test("Svellsongur afterwards: detached, Effect Text blank again (no copy source, 435.1.c), unattached in P1's base under P1's control", async () => {
    const { game } = await atTemporaryKill();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.state("sv")).toMatchObject({ attachedTo: undefined, controller: P1, name: "Svellsongur", owner: P1, zone: "base" });
    expect(game.state("sv").meta.copiedFromCardId).toBeUndefined();
    expect(game.state("sv").keywords).not.toContain("Deathknell");
    expect(game.p1.gear()).toContain("sv");
  });

  test("…and re-Equippable: with [1][calm] back in the pool P1 equips it to Anchor and it now copies ANCHOR's (blank) text", async () => {
    const { game } = await atTemporaryKill();
    await game.settle();
    await game.p1.do("addResources", { energy: 1, power: { calm: 1 } });
    expect(game.p1.can("equipCard")).toBe(true);
    await equip(game, "anchor");
    expect(game.state("sv").meta.copiedFromCardId).toBe("anchor");
    expect(game.state("anchor")).toMatchObject({ attachments: ["sv"], might: 2, name: "Anchor" });
    expect(game.state("anchor").keywords).not.toContain("Deathknell");
  });
});

describe("(c) NO side: a second Mirror Image on the Svellsongur-equipped Reflection copies copyable text only", () => {
  async function twoReflections(): Promise<{ game: Game; tok: string; tok2: string }> {
    const { game, tok } = await equippedReflection();
    const offered = (game.p1.option("cast", "mi2")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain(tok);
    const tok2 = await reflect(game, "mi2", tok);
    return { game, tok, tok2 };
  }

  test("the NEW Reflection: Watchful Sentry, Mind, cost 2, 1 Might, Deathknell, its OWN single Temporary, NOT equipped (Svellsongur stays on the first Reflection) — a copy of a copy reads the copied traits (477.1.b.1.b)", async () => {
    const { game, tok, tok2 } = await twoReflections();
    expect(game.state(tok2)).toMatchObject({
      attachments: [],
      baseMight: 1,
      controller: P1,
      domains: ["mind"],
      energyCost: 2,
      isReady: true,
      isToken: true,
      might: 1,
      name: "Watchful Sentry",
      owner: P1,
      zone: "base",
    });
    expect(game.state(tok2).keywords).toEqual(expect.arrayContaining(["Deathknell", "Temporary"]));
    expect(game.state(tok2).grantedKeywords).toEqual([{ duration: "permanent", keyword: "Temporary" }]);
    expect(game.state(tok2).meta.copyOfCardId).toBe(tok);
    expect(game.state("sv").attachedTo).toBe(tok);
    expect(game.state(tok).attachments).toEqual(["sv"]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 0, mind: 0, order: 0 } });
  });

  test("ONE Deathknell, proven by dying: the new Reflection walked into the Wall dies and P1 draws exactly 1 — Svellsongur's appended Effect Text was not part of the target's copyable traits", async () => {
    const { game, tok, tok2 } = await twoReflections();
    expect(await suicideIntoWall(game, tok2)).toBe(1);
    expect(game.has(tok2)).toBe(false);
    // the equipped original is untouched and still carries both instances
    expect(game.state(tok).attachments).toEqual(["sv"]);
    expect(await suicideIntoWall(game, tok)).toBe(2);
  });

  test("both Reflections dying to Temporary at the start of P1's next Beginning Phase should yield 2 + 1 = 3 Deathknell draws and continue into P1's main phase — engine kills the equipped Reflection twice (second Temporary item re-kills a gone token) and strands a controller-less chain item with no pass option", async () => {
    // Expected: two Temporary kills resolve (each token dies once: die ×2), three Deathknell draws + the
    // Draw step, P1 reaches an open main phase. Actual: die|c:<first token> = 2, a chain item with
    // controller "" remains and P1's only legal move is concede (phase stuck in "beginning").
    const { game, tok, tok2 } = await twoReflections();
    await game.advanceTurn();
    const hand = game.p1.hand().length;
    await game.p2.endTurn();
    for (let i = 0; i < 24 && game.phase() === "beginning"; i++) {
      const d = game.decision();
      if (d?.kind === "order") {
        await game.acceptTriggerOrder();
      } else if (d?.kind === "action" && d.context === "chain" && d.passKey) {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    await game.settle();
    const counts = game.gameState.turnEventCounts ?? {};
    expect(counts[`die|c:${tok}`]).toBe(1);
    expect(counts[`die|c:${tok2}`]).toBe(1);
    expect(game.has(tok) || game.has(tok2)).toBe(false);
    expect(game.phase()).toBe("main");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.hand()).toHaveLength(hand + 3 + 1); // 3 Deathknell draws + Draw step
  });
});
