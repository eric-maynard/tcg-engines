/**
 * Interaction: Fiora, Worthy (sfd-180-221) — "When a unit you control becomes [Mighty], you may pay
 *   [order] to ready it. (A unit is Mighty while it has 5+ [Might].)"
 *   × Sett, Brawler (ogn-164-298, printed 4) — "When I'm played and when I conquer, buff me. (If I don't
 *     have a buff, I get a +1 [Might] buff.)  Spend my buff: Give me +4 [Might] this turn."
 *   × Discipline (ogn-058-298) — "Give a unit +2 [Might] this turn. Draw 1." (contrast line)
 *
 * Question: Sett is played at 4, his play trigger buffs him to 5 — does Fiora trigger and can the [order]
 * ready him the turn he was played? Then he conquers, and P1 SPENDS the buff (cost: 5 → 4) for +4 this
 * turn (→ 8): does he "become Mighty" AGAIN (second Fiora trigger, second [order], readied again)?
 * Contrast: Discipline on the 5-Might Sett (5 → 7) — no trigger. End of turn: 8 → 4, nothing triggers.
 *
 * Rules: 708 (is Mighty: ≥ 5), 709 (becomes Mighty = crosses from < 5 to ≥ 5; already-Mighty growth
 * does not), 710 (current Might on the board is what counts; expiry can drop it back), 404.1 (an
 * activated ability's cost — here "spend my buff" — is paid at activation, before it resolves), 383.3
 * (optional triggered ability with a cost), 415 (Ready), 317.2.c (step 3d: "this turn" effects expire),
 * 383.4.a.2 (a permanent's play trigger is put on the chain after it enters).
 *
 * Might timeline asserted for Sett: 4 (enters) → 5 (play buff; Fiora #1) → [move/conquer: still 5] →
 * 4 (buff spent as COST) → 8 (resolution; Fiora #2) → 4 (end of turn; no trigger).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FIORA = "sfd-180-221";
const SETT = "ogn-164-298";
const DISCIPLINE = "ogn-058-298";
const SPEND_BUFF = 1; // Sett's activated ability index (index 0 is the play/conquer trigger)

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn. Fiora (ready) in base; Sett + Discipline in hand; 5+[body] for Sett, 2 for Discipline,
 * and exactly [order][order] floating for two Fiora payments. bf2 is empty and uncontrolled.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { body: 1, order: 2 } })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", FIORA, "fiora")
    .hand(P1, SETT, "sett")
    .hand(P1, DISCIPLINE, "disc");
}

/** Pass priority around until Fiora's "pay [order]?" is asked (true) or the open main phase returns (false). */
async function untilFioraAsks(game: Game): Promise<boolean> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      return false;
    }
    if (d.kind === "yes-no") {
      expect(d).toMatchObject({ seat: P1, source: { cardId: "fiora" } });
      return true;
    }
    if (d.kind !== "action") {
      throw new Error(`unexpected ${d.kind} prompt: ${d.prompt}`);
    }
    await game.seat(d.seat).pass();
  }
  return false;
}

/** Line (a): play Sett, let the buff land, pay Fiora's first [order] and resolve the ready. */
async function playSettAndReadyHim(game: Game): Promise<void> {
  await game.p1.play("sett");
  expect(await untilFioraAsks(game)).toBe(true);
  await game.p1.yes();
  await game.settle();
  expect(game.state("sett")).toMatchObject({ isBuffed: true, isReady: true, might: 5 });
  expect(game.p1.power("order")).toBe(1);
}

/** Line (b) up to the activation: Sett standard-moves to empty bf2 and conquers it. */
async function conquerBf2(game: Game): Promise<void> {
  await game.p1.move("sett", "bf2");
  await game.settle();
  expect(game.locationOf("sett")).toBe("bf2");
  expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
}

