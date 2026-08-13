# Archived seasons

Exported season files go in this folder, named by year, so `2025.json`.

## How to add one

1. Open the app, go to **League Settings**, and hit **Export** next to the season.
2. Save the downloaded file into this folder.
3. Commit it and deploy.

From then on the app reads that file for that season instead of making about twenty calls
to Sleeper. If a file isn't here the app just uses the API as normal, so this is entirely
optional and nothing breaks if I never do it.

## Why bother

Insurance. If Sleeper ever limits how far back you can request data, or a league eventually
falls off their API, the archived seasons keep working and the league's history doesn't
disappear. It's also a lot faster, since an archived season is one file instead of twenty
requests, and it skips the player name lookup entirely because the names are already in the
file.

## What's in a file

Raw results only: the teams, every week's scores and starting lineups, and the playoff
bracket.

**Payout amounts are deliberately not in here.** Those stay in `league.config.json`. That
way if I ever find a bug in the payout math I can fix it and the old seasons recalculate
correctly, instead of being stuck with wrong numbers baked into a file. The rules each
season played by live in that season's entry in the config.

The `formatVersion` field at the top guards against this app trying to read a file written
by some future version with a different shape. If it doesn't match, the app ignores the
file and falls back to the API rather than showing something wrong.

## Re-export after fixing anything that changes names or pictures

Worth knowing, because it caught me out once already.

Player names and team images are worked out at export time and then written into the file.
So the file holds "Josh Allen" and a picture URL, not the raw IDs those came from. That
makes archived seasons fast and independent of the API, which is the whole point, but it
also means **fixing a bug in how one of those gets worked out does not fix a season that's
already archived.** The old value is sitting in the file.

That's exactly what happened with the team pictures. I fixed the app to prefer the
league-specific image over the account avatar, and 2023 carried on showing the old ones
until I exported it again.

So if I change how names or images are resolved, re-export any archived season afterwards.
Payout amounts are not affected by this, since those deliberately stay in
`league.config.json` and get recalculated every time.
