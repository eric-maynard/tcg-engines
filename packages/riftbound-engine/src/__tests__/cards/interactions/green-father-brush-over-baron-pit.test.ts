/**
 * Interaction: Green Father (unl-195-219, Legend · Ivern) "When you conquer or hold, you may exhaust me to
 *     replace that battlefield with a Brush battlefield token. (… It can be swapped back when scored.)"
 *   × Baron Nashor (unl-147-219) "As you play me, add the Baron Pit battlefield token to the board if it's
 *     not there already. If you do, I enter there. (It has 'Units can move here from anywhere.') …"
 *   (tokens: Baron Pit unl-t01 "Units can move here from anywhere."; Brush unl-t03 "Bird, Cat, Dog, Poro,
 *    and Ivern units here have +1 [Might]. When you score here, you may replace this with the battlefield
 *    it replaced.")
 *
 * Rules: 438.1 / 438.1.a (Replace: the token is created in the replaced object's place and inherits every
 * status — control, units "here", pending references), 438.5 (the replaced object goes to Banishment) /
 * 438.5.a (a CARD waits there "as Replaced"), 438.6 / 186.1 (a TOKEN put anywhere but the board ceases to
 * exist) / 438.6.a (that does not undo or invalidate the replacement), 438.7.b (Swap Back needs the
 * replaced object waiting in Banishment) / 438.7.c (nothing there → the swap does nothing), 439.4 /
 * 439.4.b / 183 (a token is owned by the player whose effect created it; a battlefield token is created
 * uncontrolled), 187.8 / 187.9 (Brush / Baron Pit texts — abilities are the token's OWN).
 *
 * Story: P2 played Baron Nashor (Pit created, Baron entered, P2 conquered it); Baron then died (so the
 * empty Pit is uncontrolled again, 190.4.c). On P1's
 * turn a lone P1 unit walks into the empty Pit and conquers it; P1 exhausts Green Father → Brush.
 * Q (a) owner/controller/zone/existence of the Pit and of the Brush right after; does the Pit linger in
 *       Banishment; is the Brush valid; do P1's unit + control carry over; is "move here from anywhere"
 *       still on that slot?
 *   (b) Next turn P1 holds the Brush — can "replace this with the battlefield it replaced" bring the Pit back?
 *   (c) P2 plays a second Baron — is a NEW Pit created and does Baron enter there?
 *   (d) Contrast: Green Father brushes an ordinary battlefield CARD — can that one swap back?
 * Expected: (a) Pit → Banishment → being a token it ceases to exist (no Baron Pit anywhere, banishment
 * empty); Brush stands regardless (438.6.a): owner P1, controller P1, P1's unit still here, Brush text only
 * (Dog +1 here; no more "move here from anywhere"). (b) Never — nothing waits in Banishment (438.7.c).
 * (c) Yes — no Pit is on the board, so a fresh Pit is created and Baron enters it; board = Brush + new Pit.
 * (d) A card persists in Banishment as Replaced and swaps back on a later score (438.7.b).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GREEN_FATHER = "unl-195-219";
const BARON = "unl-147-219";
const VENGEANCE = "ogn-229-298"; // Order · 4 + [order][order] · Kill a unit. (P2 kills its own Baron — he is untargetable only for enemies)

/**
 * End of story set-up is played out for real from here: P2's turn 2 with Baron (+ a spare copy) and
 * Vengeance in hand and exactly 10+[chaos]×3 + 4+[order]×2. P1: legend Green Father, a 3-Might DOG
 * Ranger in base (Brush's aura will see it), and a Scout either in base or standing on bf1 (P1's).
 */
function board(opts: { scoutAt?: "base" | "bf1" } = {}) {
  const scoutAt = opts.scoutAt ?? "base";
  return scenario()
    .turn(2)
    .active(P2)
    .legend(P1, GREEN_FATHER, "gf")
    .battlefield("bf1", { controller: scoutAt === "bf1" ? P1 : null })
    .unit(P1, "base", { might: 3, name: "Ranger", tags: ["Dog"] }, "ranger")
    .unit(P1, scoutAt, { might: 2, name: "Scout" }, "scout")
    .resources(P2, { energy: 14, power: { chaos: 3, order: 2 } })
    .hand(P2, BARON, "baron")
    .hand(P2, BARON, "baron2")
    .hand(P2, VENGEANCE, "veng");
}

