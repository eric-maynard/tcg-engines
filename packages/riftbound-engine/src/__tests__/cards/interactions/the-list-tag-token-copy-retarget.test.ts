/**
 * Interaction: what tag The List may name, and whether a TOKEN — or a copy of one — carries it.
 *   The List         (unl-138-219) · Gear · Chaos · 1 — "As you play this, name a tag.
 *     [Exhaust]: Give a unit with the named tag -2 [Might] this turn."
 *   Vanguard Armory  (sfd-168-221) · Gear · Order · 7 — "[Exhaust]: Play three 1 [Might] Recruit unit
 *     tokens."
 *   Mirror Image     (unl-200-219) · Mind/Order spell · 3 — "Choose a unit. Play a ready Reflection
 *     unit token to your base. It becomes a copy of that unit. Give it [Temporary]."
 *
 * Question:
 *   (a) May the named tag be one only TOKENS carry (Recruit), one nothing on the board has, or an
 *       invented tag?
 *   (b) With a tag named and no bearer anywhere, is the [Exhaust] ability offered at all?
 *   (c) Does a Reflection copying a tagged unit count as having the tag — and what happens if the
 *       copy dies after it was chosen but before the ability resolves?
 *
 * Rules: 760 (naming a card, type or tag), 763 / 763.1 (a named tag must be one that exists on cards
 * OR TOKENS in Riftbound; the list includes Recruit), 762.2 (a player may not name a TOKEN when told
 * to name a CARD — a separate prohibition that governs card-naming effects, not tag naming),
 * 185.2.c (tokens may have tags), 187.1 (the 1 [Might] Recruit token is a domainless unit token with
 * 1 Might and the Recruit tag), 185.3.a.2 (a copy effect appends ALL copyable traits), 355.8 / 402.3
 * (valid choices must exist or the ability is not legal to activate), 359.3.e.5 (a target that has
 * become illegal is simply unaffected — never redirected).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../../harness";

const THE_LIST = "unl-138-219";
const VANGUARD_ARMORY = "sfd-168-221";
const MIRROR_IMAGE = "unl-200-219";
const BIRD_TOKEN = "unl-t02"; // 1-Might Bird unit token — Bird is a TOKEN-ONLY tag in this pool
const RECRUIT_TOKEN = "ogn-271-298"; // the printed 1-Might Recruit token

/** A [Reaction] "deal 3 to a unit" so the opponent can answer a finalized chain item. */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "reaction",
} as const;

function nameVocabulary(game: Game): string[] {
  const d = game.decision();
  expect(d?.kind).toBe("name");
  return [...((d as { vocabulary: string[] }).vocabulary)];
}

/** The activation's legal targets: one variant per unit carrying the named tag. */
function listTargets(game: Game): string[] {
  const variants = game.p1.option("activate", "list")?.variants ?? [];
  return variants.flatMap((v) => (v.params.targets as string[] | undefined) ?? []);
}

