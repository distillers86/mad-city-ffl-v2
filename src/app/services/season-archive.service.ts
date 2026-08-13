import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError, map } from 'rxjs';
import type { ArchivedSeason, LeagueData, WeekMatchup } from '../models/models';

/**
 * Reads and writes the archived season files.
 *
 * The idea: once a season is done, its numbers will never change again, so there's no
 * reason to keep asking Sleeper for them. Export the finished season to JSON, drop the file
 * in `src/seasons/`, and from then on the app loads that instead of making twenty API
 * calls. If the file isn't there it just falls back to the API, so nothing breaks either
 * way and archiving is entirely optional.
 *
 * The real point of it is insurance. If Sleeper ever decides to stop serving data more than
 * a couple of years old, the archived seasons keep working and the league's history doesn't
 * disappear.
 *
 * An archive holds raw results only, so teams, scores and the playoff bracket. It does not
 * hold the payout amounts. Those stay in league.config.json, which means a bug in the
 * payout math can be fixed and the old seasons recalculate correctly instead of being
 * frozen with the wrong numbers baked in.
 */

/** Bumped whenever the file shape changes, so old files get spotted rather than misread. */
const ARCHIVE_FORMAT_VERSION = 1;

@Injectable({ providedIn: 'root' })
export class SeasonArchiveService {
  private http = inject(HttpClient);

  /**
   * Looks for an archived season, returning null if there isn't one.
   *
   * A missing file is the normal case, not an error, so the 404 is swallowed on purpose.
   */
  load(year: number): Observable<ArchivedSeason | null> {
    return this.http.get<ArchivedSeason>(`seasons/${year}.json`).pipe(
      map(archive => {
        if (archive?.formatVersion !== ARCHIVE_FORMAT_VERSION) {
          console.warn(`seasons/${year}.json is version ${archive?.formatVersion} but this app expects ${ARCHIVE_FORMAT_VERSION}, so it's being ignored and the API is used instead.`);
          return null;
        }
        return archive;
      }),
      catchError(() => of(null))
    );
  }

  /** Turns loaded season data into the JSON to save as `src/seasons/<year>.json`. */
  buildArchive(data: LeagueData): ArchivedSeason {
    return {
      formatVersion: ARCHIVE_FORMAT_VERSION,
      year: data.config.year,
      leagueId: data.config.leagueId,
      exportedAt: new Date().toISOString(),
      totalRegularSeasonWeeks: data.config.totalRegularSeasonWeeks,
      rosterPositions: data.rosterPositions,
      teams: data.teams,
      bracket: data.bracket,

      // A Map doesn't survive JSON, so weeks go out as a plain array.
      weeks: [...data.matchupsByWeek.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([week, matchups]) => ({ week, matchups })),
    };
  }

  /** Turns an archive back into the week map the rest of the app expects. */
  toMatchupMap(archive: ArchivedSeason): Map<number, WeekMatchup[]> {
    return new Map(archive.weeks.map(entry => [entry.week, entry.matchups]));
  }

  /**
   * Hands the browser a JSON file to download. The saved file goes in `src/seasons/`,
   * then it gets committed and deployed like any other change.
   */
  download(archive: ArchivedSeason): void {
    const json = JSON.stringify(archive, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${archive.year}.json`;
    link.click();

    // Let go of the blob so the browser can reclaim it.
    URL.revokeObjectURL(url);
  }
}