const PIT_ID = "token-bf-unl-t01"; // the id the engine mints for Baron's Pit token
const named = (game: Game, name: string) => game.findAll({ name });
const onRow = (game: Game, name: string) => game.battlefields().filter((id) => game.state(id).name === name);
const slotUnder = (game: Game, unit: string) => game.locationOf(unit) as string;

/** Answer every pending P1 Green Father opt-in with `value`, passing priority in between, until P1's open main phase. */
async function answerGreenFather(game: Game, value: boolean): Promise<number> {
  let asked = 0;
  for (let i = 0; i < 12; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "gf") {
      asked += 1;
      await (value ? game.p1.yes() : game.p1.no());
      continue;
    }
    if (r.reason !== "unanswered") {
      break;
    }
    break;
  }
  return asked;
}

/** P2: play Baron (Pit appears, he enters, Cleanup showdown conquers it), then Vengeance him; pass the turn to P1's main phase. */
async function pitLeftEmptyThenP1Turn(game: Game): Promise<void> {
  await game.p2.play("baron", { to: "base" });
  await game.settle(); // hands back the Cleanup-begun showdown once
  await game.settle();
  expect(game.state(PIT_ID)).toMatchObject({ isToken: true, name: "Baron Pit", owner: P2 });
  expect(game.gameState.battlefields[PIT_ID]?.controller).toBe(P2);
  expect(game.locationOf("baron")).toBe(PIT_ID);
  expect(game.p2.points()).toBe(1);
  await game.p2.cast("veng", { targets: "baron" });
  await game.settle();
  expect(game.zoneOf("baron")).toBe("trash");
  await game.p2.endTurn();
  await answerGreenFather(game, false); // a Scout holding bf1 would ask — keep bf1 as printed
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
}

/** P1's Ranger walks into the empty Pit, conquers it, and P1 exhausts Green Father → Brush. */
async function conquerPitAndBrushIt(game: Game): Promise<void> {
  await game.p1.move("ranger", PIT_ID);
  const asked = await answerGreenFather(game, true);
  expect(asked).toBe(1);
  await game.settle();
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
}

async function brushedPit(opts: { scoutAt?: "base" | "bf1" } = {}): Promise<Game> {
  const game = await board(opts).build();
  await pitLeftEmptyThenP1Turn(game);
  await conquerPitAndBrushIt(game);
  return game;
}

