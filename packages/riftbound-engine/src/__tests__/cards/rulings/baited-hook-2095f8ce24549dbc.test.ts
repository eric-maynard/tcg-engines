/**
 * Ruling 2095f8ce24549dbc — Baited Hook (OGN-242 → ogn-242-298, Gear) "[1][order], [Exhaust]: Kill a friendly unit. Look
 *   at the top 5 cards of your Main Deck. You may banish a unit … Might up to 1 more than the killed unit and play it,
 *   ignoring its cost. Then recycle the rest."
 *   × Glasc Mixologist (sfd-165-221, 5) "[Deathknell] — You may play a unit with cost no more than [3] and no more than
 *     [rainbow] from your trash, ignoring its cost."
 *   × Harnessed Dragon (ogn-234-298, 6) "When you play me, kill an enemy unit."
 *
 * Q: Hook kills the Mixologist and finds Harnessed Dragon — which happens first, the Dragon's play trigger or the
 *    Mixologist's Deathknell?
 * A: The Deathknell becomes pending first (at the kill), the Dragon's "When you play me" second; both finalize in that
 *    order once the Hook finishes, so the chain is Deathknell < Dragon and resolves LIFO: Dragon's kill FIRST, then the
 *    Deathknell revive.
 * Rules: 808.1.d.2 (Deathknell noted before the move to trash), 337.1.b (pending items finalize in creation order), 340.1 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const GLASC = "sfd-165-221";
const HARNESSED_DRAGON = "ogn-234-298";

/**
 * P1's turn. P1: Baited Hook ready with exactly [1][order]; Glasc Mixologist (5) in base; a 2-cost Revivee already in the
 * trash (the Deathknell's object); deck top→: Harnessed Dragon (6 ≤ 5+1), Seven (7, too big), three spells.
 * P2: two enemies at P2's bf1 (so "kill an enemy unit" is a real choice).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", GLASC, "glasc")
    .unit(P2, "bf1", { might: 4, name: "Brute" }, "brute")
    .unit(P2, "bf1", { might: 2, name: "Runt" }, "runt")
    .trash(P1, { cardType: "unit", energyCost: 2, might: 2, name: "Revivee" }, "revivee")
    .deck(
      P1,
      [
        HARNESSED_DRAGON,
        { cardType: "unit", energyCost: 7, might: 7, name: "Seven" },
        { cardType: "spell", energyCost: 1, name: "Junk A" },
        { cardType: "spell", energyCost: 1, name: "Junk B" },
        { cardType: "spell", energyCost: 1, name: "Junk C" },
      ],
      ["dragon", "seven", "ja", "jb", "jc"],
    );
}

type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * Activate the Hook on the Mixologist and let the Hook itself resolve; answer the look (take the Dragon), the
 * Deathknell's "you may" (yes) and the Dragon's victim (Brute). Stops once both triggers sit finalized on the chain
 * with P1 holding priority.
 */
async function hookIntoDragon(): Promise<Game> {
  const game = await board().build();
  await game.p1.activate("hook", 0, { targets: "glasc" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Baited Hook resolves: kill → look
  for (let i = 0; i < 10; i++) {
    const d: Decision | null = game.decision();
    if (!d || d.kind === "action") {
      break;
    }
    if (d.kind === "pick") {
      const keys = (d as Pick).options.map((o) => o.card ?? o.key);
      if (keys.includes("dragon")) {
        expect(d.seat).toBe(P1);
        expect(keys).toEqual(["dragon"]); // Seven (7 > 5+1) and the spells are not eligible
        await game.p1.pick("dragon");
      } else if (keys.includes("brute")) {
        expect(d.seat).toBe(P1); // "kill an enemy unit" — P1 chooses
        await game.p1.pick("brute");
      } else {
        break;
      }
    } else if (d.kind === "yes-no") {
      expect(d.seat).toBe(P1); // Deathknell "You may …"
      await game.p1.yes();
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  return game;
}

describe("Ruling 2095f8ce24549dbc — Hook kills Mixologist, plays Harnessed Dragon: Dragon's kill resolves before the Deathknell", () => {
  test("after the Hook resolves: Mixologist in trash, Dragon on the board, and the chain is [Deathknell (bottom), Dragon's play trigger (top)]", async () => {
    const game = await hookIntoDragon();
    expect(game.zoneOf("glasc")).toBe("trash");
    expect(game.zoneOf("hook")).toBe("base");
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf("dragon"));
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "glasc", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "dragon", controller: P1, triggered: true }),
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    // Nothing has resolved yet.
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.zoneOf("revivee")).toBe("trash");
  });

  test("1st to resolve — Harnessed Dragon's 'kill an enemy unit': the Brute dies while the Deathknell is still waiting on the chain", async () => {
    const game = await hookIntoDragon();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("runt")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "glasc", triggered: true })]);
    expect(game.zoneOf("revivee")).toBe("trash"); // not yet revived
  });

  test("2nd to resolve — the Mixologist's Deathknell: the Revivee is played from the trash for free; chain empty, P1's turn continues", async () => {
    const game = await hookIntoDragon();
    game.script(P1, [
      (d) =>
        d.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === "revivee")
          ? "revivee"
          : undefined,
    ]);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("revivee");
      await game.settle();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("revivee")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // both plays ignored their costs
    // "Then recycle the rest": the four unpicked cards are at the bottom of P1's deck.
    expect(game.p1.deck().slice(-4).sort()).toEqual(["ja", "jb", "jc", "seven"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
