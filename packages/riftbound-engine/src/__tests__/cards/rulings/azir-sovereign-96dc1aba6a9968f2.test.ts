/**
 * Ruling 96dc1aba6a9968f2 — Azir, Sovereign (SFD-177 → sfd-177-221) · 4 Might · "[Accelerate] When I attack, you may move
 *     any number of your token units to this battlefield."
 *   × Reflection token (UNL-T06 → unl-t06) "(I become a copy of something when played. I don't get that card's play effects.)"
 *     — made here by Mirror Image (unl-200-219): "Choose a unit. Play a ready Reflection unit token to your base. It becomes
 *       a copy of that unit. Give it [Temporary]."
 *
 * Q: Can Azir move Reflection tokens that have copied a unit?
 * A: Yes. A Reflection is a token unit (182.1.d) whatever it is copying, so Azir's "your token units" includes it.
 * Rules: 182.1.d (tokens are the card type they say), 477 (copies keep being the same object/token).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AZIR = "sfd-177-221";
const MIRROR_IMAGE = "unl-200-219";

/** P1's turn. P2 holds bf1 with a Guard (2) and has a Brute (5) in base (the thing to copy). P1: Azir in base, Mirror Image + its cost. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 5, name: "Brute" }, "brute")
    .unit(P1, "base", AZIR, "azir")
    .hand(P1, MIRROR_IMAGE, "mirror");
}

/** Mirror Image on the Brute → a ready Reflection token in P1's base that is a 5-Might "Brute". Returns its id. */
async function makeReflection(game: Game): Promise<string> {
  await game.p1.cast("mirror", { targets: "brute" });
  await game.settle();
  const tok = game.p1.units("base").find((u) => game.state(u).isToken);
  expect(tok).toBeDefined();
  return tok as string;
}

/** Resolve Azir's attack trigger: accept the "you may", name the Reflection when asked which tokens to move. */
async function resolveAzirTrigger(game: Game, token: string): Promise<{ offered: boolean }> {
  let offered = false;
  for (let i = 0; i < 12; i++) {
    const d: Decision | null = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "action") {
      if (d.context === "chain" && d.passKey) {
        await game.seat(d.seat).pass();
        continue;
      }
      break; // showdown focus — the trigger is done
    }
    if (d.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
      continue;
    }
    if (d.kind === "pick" && d.seat === P1) {
      const opt = d.options.find((o) => (o.card ?? o.key) === token);
      if (opt) {
        offered = true;
        await game.p1.pick(opt.key);
      } else {
        const r = await game.p1.try((p) => p.decline());
        if (!r.ok) {
          break;
        }
      }
      continue;
    }
    break;
  }
  return { offered };
}

describe("Ruling 96dc1aba6a9968f2 — Azir can move a Reflection token that is copying a unit", () => {
  test("premise: the Reflection is a TOKEN and a UNIT even while being a copy of the 5-Might Brute", async () => {
    const game = await board().build();
    const tok = await makeReflection(game);
    expect(game.state(tok)).toMatchObject({ cardType: "unit", controller: P1, isToken: true, might: 5, name: "Brute", zone: "base" });
  });

  test("ruling 96dc1aba6a9968f2 — Azir attacks bf1: his trigger offers the copied Reflection among 'your token units', and picking it moves the token to bf1 alongside him", async () => {
    const game = await board().build();
    const tok = await makeReflection(game);
    await game.p1.move("azir", "bf1");
    expect(game.state("azir").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "azir", controller: P1, triggered: true })]);
    const { offered } = await resolveAzirTrigger(game, tok);
    expect(offered).toBe(true);
    expect(game.zoneOf(tok)).toBe("battlefield-bf1");
    expect(game.zoneOf("azir")).toBe("battlefield-bf1");
    expect(game.state(tok)).toMatchObject({ isToken: true, might: 5, name: "Brute" }); // still the copy after moving
  });

  test("the moved Reflection then fights as the 5-Might unit it copies: 4 + 5 vs 2 → Guard dies, P1 conquers bf1", async () => {
    const game = await board().build();
    const tok = await makeReflection(game);
    await game.p1.move("azir", "bf1");
    await resolveAzirTrigger(game, tok);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.cardsAt("bf1")).toContain(tok);
    expect(game.violations()).toEqual([]);
  });
});
