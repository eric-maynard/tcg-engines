/**
 * Ruling 52ef30abf541bfdd — Fading Memories (OGN-180 → ogn-180-298) · Spell · [4][chaos]
 *     "Give a unit at a battlefield or a gear [Temporary]. (Kill it at the start of its controller's Beginning Phase, before scoring.)"
 *   × The Boss (OGN-269 → ogn-269-298, Sett legend) "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and
 *     spend its buff to heal it, exhaust it, and recall it instead."
 *
 * Q: Fading Memories makes a unit Temporary; Sett's legend saves it when Temporary kills it. Does it keep Temporary and die again?
 * A: Yes. The save replaces the death but does not remove the keyword; the unit is still Temporary and is killed again at the start
 *    of its controller's following Beginning Phase (this time with no buff to spend).
 * Rules: 816 (Temporary), 371–373 (replacement replaces only the death event), 702 (buff spent).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FADING_MEMORIES = "ogn-180-298";
const THE_BOSS = "ogn-269-298";

/**
 * P2's turn. P1 (The Boss) holds bf1 with a BUFFED Bruiser (2+1) and has one ready body rune channeled (pools empty at end of
 * turn, so the Boss's [rainbow] is produced at Reaction speed during P1's Beginning Phase). P2: Fading Memories + exactly [4][chaos].
 */
function board() {
  return scenario()
    .active(P2)
    .legend(P1, THE_BOSS, "boss")
    .rune(P1, "body", { alias: "bodyrune" })
    .resources(P2, { energy: 4, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Bruiser" }, "bruiser", { buffed: true })
    .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry")
    .hand(P2, FADING_MEMORIES, "fading");
}

const hasTemporary = (game: Game, id: string) =>
  game.state(id).keywords.includes("Temporary") || game.state(id).grantedKeywords.some((k) => k.keyword === "Temporary");

async function fadedBruiser(): Promise<Game> {
  const game = await board().build();
  expect(game.state("bruiser")).toMatchObject({ isBuffed: true, might: 3 });
  await game.p2.cast("fading", { targets: "bruiser" });
  await game.settle();
  expect(game.zoneOf("fading")).toBe("trash");
  expect(hasTemporary(game, "bruiser")).toBe(true);
  return game;
}

/**
 * P2 ends the turn → P1's Beginning Phase: the Bruiser's Temporary kill goes on the chain. P1 recycles the body rune for the
 * Boss's [rainbow] while holding priority, then both pass. Returns with the Boss's question (or whatever comes next) pending.
 */
async function intoP1Beginning(game: Game): Promise<void> {
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bruiser", triggered: true })]); // Temporary's kill trigger
  expect(game.zoneOf("bruiser")).toBe("battlefield-bf1");
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

/** Pass/answer through to `seat`'s open main phase; count Boss questions (answered YES). */
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
      if (r.reason === "unanswered") {
        break;
      }
    }
  }
  return bossAsked;
}

describe("Ruling 52ef30abf541bfdd — a Sett-saved Temporary unit keeps Temporary and dies at its next Beginning Phase", () => {
  test("at the start of P1's Beginning Phase Temporary tries to kill the buffed Bruiser and the Boss's replacement is offered", async () => {
    const game = await fadedBruiser();
    await intoP1Beginning(game);
    expect(game.phase()).toBe("beginning");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1");
  });

  test("YES: the Bruiser is healed, exhausted and recalled to base with its buff spent, Boss exhausted — and it STILL has Temporary", async () => {
    const game = await fadedBruiser();
    await intoP1Beginning(game);
    const asked = await toMainOf(game, P1);
    expect(asked).toBe(1);
    expect(game.zoneOf("bruiser")).toBe("base");
    expect(game.state("bruiser")).toMatchObject({ damage: 0, isBuffed: false, might: 2 });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.power("body")).toBe(0);
    expect(hasTemporary(game, "bruiser")).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("it survives P2's next turn (Temporary keys off its CONTROLLER's Beginning Phase), then at P1's following Beginning Phase Temporary kills it again — unbuffed, no Boss offer — and it goes to the trash", async () => {
    const game = await fadedBruiser();
    await intoP1Beginning(game);
    await toMainOf(game, P1);
    expect(game.zoneOf("bruiser")).toBe("base");
    await game.p1.endTurn();
    await toMainOf(game, P2);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("bruiser")).toBe("base");
    await game.p2.endTurn();
    const askedAgain = await toMainOf(game, P1);
    expect(game.turnPlayer()).toBe(P1);
    expect(askedAgain).toBe(0);
    expect(game.zoneOf("bruiser")).toBe("trash");
  });
});
