# TIMING2 migration — Move DESTINATIONS are chosen at play / finalization (rule 355.4)

Engine change (theme 3 of the timing2 package, NOT yet landed — it lands together with the migrated
tests): for spells and triggered/activated abilities whose instruction moves ONE caster-chosen unit
(or "me" / the triggering unit / the pending value) to a destination its controller chooses —
`to:"choose"` ("Move a unit."), `to:"any-battlefield"` ("to a different battlefield"),
`to:{battlefield:"any"|"controlled"|"enemy"|"open"|"contested"|"friendly-units"}` — the
"Choose a destination for X" prompt (`kind:"pick"`, `semantics:"destination"`) is now raised
RIGHT AFTER THE CARD IS PLAYED / THE TRIGGER IS FINALIZED (decision `timing:"FIN"`,
`source.chainItemId` set), i.e. immediately after `cast()` / after answering the trigger's
`yes()` / target pick, BEFORE anyone gets priority — instead of when the spell/ability resolves.
A single legal destination is bound silently (no prompt). Two movers (Void Assault) ⇒ two prompts in
card order. Nothing moves until resolution; at resolution the choice is re-checked (illegal ⇒ that
move does nothing). "Up to N" / "any number" movers and cards an effect PLAYS still ask at resolution.

Cards affected: Charm ogn-043, Ride the Wind ogn-173, Dragon's Rage ogn-258, Unforgiven ogn-259
(activated: only when its target is bound at activation), Showstopper ogn-270, Relentless Pursuit
sfd-184, Skyward Strike unl-038, Call to Battle unl-101, Imposing Challenger unl-105 (trigger),
Blast Cone unl-133 (trigger), Maduli unl-144 (activated "move me"), Void Assault unl-202, Star Spring
unl-215, Resonating Strike ven-034, Twilight Step ven-105, Shadow Dash ven-148, and any inline test
def using those `to:` shapes (`MARCH`, `DRAG`, …).

## Recipe (tests only — never touch engine files)

1. PREFERRED — make the answer timing-agnostic with the seat's answer queue:
   `await game.p1.cast("charm", { targets: "foe", answers: ["bf2"] });` (or `"battlefield-bf2"` /
   `"base"`), then `await game.settle()` (or pass priority) to resolve. `answers` are consumed
   whenever that seat is asked, so the same line works before and after the change.
   For a trigger: `await game.p1.move("ic", "bf1"); await game.p1.yes({ answers:["bf2"] })` does NOT
   exist — instead answer in order: `yes()` → (target `pick()` if asked) → destination `pick()`; all
   three are FIN prompts that appear consecutively BEFORE the priority window.
2. If the test asserted the OLD order (`cast → passPriority ×2 / settle() → pick(dest) → expect moved`):
   move the `pick(dest)` to right after the cast (or use `answers`), THEN `settle()`/pass, THEN the
   location/combat expectations. `settle()` right after a cast now STOPS at the destination pick
   (multi-option, unanswered) — a following `pick()` answers it but the spell has NOT resolved yet, so
   add another `await game.settle()` before asserting positions ("Expected bf2, Received bf1/base"
   failures are exactly this).
3. If the test asserted "nothing is asked at cast" / `decision().context === "chain"` right after the
   cast: insert the destination answer first; the priority window opens after it.
4. `expect(game.decision()).toMatchObject({ kind:"pick", semantics:"destination" })` after resolution
   → now assert it right after the cast, optionally with `timing:"FIN"` and
   `source:{ cardId:<mover> }`; after answering, `game.locationOf(mover)` is UNCHANGED until resolution.
5. A test named "...destination is chosen at resolution..." that encoded the old timing as CORRECT
   behaviour: rewrite the title/expectations to 355.4 (destination chosen as the card is played,
   re-checked on resolution). Do not delete coverage.
6. `WRONG_ANSWER_KIND ... needs an action answer, got pick` = the prompt you are answering was already
   answered/auto-bound earlier (single legal destination ⇒ no prompt at all). Drop that `pick()` or
   move it earlier.
7. Run only your file: `bun test <file>`; when green append the path to
   `.claude/fix-queue/timing2-migrated.txt` (one line, `>>`). Do NOT land; timing2 lands everything.

Files + failing titles: `.claude/fix-queue/timing2-red-files.txt` (path TAB title).
Reference migrations already done: `cards/interactions/void-assault-split-destinations-ordering.test.ts`
(`voidAssault()` helper), `cards/interactions/void-assault-ffa-third-player-recalled.test.ts`,
`cards/interactions/dragons-rage-reflexive-nsf-vs-windwall.test.ts` (`answers:["bf2"]` idiom).