describe("Green Father's Brush over the Baron Pit token", () => {
  test("set-up plays out: P2's Baron creates the Pit token (owner P2), enters and conquers it; Baron dies; on P1's turn the Ranger conquers the empty Pit (+1) and Green Father asks", async () => {
    const game = await board().build();
    await pitLeftEmptyThenP1Turn(game);
    expect(onRow(game, "Baron Pit")).toEqual([PIT_ID]);
    expect(game.gameState.battlefields[PIT_ID]?.controller).toBeNull(); // 190.4.c: P2 lost control when Baron died and the Pit emptied
    await game.p1.move("ranger", PIT_ID);
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields[PIT_ID]?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "gf" } });
    expect(game.state("gf").isReady).toBe(true);
  });

  // ---------------------------------------------------------------- (a)
  test("(a) accepting exhausts Green Father and the slot the Ranger stands on is now a Brush battlefield TOKEN, still controlled by P1, Ranger still 'here', conquer point kept (438.1 / 438.1.a)", async () => {
    const game = await brushedPit();
    expect(game.state("gf").isExhausted).toBe(true);
    const slot = slotUnder(game, "ranger");
    expect(game.state(slot)).toMatchObject({ isToken: true, name: "Brush", zone: "battlefieldRow" });
    expect(game.gameState.battlefields[slot]?.controller).toBe(P1);
    expect(game.cardsAt(slot)).toEqual(["ranger"]);
    expect(game.p1.points()).toBe(1);
    expect(onRow(game, "Baron Pit")).toEqual([]); // the Pit is no longer on the board
    expect(game.battlefields()).toHaveLength(2); // bf1 + the Brush — replaced in place, not added
  });

  // BUG — expected (438.5 → 438.6 / 186.1): the replaced object is a TOKEN, so on reaching Banishment it
  // ceases to exist: nothing named "Baron Pit" remains anywhere and both banishment zones are empty.
  // Actual: the engine parks a non-token "Baron Pit" card (replaced-token-bf-unl-t01-0, owner P2) in banishment.
  test("(a) the replaced Baron Pit token must cease to exist — no 'Baron Pit' object anywhere, P1's and P2's banishment empty (438.6, 186.1)", async () => {
    const game = await brushedPit();
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
    expect(named(game, "Baron Pit")).toEqual([]);
  });

  test("(a) 438.6.a — the Pit evaporating does not invalidate the replacement: the Brush is a live battlefield with its OWN text (187.8) — the Dog Ranger here is 3 +1 = 4, the Scout in base stays 2", async () => {
    const game = await brushedPit();
    const slot = slotUnder(game, "ranger");
    expect(game.state(slot).name).toBe("Brush");
    expect(game.state("ranger").might).toBe(4);
    expect(game.state("scout").might).toBe(2);
  });

  // BUG — expected (183 / 439.4): the Brush token is created by P1's legend ability, so P1 OWNS it (and
  // controls it, inherited from the Pit's status). Actual: the engine re-skins the Pit's slot in place and
  // the Brush reads owner P2 (the Pit's creator).
  test("(a) the Brush token is OWNED by P1 (created by P1's Green Father, 439.4) and controlled by P1", async () => {
    const game = await brushedPit();
    const slot = slotUnder(game, "ranger");
    expect(game.gameState.battlefields[slot]?.controller).toBe(P1);
    expect(game.state(slot).owner).toBe(P1);
  });

  test("(a) while it was the PIT, 'Units can move here from anywhere' (187.9) let the non-Ganking Scout on bf1 take a Standard Move straight to it", async () => {
    const game = await board({ scoutAt: "bf1" }).build();
    await pitLeftEmptyThenP1Turn(game);
    const unitsTo = (dest: string) => (game.p1.option(`standardMove:to:${dest}`)?.fields[0]?.options ?? []).flat();
    expect(game.locationOf("scout")).toBe("bf1");
    expect(unitsTo(PIT_ID)).toContain("scout");
  });

  test("(a) once it is a BRUSH that text is gone: the Scout on bf1 is no longer offered a move to that slot (only home to base), while the Pit-era control/units stay", async () => {
    const game = await brushedPit({ scoutAt: "bf1" });
    const slot = slotUnder(game, "ranger");
    expect(game.state(slot).name).toBe("Brush");
    expect(game.locationOf("scout")).toBe("bf1");
    const unitsTo = (dest: string) => (game.p1.option(`standardMove:to:${dest}`)?.fields[0]?.options ?? []).flat();
    expect(unitsTo(slot)).not.toContain("scout");
    expect(unitsTo("base")).toContain("scout");
    expect((await game.p1.try((p) => p.move("scout", slot))).ok).toBe(false);
  });

  // ---------------------------------------------------------------- (b)
  /** One round later P1 holds the Brush: decline Green Father (readied in Awaken), then take the Brush's swap-back offer if the engine makes one. */
  async function holdBrushNextRound(game: Game): Promise<boolean> {
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.endTurn(); // → P1 Beginning: hold
    let swapOffered = false;
    for (let i = 0; i < 12; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        if (d.source?.cardId === "gf") {
          await game.p1.no();
        } else {
          swapOffered = true;
          if (d.canAccept === false) {
            await game.p1.no();
          } else {
            await game.p1.yes();
          }
        }
        continue;
      }
      if (r.reason !== "unanswered") {
        break;
      }
      break;
    }
    expect(game.phase()).toBe("main");
    return swapOffered;
  }

  // BUG — expected (438.7.b / 438.7.c): Swap Back needs the replaced object waiting in Banishment; the Pit
  // token ceased to exist, so "you may replace this with the battlefield it replaced" can never do anything —
  // after the hold the Ranger still stands on the Brush and no Baron Pit is on the board.
  // Actual: the engine resurrects a (non-token) "Baron Pit" from banishment into the slot.
  test("(b) holding the Brush next turn scores but can NEVER swap back to the Baron Pit — the slot stays a Brush (438.7.c)", async () => {
    const game = await brushedPit();
    await holdBrushNextRound(game);
    expect(game.p1.points()).toBe(2); // conquer + hold
    const slot = slotUnder(game, "ranger");
    expect(game.state(slot).name).toBe("Brush");
    expect(onRow(game, "Baron Pit")).toEqual([]);
    expect(named(game, "Baron Pit")).toEqual([]);
    expect(game.state("ranger").might).toBe(4); // still in Brush
    expect(game.violations()).toEqual([]);
  });

  // ---------------------------------------------------------------- (c)
  // BUG — expected (439.4.b + Baron's "if it's not there already"): no Baron Pit is on the board (the slot is
  // a Brush), so P2's second Baron adds a FRESH Baron Pit token (owner P2, uncontrolled as created) and
  // enters there; the board then has bf1 + the Brush + the new Pit. Actual: the engine still finds the old
  // Pit's slot key and treats the Pit as present — nothing is added and Baron lands in P2's base.
  test("(c) P2's second Baron creates a NEW Baron Pit token and enters it — board = bf1 + Brush + Pit (439.4.b)", async () => {
    const game = await brushedPit();
    await game.advanceTurn(); // → P2's turn
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 10, power: { chaos: 3 } });
    await game.p2.play("baron2", { to: "base" });
    const pits = onRow(game, "Baron Pit");
    expect(pits).toHaveLength(1);
    const pit = pits[0] as string;
    expect(game.state(pit)).toMatchObject({ isToken: true, owner: P2 });
    expect(game.locationOf("baron2")).toBe(pit);
    expect(game.zoneOf("baron2")).not.toBe("base");
    expect(game.battlefields().map((id) => game.state(id).name).sort()).toEqual(["Baron Pit", "Brush", "bf1"]);
    expect(game.state(slotUnder(game, "ranger")).name).toBe("Brush"); // the Brush is untouched
    await game.settle();
    await game.settle();
    expect(game.gameState.battlefields[pit]?.controller).toBe(P2); // staged showdown → conquered as usual
  });

  // ---------------------------------------------------------------- (d)
  /** Contrast board: P1's turn; an ordinary (inert) battlefield CARD "meadow" held by P2 with nobody on it. */
  function cardBoard() {
    return scenario()
      .legend(P1, GREEN_FATHER, "gf")
      .battlefield("meadow", { controller: P2, owner: P2 })
      .unit(P1, "base", { might: 3, name: "Ranger", tags: ["Dog"] }, "ranger");
  }

  test("(d) contrast — brushing a battlefield CARD: the card goes to Banishment and PERSISTS there 'as Replaced' (438.5.a); the slot is a P1-controlled Brush with the Ranger on it", async () => {
    const game = await cardBoard().build();
    await game.p1.move("ranger", "meadow");
    expect(await answerGreenFather(game, true)).toBe(1);
    await game.settle();
    const slot = slotUnder(game, "ranger");
    expect(game.state(slot)).toMatchObject({ isToken: true, name: "Brush" });
    expect(game.gameState.battlefields[slot]?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    const banished = game.cardsAt("banishment");
    expect(banished.map((id) => game.state(id).name)).toEqual(["meadow"]);
    expect(game.state(banished[0] as string)).toMatchObject({ cardType: "battlefield", isToken: false, owner: P2 });
    expect(game.state("ranger").might).toBe(4); // Dog in Brush
  });

  test("(d) contrast — on the next hold P1 may swap back (438.7.b): the Brush ceases to exist, 'meadow' returns to the slot inheriting P1's control and the Ranger, banishment empties, and the Dog bonus is gone", async () => {
    const game = await cardBoard().build();
    await game.p1.move("ranger", "meadow");
    await answerGreenFather(game, true);
    await game.settle();
    const swapOffered = await holdBrushNextRound(game);
    expect(swapOffered).toBe(true);
    expect(game.p1.points()).toBe(2);
    const slot = slotUnder(game, "ranger");
    expect(game.state(slot)).toMatchObject({ isToken: false, name: "meadow", zone: "battlefieldRow" });
    expect(game.gameState.battlefields[slot]?.controller).toBe(P1);
    expect(onRow(game, "Brush")).toEqual([]);
    expect(named(game, "Brush")).toEqual([]); // the token stopped existing (186.1)
    expect(game.cardsAt("banishment")).toEqual([]);
    expect(game.state("ranger").might).toBe(3);
    expect(game.battlefields()).toHaveLength(1);
  });
});
