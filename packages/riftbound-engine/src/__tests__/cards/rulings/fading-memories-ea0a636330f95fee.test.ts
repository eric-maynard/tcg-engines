/**
 * Ruling ea0a636330f95fee — Fading Memories (OGN-180 → ogn-180-298) · [4]+[chaos]
 *     "Give a unit at a battlefield or a gear [Temporary]. (Kill it at the start of its controller's Beginning Phase, before scoring.)"
 *   × The Boss (OGN-269 → ogn-269-298, Sett legend) "If a buffed unit you control would die, you may pay [rainbow], exhaust me,
 *     and spend its buff to heal it, exhaust it, and recall it instead. … When you conquer, ready me."
 *   (Call to Glory OGN-207 is mentioned only as an example of a "this turn" effect that expires normally.)
 *
 * Q: Opponent Fading-Memories my unit while my Sett legend is exhausted on their turn. Can Sett still save it when
 *    Temporary triggers at the start of my Beginning Phase, and does Temporary remain?
 * A: Yes. Awaken readies the legend before the Beginning Phase; Temporary triggers once at the start of the Beginning
 *    Phase and Sett's replacement saves the unit (heal, exhaust, recall, buff spent). It is the same object, so it KEEPS
 *    Temporary and must be saved again every turn — next Beginning Phase it triggers again (unbuffed ⇒ it dies).
 * Rules: 315.1 (Awaken readies), 816 (Temporary), 371–373 (replacement replaces only the death), 702 (spend buff).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FADING_MEMORIES = "ogn-180-298";
const THE_BOSS = "ogn-269-298";

/**
 * P2's turn. P1's legend The Boss is EXHAUSTED (used earlier); P1 holds bf1 with a BUFFED Bruiser (2+1) and has one body
 * rune (recycled at Reaction speed for the [rainbow] during the Beginning Phase). P2: Fading Memories + exactly [4]+[chaos].
 */
function board() {
  return scenario()
    .active(P2)
    .card("boss", { def: THE_BOSS, meta: { exhausted: true } as Record<string, unknown>, owner: P1, zone: "legendZone" })
    .rune(P1, "body", { alias: "bodyrune" })
    .resources(P2, { energy: 4, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Bruiser" }, "bruiser", { buffed: true })
    .unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy")
    .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry")
    .hand(P2, FADING_MEMORIES, "fading");
}

const hasTemporary = (game: Game, id: string) =>
  game.state(id).keywords.includes("Temporary") || game.state(id).grantedKeywords.some((k) => k.keyword === "Temporary");

/** P2 casts Fading Memories on the Bruiser while the Boss is exhausted. */
async function fadedWhileBossTapped(): Promise<Game> {
  const game = await board().build();
  expect(game.state("boss").isExhausted).toBe(true); // "Sett is tapped during their turn"
  await game.p2.cast("fading", { targets: "bruiser" });
  await game.settle();
  expect(game.zoneOf("fading")).toBe("trash");
  expect(hasTemporary(game, "bruiser")).toBe(true);
  expect(game.state("bruiser")).toMatchObject({ isBuffed: true, might: 3, zone: "battlefield-bf1" });
  return game;
}

/** P2 ends → P1's turn: Awaken, then the Temporary kill is queued; P1 recycles the rune for [rainbow] and everyone passes. */
async function intoP1Beginning(game: Game): Promise<void> {
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.state("boss").isReady).toBe(true); // Awaken readied the legend first
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bruiser", triggered: true })]); // Temporary's kill, once
  expect(game.chain().filter((c) => c.cardId === "bruiser")).toHaveLength(1);
  if (game.p1.can("recycleRune", "bodyrune")) {
    await game.p1.recycleRune("bodyrune");
  }
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || !d.passKey) {
      break;
    }
    await game.seat(d.seat).pass();
  }
}

/** Drive to `seat`'s open main phase, answering Boss offers YES; returns how many times the Boss asked. */
async function toMainOf(game: Game, seat: string): Promise<number> {
  let bossAsked = 0;
  for (let i = 0; i < 30; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main" && game.turnPlayer() === seat)) {
      break;
    }
    if (d.kind === "yes-no" && d.source?.cardId === "boss") {
      bossAsked += 1;
      await game.seat(d.seat).yes();
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      const r = await game.settle();
      if (r.reason === "unanswered" && game.decision()?.source?.cardId !== "boss") {
        break;
      }
    }
  }
  return bossAsked;
}

describe("Ruling ea0a636330f95fee — Sett (The Boss) saves a Fading-Memories unit at the Beginning Phase; Temporary stays", () => {
  test("sequence: the Boss (exhausted on P2's turn) is READY again after Awaken; at the start of P1's Beginning Phase Temporary tries to kill the buffed Bruiser and the Boss's replacement is offered (acceptable once [rainbow] is added)", async () => {
    const game = await fadedWhileBossTapped();
    await intoP1Beginning(game);
    expect(game.phase()).toBe("beginning");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1"); // not dead, not moved — a replacement is being decided
  });

  test("YES: the Bruiser survives as the SAME object — healed, exhausted, recalled to base, buff spent, Boss exhausted — and it still has Temporary; Temporary does not fire a second time this phase", async () => {
    const game = await fadedWhileBossTapped();
    await intoP1Beginning(game);
    const asked = await toMainOf(game, P1);
    expect(asked).toBe(1); // once per Beginning Phase
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("bruiser")).toBe("base");
    expect(game.state("bruiser")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 2 });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(hasTemporary(game, "bruiser")).toBe(true);
    expect(game.p1.trash()).not.toContain("bruiser");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // Buddy still holds bf1
    expect(game.violations()).toEqual([]);
  });

  test("you must save it every turn: it lives through P2's turn, and at P1's NEXT Beginning Phase Temporary triggers again — now unbuffed, the Boss cannot apply, and the Bruiser dies", async () => {
    const game = await fadedWhileBossTapped();
    await intoP1Beginning(game);
    await toMainOf(game, P1);
    expect(game.zoneOf("bruiser")).toBe("base");
    await game.p1.endTurn();
    await toMainOf(game, P2);
    expect(game.zoneOf("bruiser")).toBe("base"); // P2's Beginning Phase is not its controller's
    expect(hasTemporary(game, "bruiser")).toBe(true);
    await game.p2.endTurn();
    const askedAgain = await toMainOf(game, P1);
    expect(askedAgain).toBe(0);
    expect(game.zoneOf("bruiser")).toBe("trash");
  });
});
