/**
 * Harness self-tests: L1 decision derivation + the play bundle.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, PickDecision } from "../../harness";
import { HarnessError, P1, P2, scenario } from "../../harness";
import { peekCurrentState, replaceCurrentState } from "../../harness/internal";
import type { RiftboundGameState } from "../../types";

const CLEAVE = "ogn-004-298"; // 1 energy: give a unit Assault 3 this turn
const REARGUARD = "ogn-010-298"; // 2 energy unit, Accelerate [1][fury]
const SKULKER = "ogn-175-298"; // vanilla 3-might unit
const BULLET_TIME = "ogn-268-298"; // 1 energy: pay X, deal X to enemy units at a battlefield
const STACKED_DECK = "ogn-183-298"; // 1 energy: look at 3, draw 1, recycle rest → reveal-and-pick
const PIT_ROOKIE = "ogn-136-298"; // 2 energy unit: when played, buff another friendly unit → choose-target
const WILDCLAW = "ogn-147-298"; // 4 energy unit with an optional play trigger → opt-in
const FALLEN_FELINE = "ven-132-166"; // 2 energy [order] unit: when played, name a spell → name-card
const SENTINEL_ADEPT = "sfd-008-221"; // 3 energy Weaponmaster unit → weaponmaster-equip
const SERRATED_DIRK = "sfd-009-221"; // equipment
const KEEPERS_VERDICT = "unl-204-219"; // 2 + [rainbow][rainbow]: recycle enemy unit, OWNER picks top/bottom → choose-destination for P2
const BLIND_MONK = "ogn-257-298"; // legend: [1], exhaust: buff a friendly unit
const HEART_OF_DARK_ICE = "sfd-052-221"; // gear: exhaust: give a unit +3 might this turn

describe("action decisions: grouping and the play bundle", () => {
  test("main-phase menu groups engine variants per (move, card) with fields", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P1, "base", { might: 3 }, "ally2")
      .unit(P2, "bf1", SKULKER, "e1")
      .hand(P1, CLEAVE, "cleave")
      .hand(P1, REARGUARD, "rear")
      .build();
    const d = game.decision() as ActionDecision;
    expect(d.kind).toBe("action");
    expect(d.context).toBe("main");
    expect(d.seat).toBe(P1);
    expect(d.timing).toBe("ACT");
    expect(d.endTurnKey).toBe("endTurn:-");
    expect(d.options.map((o) => o.key)).toEqual([
      "concede:-",
      "endTurn:-",
      "playSpell:cleave",
      "playUnit:rear",
      "standardMove:to:bf1",
    ]);
    const cleave = game.p1.option("cast", "cleave");
    expect(cleave?.variantCount).toBe(3);
    expect(cleave?.fields).toEqual([
      { arg: "targets", kind: "cards", max: 1, min: 1, name: "targets", options: [["ally"], ["ally2"], ["e1"]], required: true },
    ]);
    const rear = game.p1.option("play", "rear");
    expect(rear?.fields.find((f) => f.arg === "payOptional")?.options).toEqual([false, true]);
    const move = game.p1.option("move");
    expect(move?.fields[0]?.options).toEqual([["ally"], ["ally2"], ["ally", "ally2"]]);
    // P2 could only concede → no decision / empty menu.
    expect(game.p2.legal()).toEqual([]);
    expect(game.p2.decision()).toBeNull();
    expect(game.p2.isActing()).toBe(false);
  });

  test("cast with targets executes exactly one variant; omitting targets is AMBIGUOUS with the legal choices listed", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "base", { might: 2 }, "foe")
      .hand(P1, CLEAVE, "cleave")
      .build();
    const amb = await game.p1.try((s) => s.cast("cleave"));
    expect(amb.ok).toBe(false);
    expect(!amb.ok && amb.error.code).toBe("AMBIGUOUS_ACTION");
    expect(!amb.ok && amb.error.message).toContain("needs `targets`");
    expect(!amb.ok && amb.error.message).toContain("ally | foe");
    // Nothing was executed or parked by the failed attempt.
    expect(game.seq).toBe(0);
    expect(game.decision()?.kind).toBe("action");

    const r = await game.p1.cast("cleave", { targets: "foe" });
    expect(r.executed).toEqual([{ moveId: "playSpell", params: { cardId: "cleave", playerId: P1, targets: ["foe"] }, seat: P1 }]);
    expect(game.zoneOf("cleave")).toBe("chain");
    const chain = game.decision() as ActionDecision;
    expect(chain.context).toBe("chain");
    expect(chain.seat).toBe(P1);
    expect(chain.passKey).toBe("passChainPriority:-");
    expect(chain.source?.cardId).toBe("cleave");
    await game.p1.pass();
    expect(game.actingSeat()).toBe(P2);
    expect((game.p2.decision() as ActionDecision).context).toBe("chain");
    await game.p2.pass();
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("foe").keywords).toContain("Assault");
    // Illegal target → ILLEGAL_ARGS naming the field.
    const game2 = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", { might: 2 }, "ally").hand(P1, CLEAVE, "cleave").build();
    const bad = await game2.p1.try((s) => s.cast("cleave", { targets: "nobody" }));
    expect(!bad.ok && bad.error.code).toBe("ILLEGAL_ARGS");
  });

  test("agent-style follow-up: an incomplete action parks and degrades into a synthetic pick decision", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "base", { might: 2 }, "foe")
      .hand(P1, CLEAVE, "cleave")
      .build();
    const r1 = await game.act(P1, { key: "playSpell:cleave", kind: "action" });
    expect(r1.ok).toBe(true);
    expect(r1.ok && r1.executed).toEqual([]);
    const fu = r1.ok ? (r1.followUp as PickDecision) : undefined;
    expect(fu?.kind).toBe("pick");
    expect(fu?.synthetic).toBe(true);
    expect(fu?.timing).toBe("FIN");
    expect(fu?.semantics).toBe("follow-up");
    expect(fu?.meta?.arg).toBe("targets");
    expect(fu?.options.map((o) => o.key)).toEqual(["ally", "foe"]);
    expect(game.decision()?.id).toBe(fu?.id as string);
    // Other seats cannot answer it; a stale id is rejected.
    const wrongSeat = await game.act(P2, { keys: ["foe"], kind: "pick" });
    expect(!wrongSeat.ok && wrongSeat.error.code).toBe("NOT_YOUR_DECISION");
    const stale = await game.act(P1, { decisionId: "d0:player-1:action", keys: ["foe"], kind: "pick" });
    expect(!stale.ok && stale.error.code).toBe("STALE_DECISION");
    const r2 = await game.act(P1, { decisionId: fu?.id, keys: ["foe"], kind: "pick" });
    expect(r2.ok && r2.executed[0]?.params).toEqual({ cardId: "cleave", playerId: P1, targets: ["foe"] });
    // Transcript records the completed bundle, so replay needs no follow-up.
    expect(game.transcript().steps[0]?.answer).toEqual({
      args: { params: { targets: ["foe"] } },
      key: "playSpell:cleave",
      kind: "action",
    });
    // Declining a follow-up cancels the parked action.
    const game2 = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", { might: 2 }, "a").unit(P1, "base", { might: 2 }, "b").hand(P1, CLEAVE, "cleave").build();
    await game2.act(P1, { key: "playSpell:cleave", kind: "action" });
    expect(game2.decision()?.synthetic).toBe(true);
    const cancel = await game2.act(P1, { kind: "decline" });
    expect(cancel.ok && cancel.executed).toEqual([]);
    expect(game2.decision()?.kind).toBe("action");
    expect(game2.zoneOf("cleave")).toBe("hand");
  });

  test("Accelerate: base variant enters exhausted; {accelerate:true} picks the paid variant and enters ready", async () => {
    const base = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, REARGUARD, "rear").build();
    await base.p1.play("rear");
    expect(base.state("rear").zone).toBe("base");
    expect(base.state("rear").isReady).toBe(false);
    expect(base.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });

    const paid = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, REARGUARD, "rear").build();
    const r = await paid.p1.play("rear", { accelerate: true });
    expect(r.executed[0]?.params).toMatchObject({ additionalCostSpec: { energy: 1, power: ["fury"] }, paidAdditionalCost: true });
    expect(paid.state("rear").isReady).toBe(true);
    expect(paid.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });

    // Unaffordable Accelerate: only the base variant exists → asking for it is ILLEGAL_ARGS.
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, REARGUARD, "rear").build();
    const t = await poor.p1.try((s) => s.play("rear", { accelerate: true }));
    expect(!t.ok && t.error.code).toBe("ILLEGAL_ARGS");
  });

  test("standardMove: multi-unit subset match, single unit, and combat auto-procedure", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "u1")
      .unit(P1, "base", { might: 3 }, "u2")
      .unit(P1, "base", { might: 1 }, "u3")
      .unit(P2, "bf1", { might: 4 }, "e1")
      .build();
    const r = await game.p1.move(["u2", "u1"], "bf1"); // order-insensitive
    expect(r.executed[0]?.params).toMatchObject({ destination: "bf1", unitIds: ["u1", "u2"] });
    expect(game.locationOf("u1")).toBe("bf1");
    expect(game.locationOf("u3")).toBe("base");
    expect(game.state("u1").isExhausted).toBe(true);
    const sd = game.decision() as ActionDecision;
    expect(sd.context).toBe("showdown");
    expect(sd.seat).toBe(P1); // attacker has Focus
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    // Nobody may end the turn or move again during the showdown.
    expect(game.p1.can("endTurn")).toBe(false);
    const s = await game.settle();
    expect(s.reason).toBe("open");
    const last = game.transcript().steps.at(-1);
    expect(last?.executed.map((e) => e.moveId)).toEqual(["passShowdownFocus", "resolveFullCombat"]);
    expect(last?.executed[1]?.auto).toBe(true);
    // 5 might vs 4: e1 dies, P1 conquers and scores.
    expect(game.zoneOf("e1")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("X spells: field exposes probed range; cast({x}) charges X; agents get an integer follow-up", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5 }, "big")
      .hand(P1, BULLET_TIME, "bt")
      .build();
    const opt = game.p1.option("cast", "bt");
    expect(opt?.fields).toEqual([{ arg: "x", kind: "int", max: 3, min: 0, name: "xAmount", required: true }]);
    const amb = await game.p1.try((s) => s.cast("bt"));
    expect(!amb.ok && amb.error.message).toContain("needs `x` — one of: 0..3");
    const tooMuch = await game.p1.try((s) => s.cast("bt", { x: 4 }));
    expect(!tooMuch.ok && tooMuch.error.code).toBe("ILLEGAL_ARGS");

    const r1 = await game.act(P1, { key: "playSpell:bt", kind: "action" });
    expect(r1.ok && r1.followUp?.kind).toBe("integer");
    expect(r1.ok && r1.followUp?.kind === "integer" && r1.followUp.max).toBe(3);
    await game.p1.chooseX(3);
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("big").damage).toBe(3);
  });
});

describe("pending-choice decisions (one per engine PendingChoice type)", () => {
  test("reveal-and-pick (Stacked Deck): chooser sees identities, opponent sees a summary; pick draws, rest recycle", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .hand(P1, STACKED_DECK, "sd")
      .deck(P1, [CLEAVE, REARGUARD, SKULKER], ["d0", "d1", "d2"])
      .build();
    await game.p1.cast("sd");
    const s = await game.settle();
    expect(s.reason).toBe("unanswered");
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({
      allowDecline: false,
      kind: "pick",
      max: 1,
      min: 1,
      seat: P1,
      semantics: "from-revealed",
      source: { cardId: "sd", pendingChoiceType: "reveal-and-pick" },
      timing: "RES",
    });
    expect(d.options.map((o) => [o.key, o.label])).toEqual([
      ["d0", "Cleave [d0]"],
      ["d1", "Legion Rearguard [d1]"],
      ["d2", "Shipyard Skulker [d2]"],
    ]);
    expect(game.p2.view().decision).toEqual({ context: undefined, id: d.id, kind: "pick", prompt: d.prompt, seat: P1 });
    expect(game.p2.decision()).toBeNull();
    // While the choice is pending nobody has any other move (invariant also checks this every step).
    expect(game.p1.legal()).toEqual([]);
    await game.p1.pick("d1");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck().slice(-2)).toEqual(["d0", "d2"]);
    expect(game.violations()).toEqual([]);
  });

  test("choose-target from a play trigger (Pit Rookie) and from an activated legend ability (Blind Monk)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .legend(P1, BLIND_MONK, "monk")
      .unit(P1, "base", { might: 1 }, "a")
      .unit(P1, "base", { might: 1 }, "b")
      .hand(P1, PIT_ROOKIE, "rookie")
      .build();
    await game.p1.play("rookie");
    await game.settle();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "rookie", pendingChoiceType: "choose-target" } });
    expect(d.options.map((o) => o.key).sort()).toEqual(["a", "b"]);
    await game.p1.pick("b");
    expect(game.state("b").isBuffed).toBe(true);
    expect(game.state("a").isBuffed).toBe(false);

    // Activated ability with the answer supplied up-front via `answers` (one call, XMage style).
    expect(game.p1.can("activate", "monk")).toBe(true);
    await game.p1.activate("monk", 0, { answers: ["a"] });
    await game.settle(); // resolves; the queued "a" answers the choose-target prompt
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("a").isBuffed).toBe(true);
    expect(game.state("monk").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
  });

  // rule-id: sfd-052-221 (rule 355.10.f / 355.14.b) — an activated ability's
  // caster-chosen target is locked when it is finalized on the chain, so the
  // chain item carries the target and resolution never prompts.
  test("activated ability binds its chosen target at activation, not at resolution (Heart of Dark Ice)", async () => {
    const game = await scenario()
      .gear(P1, HEART_OF_DARK_ICE, "heart")
      .unit(P1, "base", { might: 1 }, "a")
      .unit(P1, "base", { might: 1 }, "b")
      .build();
    const variants = game.p1.option("activateAbility", "heart")?.variants ?? [];
    expect(variants.map((m) => (m.params.targets as string[])[0]).sort()).toEqual(["a", "b"]);
    await game.p1.activate("heart", 0, { targets: ["b"] });
    const item = game.gameState.interaction?.chain?.items.at(-1);
    expect(item?.targets).toEqual(["b"]);
    expect(game.gameState.pendingChoice).toBeUndefined();
    await game.settle();
    expect(game.gameState.pendingChoice).toBeUndefined();
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("b").might).toBe(4);
    expect(game.state("a").might).toBe(1);
  });

  test("opt-in (Wildclaw Shaman optional trigger) → yes-no", async () => {
    // rule-id: ogn-147-298 — the "spend a buff" opt-in is only offered when a
    // friendly buff exists to spend.
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .unit(P1, "base", { might: 1 }, "donor", { buffed: true })
      .hand(P1, WILDCLAW, "wc")
      .build();
    await game.p1.play("wc");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "wc", pendingChoiceType: "opt-in" }, timing: "RES" });
    await game.p1.no();
    expect(game.decision()?.kind).toBe("action");
    expect(game.gameState.pendingChoice).toBeUndefined();

    // No buff on board → cost unpayable → no prompt at all.
    const bare = await scenario().resources(P1, { energy: 4 }).hand(P1, WILDCLAW, "wc").build();
    await bare.p1.play("wc");
    await bare.settle();
    expect(bare.gameState.pendingChoice).toBeUndefined();
    expect(bare.decision()?.kind).toBe("action");
  });

  test("name-card (Fallen Feline) → name decision with the registry vocabulary", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .hand(P1, FALLEN_FELINE, "ff")
      .hand(P2, CLEAVE, "theirs")
      .build();
    await game.p1.play("ff");
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("name");
    expect(d?.kind === "name" && d.vocabulary).toContain("Cleave");
    await game.p1.name("Cleave");
    expect(game.state("ff").meta.namedCard).toBe("Cleave");
  });

  test("weaponmaster-equip → optional pick; decline leaves gear unattached, pick attaches", async () => {
    const declined = await scenario().resources(P1, { energy: 3 }).gear(P1, SERRATED_DIRK, "dirk").hand(P1, SENTINEL_ADEPT, "adept").build();
    await declined.p1.play("adept");
    expect(declined.decision()).toMatchObject({ allowDecline: true, kind: "pick", min: 0, semantics: "equip" });
    await declined.p1.decline();
    expect(declined.state("dirk").attachedTo).toBeUndefined();

    const picked = await scenario().resources(P1, { energy: 3 }).gear(P1, SERRATED_DIRK, "dirk").hand(P1, SENTINEL_ADEPT, "adept").build();
    await picked.p1.play("adept", { answers: ["dirk"] });
    expect(picked.state("dirk").attachedTo).toBe("adept");
    expect(picked.state("adept").attachments).toEqual(["dirk"]);
  });

  // rule-id: sfd-119-221-weaponmaster-pays-reduced-equip-cost
  test("weaponmaster-equip pays the Equip cost reduced by [A] (rule 821.1.c) and gates on payability", async () => {
    const BATTLEAXE = "unl-019-219"; // Equip [1][fury] → reduced to [1]
    const paid = await scenario().resources(P1, { energy: 4 }).gear(P1, BATTLEAXE, "axe").hand(P1, SENTINEL_ADEPT, "adept").build();
    await paid.p1.play("adept", { answers: ["axe"] });
    expect(paid.state("axe").attachedTo).toBe("adept");
    expect(paid.p1.energy()).toBe(0);

    const broke = await scenario().resources(P1, { energy: 3 }).gear(P1, BATTLEAXE, "axe").hand(P1, SENTINEL_ADEPT, "adept").build();
    await broke.p1.play("adept");
    const d = broke.decision() as PickDecision | null;
    expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).not.toContain("axe");
    const rejected = await broke.p1.try((p) => p.answer("axe"));
    expect(rejected.ok).toBe(false);
    expect(broke.state("axe").attachedTo).toBeUndefined();
  });

  test("choose-destination owned by the NON-caster (Keeper's Verdict: owner picks top/bottom)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", SKULKER, "e1")
      .hand(P1, KEEPERS_VERDICT, "kv")
      .script(P2, ["pass"]) // P2 passes priority on the spell…
      .build();
    await game.p1.cast("kv", { targets: "e1" });
    const s = await game.settle(); // …but has no scripted answer for the destination prompt
    expect(s.reason).toBe("unanswered");
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "destination" });
    expect(d.options.map((o) => o.key)).toEqual(["mainDeck-top", "mainDeck-bottom"]);
    expect(game.actingSeat()).toBe(P2);
    const wrong = await game.p1.try((p) => p.answer("mainDeck-top"));
    expect(!wrong.ok && wrong.error.code).toBe("NOT_YOUR_DECISION");
    await game.p2.answer("mainDeck-bottom");
    expect(game.zoneOf("e1")).toBe("mainDeck");
    expect(game.p2.deck().at(-1)).toBe("e1");
  });

  test("choose-mode and distribute shapes derive from synthetic engine state (no producer reachable today)", async () => {
    const game = await scenario().unit(P1, "base", { might: 1 }, "a").unit(P2, "base", { might: 1 }, "b").hand(P1, CLEAVE, "src").build();
    const inject = (pc: RiftboundGameState["pendingChoice"]) => {
      const st = structuredClone(peekCurrentState(game.engine)) as RiftboundGameState;
      (st as { pendingChoice?: RiftboundGameState["pendingChoice"] }).pendingChoice = pc;
      replaceCurrentState(game.engine, st);
    };
    inject({
      effect: { options: [{ effect: { amount: 1, type: "draw" }, label: "Cards" }, { effect: { amount: 1, type: "channel" }, label: "Runes" }], type: "choice" },
      options: [0, 1],
      playerId: P2,
      sourceCardId: "src",
      type: "choose-mode",
    });
    const mode = game.decision() as PickDecision;
    expect(mode).toMatchObject({ kind: "pick", seat: P2, semantics: "mode" });
    expect(mode.options).toEqual([
      { key: "0", label: "Cards", mode: 0 },
      { key: "1", label: "Runes", mode: 1 },
    ]);
    const r = await game.p2.chooseMode(1);
    expect(r.executed[0]).toEqual({ moveId: "resolvePendingChoice", params: { pickedMode: 1, playerId: P2 }, seat: P2 });
    expect(game.gameState.pendingChoice).toBeUndefined();

    inject({
      assign: true,
      boundTargets: ["a"],
      effect: { amount: 1, target: { type: "unit" }, type: "damage" },
      options: ["a", "b"],
      playerId: P1,
      remaining: 1,
      sourceCardId: "src",
      type: "choose-target",
    });
    const dist = game.decision();
    expect(dist).toMatchObject({ kind: "distribute", seat: P1, total: 1 });
    expect(dist?.kind === "distribute" && dist.buckets.map((b) => b.key)).toEqual(["a", "b"]);
    const r2 = await game.p1.distribute({ b: 1 });
    expect(r2.executed[0]?.params).toEqual({ pickedCardId: "b", playerId: P1 });
  });
});

describe("errors are explanatory", () => {
  test("acting out of turn / on an unplayable card names the reason and the legal menu", async () => {
    const game = await scenario().resources(P1, { energy: 0 }).hand(P1, CLEAVE, "cleave").hand(P2, CLEAVE, "theirs").unit(P1, "base", { might: 1 }, "u").build();
    const noEnergy = await game.p1.try((s) => s.cast("cleave", { targets: "u" }));
    expect(!noEnergy.ok && noEnergy.error).toBeInstanceOf(HarnessError);
    expect(!noEnergy.ok && noEnergy.error.code).toBe("UNKNOWN_OPTION");
    expect(!noEnergy.ok && noEnergy.error.message).toMatch(/not legal for player-1.*energy 0/);
    const notTurn = await game.p2.try((s) => s.cast("theirs", { targets: "u" }));
    expect(!notTurn.ok && notTurn.error.message).toContain("current decision: player-1 action(main)");
    const noCard = await game.p1.try((s) => s.play("ghost"));
    expect(!noCard.ok && noCard.error.code).toBe("CARD_NOT_FOUND");
    const wrongKind = await game.p1.try((s) => s.yes());
    expect(!wrongKind.ok && wrongKind.error.code).toBe("WRONG_ANSWER_KIND");
  });
});
