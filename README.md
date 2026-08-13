# Mad City FFL

A companion site for my fantasy football league. It reads the league straight from
Sleeper's public API and shows who won what each week, where everyone sits on the season
points leaderboard, and how much money each team is owed.

The point of it is transparency. Everyone in the league can see the payout math for
themselves at any time, which takes the whole job off the commissioner's plate.

It's a static site with no backend, no login, and no database. Everything comes from
Sleeper when the page loads, and it's hosted on GitHub Pages.

---

## Getting it running

You need Node.js installed. Grab the LTS build from https://nodejs.org if you don't have
it. Angular 22 needs Node 22.22 or newer, so if you already have Node and something below
complains about the version, that's why.

Everything below runs from inside this folder.

Install the dependencies. Only needed the first time, or after I change `package.json`:

```bash
npm install
```

Start it up:

```bash
npm start
```

That serves it at http://localhost:4200 and reloads whenever I save a file.

---

## Changing league settings

`src/league.config.json` is the only file I should need to touch for normal changes.
Nothing in it requires editing any actual code.

It only holds things Sleeper can't tell me. League IDs, how many weeks the regular season
ran, and which seasons exist all come from the API, so none of that is written down here.

| Setting | What it does |
|---|---|
| `league.name` | The name in the sidebar, and how the app picks the right league if my account is in more than one. |
| `league.sleeperUsername` | My Sleeper username. This is how the app finds the current season's league. |
| `league.sport` | `nfl`. No reason to change this. |
| `league.firstTrackedSeason` | Don't show anything older than this year. |
| `league.fallbackLeagueId` | Only used if the username lookup fails. |
| `defaults.payouts` | Every dollar amount. Set one to 0 to switch that award off. |
| `defaults.weeklyPositionRotation` | Which position is worth money each week. |
| `seasons` | One entry per year. Usually just `{ "year": 2025 }`. |

### Per-season rules

The commissioner keeps the featured positions the same from year to year, so in practice
every season just uses the `defaults` block and the `seasons` list is a set of bare years:

```json
{ "year": 2025 }
```

**That's the normal case and it's deliberate, not something half filled in.** The per-season
structure exists so that if a year ever does play by different rules, I can say so without
touching any code or disturbing the other seasons:

```json
{ "year": 2024, "payouts": { "...the whole payouts block for 2024..." } }
```

**An override replaces the whole block rather than merging field by field.** That's on
purpose. A half-merged config is miserable to debug, and this way a season's entry is
either empty or it's the complete truth for that year. The Settings page shows the config
as loaded, so I can always check what's actually in effect.

### The position rotation

Each week in `weeklyPositionRotation` needs a `week` and a `label` for the screen, plus
exactly one rule saying who's eligible:

- **`slots`** matches on the lineup slot the player actually filled. `"slots": ["FLEX"]`
  means only the guy sitting in the flex spot counts, and a running back in a normal RB
  slot is ignored. Week 14 uses `["QB", "FLEX"]`, so it's the QB or the flex player and
  nothing else. Slot names have to match `roster_positions` on the league, which for mine
  is QB, RB, RB, WR, WR, TE, FLEX, K, DEF.
- **`positions`** matches on the player's real position no matter which slot they were in.
  `"positions": ["TE"]` is any starting tight end.
- **`anyPosition": true`** makes every starter eligible. That's week 13.

If a week sets more than one, `anyPosition` wins, then `slots`, then `positions`. If it
sets none, nobody is eligible and a warning goes to the browser console rather than the app
quietly inventing a rule.

**Bench players are never eligible under any of these.** The app only ever looks at the
starting lineup Sleeper reports, so a monster week from somebody's bench can't win money.

### How seasons get found

Sleeper doesn't have one league that spans years. It creates a brand new league with a
brand new ID every August and links it back to the previous one through
`previous_league_id`.

So I don't write any league IDs down, because one would be correct for a single season and
then silently point at last year forever. Instead the app looks up my username to find the
newest league, then walks that chain backwards to find every season before it. Mine goes
back to 2022.

**Nothing needs editing when a new season starts.** The regular season length comes from
the API too, off the league's `playoff_week_start`, so if the commissioner ever moves the
playoffs the app just follows.

The season is in the URL, so `/#/2025/money-earned` is what everybody was owed in 2025.
That means a link pasted into the league chat opens on the season it was about.

---

## Deploying

The site goes to GitHub Pages off the `gh-pages` branch.

In the repo settings, under Pages, point the source at the `gh-pages` branch. That's the
only setup step.

There's nothing to change for the repo name. The build uses `--base-href ./`, so every
asset is referenced relative to wherever the page is sitting. That works because routing is
hash based, which means the path part of the URL never changes no matter which page you're
on. Rename the repo, fork it, move it to a different account, and it still works. The usual
GitHub Pages trap is a base href hardcoded to one repo name, where everything 404s the
moment the name doesn't match, and this sidesteps it entirely.

To deploy:

```bash
npm run deploy
```

That builds it and pushes the result to `gh-pages` on its own. It ends up at
`https://<my-github-username>.github.io/<repo-name>/`.

---

## How it's put together

