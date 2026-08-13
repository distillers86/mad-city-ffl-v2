# Ideas I haven't built yet

Things worth doing at some point, with enough detail that I don't have to reconstruct the
reasoning later. Nothing here is committed to, it's a parking lot.

---

## Quietly refresh a live week

**Status:** deliberately shelved.

Right now scores only update when the page is loaded or when the Refresh button is hit. On
a Sunday afternoon that means sitting on the page shows frozen numbers until I do
something about it.

The idea was to re-pull every couple of minutes while the week being viewed is actually
live, and also when the browser tab regains focus. A finished season would never poll, so
it costs nothing out of season.

I decided against it for now because refreshing manually is fine and I'd rather not have
the page making requests I didn't ask for. **Of the two halves, the tab-focus refresh is
the more appealing one.** Coming back to a tab and seeing current numbers feels right, and
it doesn't poll on a timer.

Revisit during the season if manually refreshing gets annoying.

---

## Custom league branding in the config

The app currently shows a football emoji and the amber accent color for everybody. Since
the code is generic enough that another league could use it, the league-specific look
should come out of `league.config.json` rather than being baked in.

Rough shape:

```json
"branding": {
  "logo": "logo.svg",
  "accentColor": "#f2a93b"
}
```

Images would go in `public/`, which already gets copied into the build. The accent color
can be pushed into the CSS custom property at runtime. Both should fall back to what's
there now if a config doesn't set them.

---

## Split the templates and styles out of the components

Every component keeps its HTML and CSS inline in the `.ts` file. `weekly.component.ts` is
around 350 lines and most of it is CSS, which makes finding the actual logic annoying.

Angular supports `templateUrl` and `styleUrl` pointing at separate `.html` and `.css`
files. Purely a move, no behavior change, but it touches every component so it's worth
doing on its own rather than mixed in with real changes.

---


## Decide what happens on a tie

Nothing in the weekly awards has a tiebreaker. Right now whoever Sleeper happens to list
first in the matchups response wins, because the comparison is a plain `>` and the first
team to set the high score keeps it. That's not random, it'll give the same answer every
time for the same data, but it is arbitrary and there's no rule behind it.

It has never come up in four seasons and probably never will, but it's undefined rather
than decided, and it's the kind of thing that would cause an argument at exactly the wrong
moment.

**The plan for the top player award, including combined weeks:** if two teams tie on the
position of the week score, fall back to their **weekly total team score** and give it to
whichever of them scored more overall that week. That's already on the same page, so it
can be explained to the league without anyone having to go digging.

**The plan for the top team award:** the tiebreaker above can't be reused, since the weekly
team score *is* what tied. So fall back to season points for, meaning the running total of
what that team has scored for itself, and give it to whoever is higher.

One decision to make before building that, because it changes whether a result can move
after the fact:

- **Points for through that week only.** Once the week is done the tiebreak is settled and
  never changes again. This is the one I'd go with.
- **Points for across the whole season.** A tie in week 3 would stay unresolved until the
  season ends, and the winner could flip in week 10 as totals move. That means telling
  somebody they won and then taking it back, which is worth avoiding.

The app already computes cumulative points for in `computeSeasonTotals`, it just does it
across every week rather than up to a given one, so this is a small change rather than new
machinery. Sleeper also exposes an official figure on each roster as
`settings.fpts` plus `settings.fpts_decimal` (so 1550 and 24 means 1550.24), but that's a
final season number with no per-week breakdown, so it can't answer "as of week 3". Better
to keep computing it from the matchups, which also keeps it consistent with the totals
already shown on the Total Scores page.

**The thing that actually worries me about leaving it undefined:** with no tiebreaker, the
winner is whichever tied team came first in Sleeper's response. If that ordering isn't
guaranteed to be stable between calls, then hitting Refresh could show a different winner
than a moment earlier, with nothing having changed. Two people looking at the same week on
the same day could see different names. Worth checking whether Sleeper's matchup ordering
is actually stable before deciding how much any of this matters.

Whatever gets decided, both tiebreakers should be built in the same pass so the behaviour
is consistent, and the rules should be written into the README so nobody has to read the
code to find out how a tie resolves.

## Soften the player list re-download during the season

The player list from Sleeper is 2.5MB gzipped, 15MB raw, and it's over 95% of all the data
this app moves. Everything else put together, the whole app bundle and every API call and
browsing every past season, is a rounding error next to it.

Out of season that's fine, since it comes down once a day at most. In season it will fire
more often than that, because the cache also gives up whenever somebody starts a player it
hasn't seen before. Any waiver pickup across all twelve teams that reaches a starting
lineup means every user pulls the full list again.

That's the correct behaviour, since it's what stops a new player showing as "Unknown". But
if it turns out to be annoying on mobile data during the season, the fix is to stop
treating an unknown ID as a hard miss: serve what's cached, show the unknown player by ID
for a moment, and refresh the list in the background rather than blocking the page on it.

Worth measuring before building. It might not be a real problem.

## Archive the older seasons

`src/seasons/2023.json` exists as a worked example. The other finished seasons (2022, 2024,
2025) could be exported the same way from the Settings page.

Not urgent, since the API still serves them fine. The point of doing it is insurance
against Sleeper eventually limiting how far back you can request.
