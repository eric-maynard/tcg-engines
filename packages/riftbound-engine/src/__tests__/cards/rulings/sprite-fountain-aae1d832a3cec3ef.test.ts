/**
 * Ruling aae1d832a3cec3ef — Sprite Fountain (UNL-078 → unl-078-219) Gear "[Temporary] … When you play this, play a ready 3 [Might] Sprite
 *   unit token with [Temporary] to your base. [Deathknell][>] Repeat this gear's play effect."  × Sprite token (OGN-274 → ogn-274-298)
 *   × Akshan, Mischievous (SFD-109 → sfd-109-221) "You may pay [body][body] as an additional cost to play me. When you play me, if you
 *     paid the additional cost, move an enemy gear to your base. You control it until I leave the board. …"
 *
 * Q: If I steal a Sprite Fountain with Akshan, does it immediately play a Sprite token on my side?
 * A: No. "When you play this" only triggers when the gear is PLAYED; taking control of / moving it is not playing it. Tokens it made
 *    earlier stay with their original controller — Akshan's control change applies to the gear only.
 * Rules: 383.4.a (play triggers), 350 (playing a card), 108.2 (control), Akshan's take-control affects only the moved gear.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_FOUNTAIN = "unl-078-219";
const SPRITE = "ogn-274-298";
const AKSHAN = "sfd-109-221";

/** P1's turn. P2: Sprite Fountain in base (its only gear) plus the Sprite token it made earlier. P1: Akshan in hand with exactly 4 + [body][body]. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { body: 2 } })
    .battlefield("bf1", { controller: null })
    .gear(P2, SPRITE_FOUNTAIN, "fountain")
    .unit(P2, "base", SPRITE, "sprite")
    .hand(P1, AKSHAN, "akshan");
}

/** P1 plays Akshan paying [body][body]; the trigger takes P2's Fountain. */
async function stealFountain(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("akshan", { payOptional: true, to: "base" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  const r = await game.settle();
  if (r.reason === "unanswered" && game.decision()?.seat === P1) {
    await game.p1.pick("fountain");
    await game.settle();
  }
  return game;
}

describe("Ruling aae1d832a3cec3ef — a stolen Sprite Fountain does not make a Sprite for the thief", () => {
  test("the Fountain moves to P1's base under P1's CONTROL (still owned by P2) …", async () => {
    const game = await stealFountain();
    expect(game.zoneOf("akshan")).toBe("base");
    expect(game.state("fountain")).toMatchObject({ controller: P1, owner: P2, zone: "base" });
    expect(game.p1.gear()).toEqual(["fountain"]);
    expect(game.p2.gear()).toEqual([]);
  });

  test("… but its 'When you play this' does NOT trigger: no Fountain item ever hit the chain and P1 has no Sprite — Akshan is P1's only unit", async () => {
    const game = await stealFountain();
    expect(game.chain()).toEqual([]);
    expect(game.p1.units().sort()).toEqual(["akshan"]);
    expect(game.findAll({ owner: P1 }).filter((id) => game.state(id).name === "Sprite")).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("the Sprite the Fountain made earlier stays with its original controller (P2)", async () => {
    const game = await stealFountain();
    expect(game.state("sprite")).toMatchObject({ controller: P2, owner: P2, zone: "base" });
    expect(game.p2.units()).toEqual(["sprite"]);
    expect(game.p1.units()).not.toContain("sprite");
  });

  test("control: PLAYING a Sprite Fountain from hand does trigger it — a ready 3-Might Sprite token appears in that player's base", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { mind: 1 } })
      .battlefield("bf1", { controller: null })
      .hand(P1, SPRITE_FOUNTAIN, "myFountain")
      .build();
    await game.p1.play("myFountain");
    await game.settle();
    expect(game.zoneOf("myFountain")).toBe("base");
    const sprites = game.p1.units("base").filter((id) => game.state(id).name === "Sprite");
    expect(sprites).toHaveLength(1);
    expect(game.state(sprites[0] as string)).toMatchObject({ isReady: true, isToken: true, might: 3 });
  });
});
