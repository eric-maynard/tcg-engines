/**
 * Ruling fbca1b2338b9f67a — Rockfall Path (SFD-216 → sfd-216-221) · Battlefield — "Units can't be played here."
 *   × Ravenbloom Student (OGN-103 → ogn-103-298) · 2 Might — "When you play a spell, give me +1 [Might] this turn."
 *   × Darius, Trifarian (OGN-027 → ogn-027-298) · 5 Might — "When you play your second card in a turn, give me +2
 *     [Might] this turn and ready me."
 *   (+ Eye of the Herald sfd-153-221 — wearer has "When I move, play a 1 [Might] Recruit unit token here." — as "the unit
 *    ability that plays a token unit here"; Recruit the Vanguard ogs-015-024 "Play four 1 [Might] Recruit unit tokens.")
 *
 * Q: The battlefield is Rockfall Path and a unit's ability says "play a token unit here" — what happens to the token?
 * A: Playing a unit there (tokens included) is illegal, so the instruction is simply not executed: the ability still
 *    resolves, but no token is created. The card doing it still counts as played for other purposes (Ravenbloom
 *    Student's "when you play a spell", Darius's "second card") — only the unit is not played.
 * Rules: 359.3 (an impossible instruction is skipped, the rest resolves), 186 (tokens are played), Rockfall's static.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ROCKFALL_PATH = "sfd-216-221";
const EYE_OF_THE_HERALD = "sfd-153-221";
const RAVENBLOOM_STUDENT = "ogn-103-298";
const DARIUS_TRIFARIAN = "ogn-027-298";
const RECRUIT_THE_VANGUARD = "ogs-015-024";
const SKULKER = "ogn-175-298";

const recruits = (game: Game) => game.findAll({ name: "Recruit", owner: P1 });
const pickKeys = (d: Decision | null): string[] => (d?.kind === "pick" ? d.options.map((o) => o.key) : []);

/**
 * P1's turn. P1 controls the live Rockfall Path (a Holder stands there). P1: a Squire (2) wearing the Eye of the Herald,
 * Ravenbloom Student and an EXHAUSTED Darius in base; Shipyard Skulker + Recruit the Vanguard in hand; plenty of resources.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 10, power: { fury: 2, order: 2 } })
    .battlefield("rock", { controller: P1, def: ROCKFALL_PATH, inert: false })
    .unit(P1, "rock", { might: 4, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire", { equippedWith: ["eye"] } as Record<string, unknown>)
    .card("eye", { def: EYE_OF_THE_HERALD, meta: { attachedTo: "squire" } as Record<string, unknown>, owner: P1, zone: "base" })
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .unit(P1, "base", DARIUS_TRIFARIAN, "darius", { exhausted: true })
    .hand(P1, SKULKER, "skulker")
    .hand(P1, RECRUIT_THE_VANGUARD, "vanguard");
}

describe("Ruling fbca1b2338b9f67a — 'play a token unit here' at Rockfall Path: the ability resolves, no token", () => {
  test("the Eye's wearer moves to Rockfall Path: its 'When I move, play a Recruit here' trigger goes on the chain and RESOLVES (chain empties) — but no Recruit token is created anywhere; the Squire itself moved fine", async () => {
    const game = await board().build();
    expect(game.state("rock").keywords).toContain("NoUnitsPlayedHere");
    await game.p1.move("squire", "rock");
    expect(game.locationOf("squire")).toBe("rock"); // MOVING there is legal — only PLAYING is barred
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "squire", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(recruits(game)).toEqual([]);
    expect(game.p1.units("rock").sort()).toEqual(["holder", "squire"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("same restriction for a unit from hand: Rockfall Path (although P1 controls it) is not offered as a play destination — base only", async () => {
    const game = await board().build();
    const to = game.p1.option("play", "skulker")?.fields.find((f) => f.arg === "to");
    expect(to?.options).toEqual(["base"]);
    expect((await game.p1.try((p) => p.play("skulker", { to: "rock" }))).ok).toBe(false);
    expect(game.zoneOf("skulker")).toBe("hand");
  });

  // A token unit "played" by a spell is a unit being played (rule 186), so Rockfall Path must not be offered as
  // a destination for Recruit the Vanguard's tokens (base only here).
  test("ruling fbca1b2338b9f67a — spell-created Recruit tokens are neither offered nor placed at Rockfall Path", async () => {
    const game = await board().build();
    await game.p1.cast("vanguard");
    await game.p1.passPriority();
    await game.p2.passPriority();
    // Rockfall Path is P1's only battlefield and it is not a legal destination, so base is the only
    // place the tokens can go — whether the engine still prompts or not, "battlefield-rock" is never
    // among the options and no Recruit may end up there.
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        const keys = pickKeys(d);
        expect(keys).not.toContain("battlefield-rock");
        await game.p1.pick(keys.includes("battlefield-rock") ? "battlefield-rock" : keys[0]!);
      } else if (d?.kind === "action" && d.context !== "main") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    await game.settle();
    expect(recruits(game).map((r) => game.locationOf(r))).not.toContain("rock");
  });

  test("the spell still counts as PLAYED for other cards: Skulker (card 1) then Recruit the Vanguard (card 2, tokens forced to base) ⇒ Ravenbloom Student +1 (a spell was played) and Darius +2 & readied (second card this turn)", async () => {
    const game = await board().build();
    await game.p1.play("skulker", { to: "base" });
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isReady: false, might: 5 });
    expect(game.state("student").might).toBe(2);
    await game.p1.cast("vanguard");
    for (let i = 0; i < 16; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1) {
        await game.p1.pick("base");
      } else if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.zoneOf("vanguard")).toBe("trash");
    expect(recruits(game)).toHaveLength(4);
    expect(recruits(game).every((r) => game.locationOf(r) === "base")).toBe(true);
    expect(game.state("student").might).toBe(3);
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7 });
  });
});
