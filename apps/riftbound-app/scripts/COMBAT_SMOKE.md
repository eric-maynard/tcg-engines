# Combat smoke-test (manual)

The headless screenshot harness accepts `--scenario mid-combat`, but
driving a fresh vanilla session into combat via the API alone is brittle
(legality depends on whose turn it is, current phase, and which cards are
in hand). When the scripted scenario can't reach a showdown, follow this
manual sequence to visually verify the combat UI:

1. Start the API + Vite dev server:
   - `bun --cwd apps/riftbound-app run dev` (API)
   - `bun --cwd apps/riftbound-app/web run dev` (Vite)

2. Open `http://localhost:5173/play/?session=combat-smoke&realDecks=true`.

3. Click **Step Bot** repeatedly (~5-8 times) until both players have
   played at least one unit onto a battlefield. You should see unit chips
   stacked in a BF tile's "ours" / "theirs" side-slot.

4. On your turn during the **Main** phase, click a battlefield's
   **Contest** button (if surfaced) or use the SPA's contest action. The
   targeted tile gains the red `bf-contested` border.

5. Trigger **Start Showdown** — the contested tile is now `bf-active`,
   the showdown beam slides across it, and a SHOWDOWN — `<phase>` badge
   anchors above the tile. The right rail's **ShowdownBreadcrumb** (just
   below the TurnBanner) lights up Declare Attackers as the active step.

6. Click **Attacker** in the Combat panel for one of your units. The
   unit chip flashes gold for ~800ms (`.bf-unit-role-flash`), then
   settles with a ⚔ attacker badge in the top-right corner.

7. Pass focus → opponent assigns defenders → the breadcrumb advances to
   Declare Defenders, and opposing chips flash + gain 🛡 badges.

8. Continue through Strikes → Resolution. The breadcrumb checkmarks
   each completed step as the combat phase advances.

Things to look for visually:
- Showdown beam sliding across the active BF tile.
- SHOWDOWN — `<phase>` red badge anchored above the tile.
- Breadcrumb in the rail with one step bold/gold and earlier steps with
  green checkmarks.
- Role-change flash (~800ms) when a unit first gains a combat role.
- ⚔/🛡 combat-role badges persisting on chips through the rest of combat.