describe("The List: naming a token-only tag, and copies of tokens", () => {
  // ---- (a) which names are legal -----------------------------------------------------------------

  test("(a) the prompt is a TAG list, not a card/token name list — 762.2's ban on naming a token belongs to card-naming effects and must not be collapsed into 763", async () => {
    const game = await scenario().resources(P1, { energy: 10 }).hand(P1, THE_LIST, "list").build();
    await game.p1.play("list");
    await game.settle();
    expect(game.decision()).toMatchObject({ cardType: "tag", kind: "name", seat: P1 });
    const vocab = nameVocabulary(game);
    expect(vocab).toContain("Poro");
    expect(vocab).toContain("Fae");
    // token NAMES and card names are not tags and are absent
    for (const notATag of ["Reflection", "Gold", "Sand Soldier", "Loyal Poro", "The List"]) {
      expect(vocab).not.toContain(notATag);
    }
  });

  test("(a) a tag only TOKENS carry is namable: Bird is printed on no non-token card in the pool, yet it is offered and can be named", async () => {
    const pool = await loadDefaultCardPool();
    const birdBearers = pool.all().filter((c) => (c.tags ?? []).includes("Bird"));
    expect(birdBearers.length).toBeGreaterThan(0);
    expect(birdBearers.every((c) => c.isToken === true)).toBe(true); // token-only (185.2.c)

    const game = await scenario().resources(P1, { energy: 10 }).hand(P1, THE_LIST, "list").build();
    await game.p1.play("list");
    await game.settle();
    expect(nameVocabulary(game)).toContain("Bird");
    await game.p1.name("Bird");
    await game.settle();
    expect(game.state("list").meta.namedTag).toBe("Bird");
  });

  test("(a) a tag NOTHING on the board has is still a legal name — 763 restricts the vocabulary, not the board", async () => {
    const game = await scenario()
      .resources(P1, { energy: 10 })
      .unit(P1, "base", { might: 3, name: "Untagged Body" }, "plain")
      .hand(P1, THE_LIST, "list")
      .build();
    await game.p1.play("list");
    await game.settle();
    await game.p1.name("Bird"); // no Bird anywhere
    await game.settle();
    expect(game.state("list").meta.namedTag).toBe("Bird");
    expect(game.zoneOf("list")).toBe("base");
  });

  test("(a) an invented tag is refused (763/763.1) and the naming is not on the chain — it happens as the gear is played", async () => {
    const game = await scenario().resources(P1, { energy: 10 }).hand(P1, THE_LIST, "list").build();
    await game.p1.play("list");
    await game.settle();
    expect(game.chain()).toEqual([]); // "As you play this" — no Reaction window (135.2.b.3 / 358)
    const bad = await game.p1.try((p) => p.name("Fnord"));
    expect(bad.ok).toBe(false);
    await game.p1.name("Poro");
    await game.settle();
    expect(game.state("list").meta.namedTag).toBe("Poro");
  });

  test("(a) the name is locked and public thereafter: exhausting the gear reads it back and does not re-ask, and it survives the turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 10 })
      .unit(P1, "base", { might: 4, tags: ["Poro"], name: "Poro Pal" }, "poro")
      .hand(P1, THE_LIST, "list")
      .build();
    await game.p1.play("list");
    await game.settle();
    await game.p1.name("Poro");
    await game.settle();
    await game.p1.activate("list", 1, { answers: ["poro"] });
    await game.settle();
    expect(game.decision()?.kind).not.toBe("name"); // never re-named
    expect(game.state("poro").might).toBe(2);
    expect(game.state("list").meta.namedTag).toBe("Poro");

    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.state("list").meta.namedTag).toBe("Poro"); // still the same object, same name
    expect(game.state("poro").might).toBe(4); // the -2 was "this turn"
  });

  test("'Recruit' can be named — the printed Recruit token carries the Recruit tag (187.1, 185.2.c, 763.1)", async () => {
    // Expected: 187.1 defines the 1 [Might] Recruit token as carrying the Recruit tag, and 763.1
    // lists Recruit among the tags that exist in Riftbound, so a List may name it. Actual: the
    // Recruit token definitions declare no `tags`, so `listTags()` (which derives the vocabulary from
    // the loaded catalog) never sees Recruit and the name is refused.
    const pool = await loadDefaultCardPool();
    expect(pool.get(RECRUIT_TOKEN)).toMatchObject({ isToken: true, might: 1, tags: ["Recruit"] });

    const game = await scenario().resources(P1, { energy: 10 }).hand(P1, THE_LIST, "list").build();
    await game.p1.play("list");
    await game.settle();
    expect(nameVocabulary(game)).toContain("Recruit");
    await game.p1.name("Recruit");
    await game.settle();
    expect(game.state("list").meta.namedTag).toBe("Recruit");
  });

  test("Vanguard Armory's three Recruit tokens are targets for a List naming Recruit (187.1 + 185.2.c)", async () => {
    // Expected: the Armory's exhaust plays three 1-Might Recruit tokens, each carrying the Recruit
    // tag, so a List naming Recruit offers exactly those three. Actual: the same missing-tag data gap
    // — the name is refused, and even if it were accepted the tokens carry no tag to match.
    const game = await scenario()
      .resources(P1, { energy: 12 })
      .gear(P1, VANGUARD_ARMORY, "armory")
      .hand(P1, THE_LIST, "list")
      .build();
    await game.p1.play("list");
    await game.settle();
    await game.p1.name("Recruit");
    await game.settle();
    await game.p1.activate("armory");
    await game.settle({ policy: "first" });
    const recruits = game.p1.units("base");
    expect(recruits).toHaveLength(3);
    expect(recruits.every((id) => game.state(id).isToken)).toBe(true);
    expect(listTargets(game).sort()).toEqual([...recruits].sort());
  });

  // ---- (b) no bearer ⇒ the ability is not offered at all (402.3 / 355.8) -------------------------

  test("(b) with the tag named and NO unit carrying it, the [Exhaust] ability is absent from the legal set — not offered and then mistargeted", async () => {
    const game = await scenario()
      .resources(P1, { energy: 10 })
      .unit(P1, "base", { might: 3, name: "Untagged Body" }, "plain")
      .unit(P2, "base", { might: 3, name: "Their Body" }, "theirs")
      .hand(P1, THE_LIST, "list")
      .build();
    await game.p1.play("list");
    await game.settle();
    await game.p1.name("Bird");
    await game.settle();

    expect(game.p1.can("activate", "list", 1)).toBe(false);
    expect(game.p1.legal().map((o) => o.moveId)).not.toContain("activateAbility");
    const attempt = await game.p1.try((p) => p.activate("list", 1, { answers: ["plain"] }));
    expect(attempt.ok).toBe(false);
    expect(game.state("list").isExhausted).toBe(false); // nothing was spent
  });

  test("(b) the instant a bearer exists the ability appears, and it hits the token for -2 this turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 10 })
      .unit(P1, "base", BIRD_TOKEN, "bird")
      .unit(P1, "base", { might: 3, name: "Untagged Body" }, "plain")
      .hand(P1, THE_LIST, "list")
      .build();
    await game.p1.play("list");
    await game.settle();
    await game.p1.name("Bird");
    await game.settle();

    expect(game.state("bird").isToken).toBe(true);
    expect(listTargets(game)).toEqual([game.card("bird")]); // the untagged body is never offered
    await game.p1.activate("list", 1, { answers: ["bird"] });
    await game.settle();
    expect(game.state("bird").might).toBe(0); // 1 − 2, floored
    expect(game.state("plain").might).toBe(3);
  });

  // ---- (c) a copy carries the tag, and an illegal target is simply unaffected --------------------

  test("(c) a Reflection copying a tagged unit is a legal target for a List naming that tag (185.3.a.2 — a copy appends every copyable trait)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 20, power: { mind: 2, order: 2 } })
      .unit(P1, "base", BIRD_TOKEN, "bird")
      .hand(P1, THE_LIST, "list")
      .hand(P1, MIRROR_IMAGE, "mirror")
      .build();
    await game.p1.play("list");
    await game.settle();
    await game.p1.name("Bird");
    await game.settle();
    expect(listTargets(game)).toEqual([game.card("bird")]);

    await game.p1.cast("mirror", { targets: "bird" });
    await game.settle({ policy: "first" });
    const reflection = game.p1.units("base").find((id) => id.startsWith("token-reflection")) as string;
    expect(reflection).toBeDefined();
    expect(game.state(reflection).name).toBe("Bird"); // a copy of a token copying a token
    // Both the original token and its copy now answer to the named tag.
    expect(listTargets(game).sort()).toEqual([game.card("bird"), reflection].sort());
  });

  test("(c) the copy is targeted at finalization and re-checked at resolution: killing it in response leaves the -2 ignored, never redirected to the original (359.3.e.5)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 20, power: { mind: 2, order: 2 } })
      .resources(P2, { energy: 3, power: { fury: 1 } })
      .unit(P1, "base", { might: 3, name: "Poro Pal", tags: ["Poro"] }, "poro")
      .hand(P1, THE_LIST, "list")
      .hand(P1, MIRROR_IMAGE, "mirror")
      .hand(P2, BOLT, "bolt")
      .build();
    await game.p1.play("list");
    await game.settle();
    await game.p1.name("Poro");
    await game.settle();
    await game.p1.cast("mirror", { targets: "poro" });
    await game.settle({ policy: "first" });
    const reflection = game.p1.units("base").find((id) => id.startsWith("token-reflection")) as string;
    expect(game.state(reflection).might).toBe(3);

    await game.p1.activate("list", 1, { answers: [reflection] });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "list", controller: P1, targets: [reflection] }),
    ]);

    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("bolt", { targets: reflection });
    await game.settle({ policy: "first" });

    expect(game.zoneOf(reflection)).toBe("gone"); // a token that left the board ceases to exist (186.1)
    expect(game.state("poro").might).toBe(3); // NOT redirected to the original
    expect(game.chain()).toEqual([]);
    expect(game.state("list").isExhausted).toBe(true); // the cost was still paid
    expect(game.violations()).toEqual([]);
  });
});
