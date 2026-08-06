/**
 * Harness self-tests: L3 scenario builder placement.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

describe("scenario builder: position", () => {
  test("defaults to turn 2 / main / P1 active with empty pools", async () => {
    const game = await scenario().build();
    expect(game.turnNumber()).toBe(2);
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.status).toBe("playing");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.actingSeat()).toBe(P1);
  });

  test("turn / phase / active / resources / points / xp / victoryScore are applied", async () => {
    const game = await scenario()
      .turn(5)
      .active(P2)
      .resources(P1, { energy: 3, power: { fury: 2 } })
      .resources(P2, { energy: 1, power: { rainbow: 1 } })
      .points(P1, 6)
      .xp(P2, 4)
      .victoryScore(11)
      .build();
    expect(game.turnNumber()).toBe(5);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 2 } });
    expect(game.p2.power("rainbow")).toBe(1);
    expect(game.p1.points()).toBe(6);
    expect(game.p2.xp()).toBe(4);
    expect(game.gameState.victoryScore).toBe(11);
    // Flow manager agrees with the patched position (endTurn is offered to P2, not P1).
    expect(game.p2.can("endTurn")).toBe(true);
    expect(game.p1.can("endTurn")).toBe(false);
  });
});

describe("scenario builder: cards", () => {
  test("real definitions by id land in the requested zones under their alias", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .hand(P1, "ogn-004-298", "cleave")
      .unit(P2, "bf1", "ogn-175-298", "skulker")
      .trash(P1, "ogn-010-298", "dead")
      .legend(P1, "ogn-251-298", "lc")
      .champion(P1, "ogn-030-298", "jinx")
      .build();
    expect(game.zoneOf("cleave")).toBe("hand");
    expect(game.p1.hand()).toEqual(["cleave"]);
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.locationOf("skulker")).toBe("bf1");
    expect(game.p2.units("bf1")).toEqual(["skulker"]);
    expect(game.p1.trash()).toEqual(["dead"]);
    expect(game.p1.legend()).toBe("lc");
    expect(game.p1.champion()).toBe("jinx");
    const s = game.state("skulker");
    expect(s.name).toBe("Shipyard Skulker");
    expect(s.defId).toBe("ogn-175-298");
    expect(s.baseMight).toBe(3);
    expect(s.might).toBe(3);
    expect(s.owner).toBe(P2);
    expect(s.cardType).toBe("unit");
    expect(game.state("cleave").energyCost).toBe(1);
    expect(game.state("cleave").rulesText).toContain("Assault 3");
  });

  test("inline definitions and meta (damage / exhausted / buffed) are honoured by CardState", async () => {
    const game = await scenario()
      .battlefield("bf1")
      .unit(P1, "base", { keywords: ["Tank"], might: 4, name: "Brute" }, "brute", {
        buffed: true,
        damage: 2,
        exhausted: true,
      })
      .unit(P1, "bf1", { might: 1 }, "scout")
      .build();
    const b = game.state("brute");
    expect(b.name).toBe("Brute");
    expect(b.baseMight).toBe(4);
    expect(b.might).toBe(5); // +1 buff
    expect(b.damage).toBe(2);
    expect(b.isExhausted).toBe(true);
    expect(b.isTapped).toBe(true);
    expect(b.isReady).toBe(false);
    expect(b.isBuffed).toBe(true);
    expect(b.keywords).toContain("Tank");
    expect(b.location).toBe("base");
    // The engine agrees the exhausted unit cannot move but the ready one can.
    expect(game.p1.option("move")?.fields.find((f) => f.arg === "units")?.options).toEqual([["scout"]]);
  });

  test("battlefields: controller, inert by default, zones created, listed for both seats", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null, def: "ogn-294-298" })
      .build();
    expect(game.battlefields()).toEqual(["bf1", "bf2"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf2?.controller).toBeNull();
    expect(game.p1.battlefields({ controlled: true })).toEqual(["bf1"]);
    expect(game.cardsAt("battlefieldRow")).toEqual(["bf1", "bf2"]);
    expect(game.state("bf2").name).toBe("Trifarian War Camp");
    expect(game.p1.listZones({ all: true }).some((z) => z.zone === "battlefield-bf2")).toBe(true);
    expect(game.p1.listZones({ all: true }).some((z) => z.zone === "facedown-bf1")).toBe(true);
  });

  test("deck order is top-first and filler pads decks and rune decks", async () => {
    const game = await scenario()
      .deck(P1, ["ogn-004-298", "ogn-010-298"], ["top", "second"])
      .fillDecks({ main: 5, runes: 3 })
      .build();
    expect(game.p1.deck().slice(0, 2)).toEqual(["top", "second"]);
    expect(game.p1.deck()).toHaveLength(5);
    expect(game.p2.deck()).toHaveLength(5);
    expect(game.p1.runeDeck()).toHaveLength(3);
    expect(game.state(game.p1.runeDeck()[0] as string).cardType).toBe("rune");
  });

  test("fillDecks(false) leaves decks empty", async () => {
    const game = await scenario().fillDecks(false).build();
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.runeDeck()).toEqual([]);
  });

  test("runes in the pool are tappable and carry their domain", async () => {
    const game = await scenario().runes(P1, "fury", 2).rune(P1, "calm", { alias: "calm1", exhausted: true }).build();
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.state("calm1").domains).toEqual(["calm"]);
    expect(game.state("calm1").isExhausted).toBe(true);
    await game.p1.tapRune();
    expect(game.p1.energy()).toBe(1);
    await game.p1.tapRune({ domain: "fury" });
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    await game.p1.recycleRune("calm1");
    expect(game.p1.power("calm")).toBe(1);
    expect(game.zoneOf("calm1")).toBe("runeDeck");
  });

  test("facedown placement is hidden from the opponent but visible to the owner", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .facedown(P1, "bf1", "ogn-053-298", "hidden1")
      .build();
    expect(game.zoneOf("hidden1")).toBe("facedown-bf1");
    expect(game.state("hidden1").isHidden).toBe(true);
    expect(game.p1.facedown("bf1")).toEqual(["hidden1"]);
    const p2view = game.p2.view().zones["facedown-bf1"] ?? [];
    expect(p2view).toHaveLength(1);
    expect("id" in (p2view[0] as object)).toBe(false);
    const p1view = game.p1.view().zones["facedown-bf1"] ?? [];
    expect((p1view[0] as { id?: string }).id).toBe("hidden1");
  });

  test("find() by name / defId / owner / zone; duplicate aliases and unknown defs are rejected", async () => {
    const game = await scenario()
      .hand(P1, "ogn-004-298", "c1")
      .hand(P2, "ogn-004-298", "c2")
      .build();
    expect(game.find({ name: "Cleave", owner: P2 })).toBe("c2");
    expect(game.findAll({ defId: "ogn-004-298" }).sort()).toEqual(["c1", "c2"]);
    expect(() => game.find({ name: "Cleave" })).toThrow(/exactly one/);
    expect(() => game.card("nope")).toThrow(/CARD_NOT_FOUND/);
    await expect(scenario().hand(P1, "ogn-004-298", "x").hand(P1, "ogn-004-298", "x").build()).rejects.toThrow(/Duplicate/);
    await expect(scenario().hand(P1, "not-a-card").build()).rejects.toThrow(/not in card pool/);
    await expect(scenario().unit(P1, "bf9", { might: 1 }).build()).rejects.toThrow(/does not exist/);
  });

  test("toSpec() is JSON-serialisable and embedded in the transcript origin", async () => {
    const b = scenario({ seed: "abc" }).battlefield("bf1").hand(P1, "ogn-004-298", "cleave");
    const spec = b.toSpec();
    expect(JSON.parse(JSON.stringify(spec))).toEqual(spec);
    const game = await b.build();
    const t = game.transcript();
    expect(t.origin.kind).toBe("scenario");
    expect(t.steps).toEqual([]);
    expect(t.initialHash).toBe(game.stateHash());
  });
});
