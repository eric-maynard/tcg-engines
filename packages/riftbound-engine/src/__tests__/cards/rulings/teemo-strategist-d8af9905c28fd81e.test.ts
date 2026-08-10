/**
 * Ruling d8af9905c28fd81e — Teemo, Strategist (ogn-121-298) × Nocturne, Horrifying (ogn-194-298)
 *   Teemo — Champion · Mind · 2 Might: "[Hidden] When I defend, choose an enemy unit here and reveal the top 5 cards of your
 *   Main Deck. Deal 1 to that unit for each card with [Hidden] revealed this way, then recycle the revealed cards."
 *   Nocturne — Champion · Chaos · [4] · 4 Might: "[Ganking] As you look at or reveal me from the top of your deck, you may
 *   banish me. If you do, you may play me for [rainbow]."
 *
 * Q: Teemo's defend trigger reveals Nocturne among the top 5 — can Nocturne be played, or does Teemo's "recycle the
 *    revealed cards" override it?
 * A: Nocturne can be played: as he is revealed you may banish him and play him for [rainbow] instead of recycling him;
 *    the other revealed cards are recycled as usual.
 * Rules: 409 (reveal), Nocturne's self-replacement on reveal (369/370), 403 (recycle the rest).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO = "ogn-121-298";
const NOCTURNE = "ogn-194-298";
const BACK_OFF = "unl-042-219"; // a [Hidden] spell — one point of Teemo damage
const SKULKER = "ogn-175-298";

const TOP = ["h1", "noc", "n1", "n2", "n3", "next"];

/**
 * P2's turn 3. P1 holds bf1 with Teemo (face up) and a 4-Might Holder; P1's deck top→ Back Off (Hidden), Nocturne, 3
 * Skulkers, then "next"; P1 has exactly one [rainbow]. P2's 5-Might Raider attacks from base.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 0, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", TEEMO, "teemo")
    .unit(P1, "bf1", { might: 4, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .deck(P1, [BACK_OFF, NOCTURNE, SKULKER, SKULKER, SKULKER, SKULKER], TOP);
}

function isNocturneOffer(d: Decision | null): boolean {
  if (!d || d.seat !== P1) {
    return false;
  }
  if (d.kind === "yes-no") {
    return d.source?.cardId === "noc" || /nocturne|banish/i.test(`${d.prompt} ${d.consequence ?? ""}`);
  }
  if (d.kind === "pick") {
    return d.source?.cardId === "noc" || (/banish|nocturne/i.test(d.prompt) && d.options.some((o) => (o.card ?? o.key) === "noc"));
  }
  return false;
}

/** Raider attacks bf1 → Teemo defends → his trigger (aimed at the Raider) is on the chain; both pass so it starts resolving. */
async function teemoDefends(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("raider");
    } else if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  expect(game.state("teemo").combatRole).toBe("defender");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P1, targets: ["raider"], triggered: true })]);
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  return game;
}

describe("Ruling d8af9905c28fd81e — Nocturne revealed by Teemo's defend trigger may be banished and played instead of recycled", () => {
  test("as the top 5 are revealed, P1 is offered Nocturne's 'you may banish me' (a P1 prompt sourced from Nocturne) mid-resolution", async () => {
    const game = await teemoDefends();
    const d = game.decision();
    expect(isNocturneOffer(d)).toBe(true);
    expect(d?.seat).toBe(P1);
  });

  test("accepting: Nocturne is banished then played for [rainbow] — he ends on P1's board, the rainbow is spent, and he is NOT recycled; the other four revealed cards go to the bottom ('next' is now on top) and the Raider takes 1 (one [Hidden] card revealed)", async () => {
    const game = await teemoDefends();
    expect(isNocturneOffer(game.decision())).toBe(true);
    const d = game.decision()!;
    if (d.kind === "yes-no") {
      await game.p1.yes();
    } else {
      await game.p1.pick("noc");
    }
    for (let i = 0; i < 8; i++) {
      const n = game.decision();
      if (!n || n.seat !== P1 || n.kind === "action") {
        break;
      }
      if (n.kind === "yes-no") {
        await game.p1.yes(); // "you may play me for [rainbow]"
      } else if (n.kind === "pick") {
        await game.p1.pick(n.options[0]!.key); // location, if asked
      } else {
        break;
      }
    }
    // Finish the trigger (and let the rest of the showdown/combat run).
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      const n = game.decision();
      if (n?.kind === "action" && n.passKey) {
        await game.seat(n.seat).pass();
      } else if (n?.kind === "yes-no" && n.seat === P1) {
        await game.p1.yes();
      } else if (n?.kind === "pick" && n.seat === P1) {
        await game.p1.pick(n.options[0]!.key);
      } else {
        break;
      }
    }
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf("noc"));
    expect(game.state("noc").controller).toBe(P1);
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.p1.deck()).not.toContain("noc");
    expect(game.p1.banishment()).toEqual([]); // banished-then-played, not stranded
    expect(game.p1.deck()[0]).toBe("next");
    expect(new Set(game.p1.deck().slice(-4))).toEqual(new Set(["h1", "n1", "n2", "n3"]));
    expect(game.state("raider").damage).toBe(1);
  });

  test("declining instead: Nocturne is just a revealed card — recycled to the bottom with the rest, rainbow unspent", async () => {
    const game = await teemoDefends();
    expect(isNocturneOffer(game.decision())).toBe(true);
    const d = game.decision()!;
    if (d.kind === "yes-no") {
      await game.p1.no();
    } else {
      await game.p1.decline();
    }
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      const n = game.decision();
      if (n?.kind === "action" && n.passKey) {
        await game.seat(n.seat).pass();
      } else if (n?.kind === "yes-no") {
        await game.seat(n.seat).no();
      } else if (n?.kind === "pick" && n.allowDecline) {
        await game.seat(n.seat).decline();
      } else {
        break;
      }
    }
    expect(game.zoneOf("noc")).toBe("mainDeck");
    expect(game.p1.deck()[0]).toBe("next");
    expect(game.p1.deck().slice(-5)).toContain("noc");
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.state("raider").damage).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