describe("Fiora, Worthy × Sett, Brawler — becoming Mighty twice in one turn (play buff, then spend-buff +4)", () => {
  // ---------------------------------------------------------------- (a)
  test("(a) Sett ENTERS at 4, exhausted, unbuffed — not Mighty as he is played; only his own play trigger is on the chain, Fiora has not triggered", async () => {
    const game = await board().build();
    await game.p1.play("sett");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { body: 0, order: 2 } });
    expect(game.zoneOf("sett")).toBe("base");
    expect(game.state("sett")).toMatchObject({ isBuffed: false, isExhausted: true, might: 4 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sett", controller: P1, triggered: true })]);
  });

  test("(a) the play trigger resolves: +1 buff → 4→5 = 'becomes Mighty' (709) → Fiora's trigger is a NEW chain item P2 may respond to; Sett is still exhausted meanwhile", async () => {
    const game = await board().build();
    await game.p1.play("sett");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Sett's "buff me" resolves
    expect(game.state("sett")).toMatchObject({ isBuffed: true, isExhausted: true, might: 5 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fiora", controller: P1, triggered: true })]);
    // 383.3.b.1 — the optional cost is asked as the trigger is finalized …
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.p1.power("order")).toBe(1); // paid now
    expect(game.state("sett").isExhausted).toBe(true); // … but the ready waits for resolution
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2 may react
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("sett")).toMatchObject({ isBuffed: true, isReady: true, might: 5 }); // 415
    expect(game.state("fiora").isReady).toBe(true); // "ready IT" — Fiora was never touched
  });

  test("(a) yes, the same turn he was played: the readied Sett can Standard-Move immediately and conquers empty bf2", async () => {
    const game = await board().build();
    await playSettAndReadyHim(game);
    expect(game.p1.can("move")).toBe(true);
    const pts = game.p1.points();
    await conquerBf2(game);
    expect(game.p1.points()).toBe(pts + 1);
    expect(game.violations()).toEqual([]);
  });

  test("(a) declining Fiora keeps both [order] and leaves the 5-Might Sett exhausted (he cannot move this turn)", async () => {
    const game = await board().build();
    await game.p1.play("sett");
    expect(await untilFioraAsks(game)).toBe(true);
    await game.p1.no();
    await game.settle();
    expect(game.state("sett")).toMatchObject({ isBuffed: true, isExhausted: true, might: 5 });
    expect(game.p1.power("order")).toBe(2);
    await expect(game.p1.move("sett", "bf2")).rejects.toThrow(); // exhausted units cannot Standard-Move
    expect(game.locationOf("sett")).toBe("base");
  });

  // ---------------------------------------------------------------- (b)
  test("(b) the move exhausts Sett and conquers; 'when I conquer, buff me' finds him already buffed → still exactly 5, and Fiora does NOT trigger (no Might change, already Mighty)", async () => {
    const game = await board().build();
    await playSettAndReadyHim(game);
    await conquerBf2(game);
    expect(game.state("sett")).toMatchObject({ isBuffed: true, isExhausted: true, might: 5 });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.power("order")).toBe(1); // nothing was asked
  });

  test("(b) activating 'Spend my buff' pays the buff as the COST (404.1): 5 → 4 at activation, ability on the chain, P2 may respond; ceasing to be Mighty triggers nothing", async () => {
    const game = await board().build();
    await playSettAndReadyHim(game);
    await conquerBf2(game);
    expect(game.p1.can("activate", "sett")).toBe(true);
    await game.p1.activate("sett", SPEND_BUFF);
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 4 }); // 708/710: no longer Mighty
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sett", controller: P1, triggered: false })]);
    expect(game.p1.power("order")).toBe(1);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sett"]); // no Fiora item for 5 → 4
  });

  test("(b) resolution: +4 this turn → 4→8 crosses the threshold AGAIN (709) → Fiora triggers a SECOND time; paying the second [order] readies the (move-exhausted) Sett again", async () => {
    const game = await board().build();
    await playSettAndReadyHim(game);
    await conquerBf2(game);
    await game.p1.activate("sett", SPEND_BUFF);
    expect(game.state("sett").might).toBe(4);
    await game.p1.passPriority();
    await game.p2.passPriority(); // ability resolves
    expect(game.state("sett")).toMatchObject({ isExhausted: true, might: 8, mightModifier: 4 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fiora", triggered: true })]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.p1.power("order")).toBe(0); // second and last [order]
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("sett")).toMatchObject({ isBuffed: false, isReady: true, might: 8 });
    expect(game.locationOf("sett")).toBe("bf2");
    expect(game.violations()).toEqual([]);
  });

  test("(b) full Might timeline in one run: 4 → 5 → [cost] 4 → [resolve] 8, with exactly two Fiora asks this turn", async () => {
    const game = await board().build();
    const timeline: number[] = [];
    let asks = 0;
    await game.p1.play("sett");
    timeline.push(game.state("sett").might); // 4
    if (await untilFioraAsks(game)) {
      asks += 1;
      timeline.push(game.state("sett").might); // 5
      await game.p1.yes();
    }
    await game.settle();
    await conquerBf2(game);
    expect(await untilFioraAsks(game)).toBe(false); // conquer: nothing to ask
    await game.p1.activate("sett", SPEND_BUFF);
    timeline.push(game.state("sett").might); // 4
    if (await untilFioraAsks(game)) {
      asks += 1;
      timeline.push(game.state("sett").might); // 8
      await game.p1.yes();
    }
    await game.settle();
    expect(timeline).toEqual([4, 5, 4, 8]);
    expect(asks).toBe(2);
    expect(game.p1.power("order")).toBe(0);
    expect(game.state("sett").isReady).toBe(true);
  });

  // ---------------------------------------------------------------- (c)
  test("(c) contrast: Discipline on the 5-Might (buffed) Sett → 7 — already Mighty, so he does NOT 'become Mighty' (709 ex. 2): no Fiora trigger, [order] untouched, Sett stays exhausted from the move", async () => {
    const game = await board().build();
    await playSettAndReadyHim(game);
    await conquerBf2(game);
    const hand = game.p1.hand().length;
    await game.p1.cast("disc", { targets: "sett" });
    expect(await untilFioraAsks(game)).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.state("sett")).toMatchObject({ isBuffed: true, isExhausted: true, might: 7 });
    expect(game.p1.power("order")).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1); // Discipline's "Draw 1"
  });

  // ---------------------------------------------------------------- (d)
  test("(d) end of turn after (b): the '+4 this turn' expires at step 3d (317.2.c) → 8→4 (the buff was spent); he simply stops being Mighty (710) — no become-mighty event, no Fiora trigger, nothing on the chain", async () => {
    const game = await board().build();
    await playSettAndReadyHim(game);
    await conquerBf2(game);
    await game.p1.activate("sett", SPEND_BUFF);
    expect(await untilFioraAsks(game)).toBe(true);
    await game.p1.yes();
    await game.settle();
    expect(game.state("sett").might).toBe(8);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 4, mightModifier: 0 });
    const exp = game.trace().expiration;
    expect(exp).toHaveLength(1); // a single pass — nothing re-looped (317.2.f)
    expect(exp[0]?.expired).toContain("mightModifier:sett");
    expect(exp[0]?.events ?? []).not.toContain("become-mighty:sett");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("(d) end of turn after (c) instead: 7→5 at step 3d — still Mighty (buff kept), no event either way", async () => {
    const game = await board().build();
    await playSettAndReadyHim(game);
    await conquerBf2(game);
    await game.p1.cast("disc", { targets: "sett" });
    await game.settle();
    expect(game.state("sett").might).toBe(7);
    await game.advanceTurn();
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5, mightModifier: 0 });
    expect(game.trace().expiration[0]?.events ?? []).not.toContain("become-mighty:sett");
    expect(game.chain()).toEqual([]);
  });

  test("(d) the conquer path on its own: an UNBUFFED 4-Might Sett conquering re-buffs 4→5 → Fiora triggers again and [order] readies him at the battlefield", async () => {
    const game = await scenario()
      .resources(P1, { power: { order: 1 } })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", FIORA, "fiora")
      .unit(P1, "base", SETT, "sett") // printed 4, no buff
      .build();
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 4 });
    await game.p1.move("sett", "bf2");
    expect(await untilFioraAsks(game)).toBe(true);
    expect(game.state("sett")).toMatchObject({ isBuffed: true, isExhausted: true, might: 5 });
    await game.p1.yes();
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.state("sett")).toMatchObject({ isReady: true, might: 5 });
    expect(game.p1.power("order")).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("negative space — an ENEMY Fiora never triggers off my Sett becoming Mighty (play buff or spend-buff)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { body: 1 } })
      .resources(P2, { power: { order: 2 } })
      .unit(P2, "base", FIORA, "theirFiora")
      .hand(P1, SETT, "sett")
      .build();
    await game.p1.play("sett");
    expect(await untilFioraAsks(game)).toBe(false);
    expect(game.state("sett")).toMatchObject({ isBuffed: true, isExhausted: true, might: 5 });
    await game.p1.activate("sett", SPEND_BUFF);
    expect(await untilFioraAsks(game)).toBe(false);
    expect(game.state("sett")).toMatchObject({ isExhausted: true, might: 8 });
    expect(game.p2.power("order")).toBe(2);
  });
});
