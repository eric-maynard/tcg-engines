/**
 * Ruling 6d47813e9e421c9f — Arise! (SFD-198 → sfd-198-221) · Spell · [6][rainbow] · Action
 *   "Play a 2 [Might] Sand Soldier unit token for each Equipment you control. Then do this: Ready up to two of them."
 *
 * Q: Can the Sand Soldier tokens Arise! makes be played to a battlefield you control?
 * A: Yes. Tokens are played following all the steps for playing a card (182.1.a), and the normal unit play
 *    destinations are your base OR any battlefield you control — you are not restricted to your base.
 *    The controller of the creating effect places them at valid locations they control.
 * Rules: 182.1.a (a token is played like a card), 355.2.a (play destinations = base + battlefields you control),
 *        419.3 (a play instructed by an effect).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ARISE = "sfd-198-221";
const SERRATED_DIRK = "sfd-009-221"; // Equipment, [1]

/** P1's turn with [6][rainbow]. P1 durably controls bf1 (a Holder sits there), P2 controls bf2, P1 controls ONE Equipment. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "Theirs" }, "theirs")
    .gear(P1, SERRATED_DIRK, "dirk")
    .hand(P1, ARISE, "arise");
}

const soldiers = (game: Game): string[] => game.findAll({ name: "Sand Soldier" }) as string[];

describe("Ruling 6d47813e9e421c9f — Arise!'s tokens may be played to a battlefield you control", () => {
  test("premise: one Equipment ⇒ one Sand Soldier, and its placement is a real CHOICE offered to the caster — base OR the battlefield they control, never the enemy's", async () => {
    const game = await board().build();
    await game.p1.cast("arise");
    await game.settle(); // spell resolves; the token's destination is asked
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    const keys = (d?.options ?? []).map((o) => o.key);
    expect(keys).toContain("battlefield-bf1");
    expect(keys).toContain("base");
    expect(keys).not.toContain("battlefield-bf2");
  });

  test("ruling: choosing the battlefield puts the Sand Soldier at bf1 — a token played straight to a battlefield you control", async () => {
    const game = await board().build();
    await game.p1.cast("arise");
    await game.settle();
    await game.p1.pick("battlefield-bf1");
    const [tok] = soldiers(game);
    expect(tok).toBeDefined();
    expect(game.zoneOf(tok as string)).toBe("battlefield-bf1");
    expect(game.state(tok as string)).toMatchObject({ controller: P1, isToken: true, might: 2 });
    await game.p1.decline(); // the "Ready up to two of them" pick — declined here
    await game.settle();
    expect(game.zoneOf("arise")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the base is still available (the ruling permits, it does not force): choosing base leaves bf1 with only the Holder", async () => {
    const game = await board().build();
    await game.p1.cast("arise");
    await game.settle();
    await game.p1.pick("base");
    const [tok] = soldiers(game);
    expect(game.locationOf(tok as string)).toBe("base");
    expect(game.p1.units("bf1")).toEqual(["holder"]);
  });

  test("the token enters exhausted like any played unit, and Arise!'s own 'Ready up to two of them' is what readies it", async () => {
    const game = await board().build();
    await game.p1.cast("arise");
    await game.settle();
    await game.p1.pick("battlefield-bf1");
    const [tok] = soldiers(game);
    expect(game.state(tok as string).isReady).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, targeting: "up-to", min: 0, max: 1 });
    await game.p1.pick(tok as string);
    await game.settle();
    expect(game.state(tok as string).isReady).toBe(true);
    expect(game.locationOf(tok as string)).toBe("bf1");
  });
});