```
src/
├── league.config.json                Payouts and the position rotation, per season
├── seasons/                          Exported finished seasons, see the README in there
├── styles.css                        Colors and the global reset
├── index.html
├── main.ts                           Starts the app
└── app/
    ├── app.config.ts                 Router and HTTP setup
    ├── app.routes.ts                 Which URL loads which page
    ├── app.component.ts              The shell, sidebar plus the year picker
    ├── models/models.ts              Every type, both Sleeper's shapes and mine
    ├── services/
    │   ├── sleeper.service.ts        The only file that talks to Sleeper
    │   ├── season-index.service.ts   Works out which seasons exist
    │   ├── season-archive.service.ts Reads and writes the exported season files
    │   └── league.service.ts         All the payout math
    └── components/
        ├── weekly/                   Weekly winners
        ├── total-scores/             Season points leaderboard
        ├── money-earned/             Who's owed what
        ├── season-redirect/          Works out which year to open on
        └── settings/                 Season list, the export button, and the loaded config
```

The split I care about: `sleeper.service.ts` knows how to talk to Sleeper and nothing about
my league's rules. `league.service.ts` knows all my rules and nothing about HTTP. The
components just render what comes out. **If a payout number looks wrong, the math is in
`league.service.ts` and nowhere else.**

### Things worth knowing

**One load per season, shared by all three pages.** A full load is around 20 API calls. The
first page to ask pays for it and the other two reuse the result, so clicking between pages
costs nothing. It's keyed by year, so flipping back and forth between seasons is free too
after the first visit. Refresh is the only thing that goes back out to Sleeper.

**Archived seasons skip the API entirely.** If `src/seasons/<year>.json` exists, that
season loads from the file and makes zero Sleeper calls. There's an "Archived" chip on the
page when that's happening. See `src/seasons/README.md`.

**Player names are cached for 24 hours.** Sleeper has no way to look up a few players at
once. The only option is an endpoint that returns every player in the NFL as one blob,
which is currently about 15MB, and they ask that it be called no more than once a day.
The cache stores only the couple hundred guys my league actually started, not the whole
league, because the whole thing does not fit in browser storage. There's a long comment
in `sleeper.service.ts` explaining that.

**Hash URLs.** The addresses look like `/#/weekly`. GitHub Pages is plain static hosting
with no server to rewrite unknown paths, so a normal URL would 404 on refresh. The hash
keeps routing on the browser side.

**Week status comes from the season, not the calendar.** There are no hardcoded dates
anywhere. The app asks Sleeper which season the league is, and if it's a past year or
already flagged complete then every week counts as final.

---

## When something looks wrong

**Every week says "hasn't started yet" even though the season is over.** The app thinks the
season is still live. Check what `league.status` and `league.season` come back as for the
league ID in the config, against what `https://api.sleeper.app/v1/state/nfl` says. The
logic that decides this is `resolveSeasonState()` in `league.service.ts`.

**404s for `seasons/<year>.json` in the console.** Normal and expected. That's the app
checking whether a season has been archived. A miss just means it uses the API instead.

**It opened on the wrong year.** With no year in the URL the app picks the newest season
that has actually been played. In August the next season's league already exists but hasn't
been drafted, so it deliberately skips it rather than showing a page of blanks.

**A season is showing stale numbers after I archived it.** The archive file wins over the
API, so if it was exported mid-season it's frozen at that point. Re-export it, or delete
the file to go back to live data.

**A phone style change seems to do nothing.** Check where the `@media` block sits in that
component's styles. A media query does **not** beat a plain rule that appears after it,
they carry the same weight and the last one wins. The phone rules have to be at the bottom
of the stylesheet. This caught me once already on the weekly page.

**The season list is wrong or missing a year.** It's cached in the browser for 12 hours.
Hitting Refresh on any page clears it and rebuilds it. If a season is missing entirely,
check `firstTrackedSeason` in the config isn't cutting it off.

**A player shows as "Unknown (12345)".** Sleeper had no record of that ID. Usually an empty
lineup slot. If it's happening to a real player, the cache may be holding something stale,
so hit Refresh, which clears it.

**A slot-based week picks nobody.** The names in `slots` have to match the league's
`roster_positions` exactly. Check what those actually are at
`https://api.sleeper.app/v1/league/<league-id>` and make the config match. A mismatch
finds nothing and shows no winner rather than erroring.

**Everything fails to load.** Sleeper is read-only and needs no key, so it's usually either
their API being down or a network problem. Open the browser console and look at what the
requests to `api.sleeper.app` are returning. They do rate limit at 1000 calls a minute, but
a page load here is about 20, so that's very unlikely to be it.

**Checking a number by hand.** Every endpoint the app uses can be opened straight in a
browser, no key needed. Week 5's scores are at
`https://api.sleeper.app/v1/league/<league-id>/matchups/5`. The `starters` array lines up
index for index with `roster_positions` from `https://api.sleeper.app/v1/league/<league-id>`,
which is how the flex slot gets identified.

---

## License

MIT, see [LICENSE](LICENSE). Use it, change it, run it for your own league. The only thing
asked in return is that the copyright notice stays with it.

If you do point it at a different league, everything you need to change is in
`src/league.config.json`. Nothing about my league is hardcoded anywhere else.
