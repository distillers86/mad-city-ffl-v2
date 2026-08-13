import { Injectable, inject } from '@angular/core';
import { Observable, of, forkJoin, switchMap, map, expand, reduce, catchError, shareReplay } from 'rxjs';
import { SleeperService } from './sleeper.service';
import type { LeagueConfig, SeasonSummary, SleeperLeague } from '../models/models';

/**
 * Works out which seasons exist and what league ID each one has.
 *
 * The problem this solves: Sleeper doesn't have one league that spans years. It creates a
 * brand new league with a brand new ID every August and links the new one back to the old
 * one through `previous_league_id`. So an ID written down in a config file is correct for
 * exactly one season and then silently points at last year forever.
 *
 * So no IDs get written down. The username lookup finds the newest league, then the chain
 * gets walked backwards to find every season before it. The config only has to know the
 * username, which never changes.
 */

const SEASON_INDEX_CACHE_KEY = 'mcffl_season_index';

// Half a day. The chain only changes once a year, but a short-ish window means a newly
// created season shows up the same day without anything needing to be cleared by hand.
const SEASON_INDEX_TTL_MS = 12 * 60 * 60 * 1000;

// Safety net on the walk backwards so a malformed chain can't loop forever.
const MAX_SEASONS = 30;

interface CachedIndex {
  timestamp: number;
  seasons: SeasonSummary[];
}

@Injectable({ providedIn: 'root' })
export class SeasonIndexService {
  private sleeper = inject(SleeperService);

  private index$: Observable<SeasonSummary[]> | null = null;

  /**
   * Every season the app can show, newest first.
   *
   * Cached hard, because this is the same answer all day and it costs one call per season
   * to work out.
   */
  getSeasons(config: LeagueConfig): Observable<SeasonSummary[]> {
    if (!this.index$) {
      const cached = this.readCache();

      this.index$ = (cached ? of(cached) : this.buildIndex(config)).pipe(
        map(seasons => this.applyFirstTrackedSeason(seasons, config)),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }

    return this.index$;
  }

  /** Throws out the cached chain so the next look finds a newly created season. */
  clearCache(): void {
    this.index$ = null;
    try {
      localStorage.removeItem(SEASON_INDEX_CACHE_KEY);
    } catch {
      // Storage unavailable. The in-memory reset above is enough to force a rebuild.
    }
  }

  // Building the chain

  private buildIndex(config: LeagueConfig): Observable<SeasonSummary[]> {
    return this.findNewestLeague(config).pipe(
      switchMap(newest => {
        if (!newest) return of<SeasonSummary[]>([]);
        return this.walkChain(newest);
      }),
      switchMap(seasons => this.markWhichHaveStarted(seasons)),
      map(seasons => {
        this.writeCache(seasons);
        return seasons;
      }),
      catchError(err => {
        console.error('Could not work out which seasons exist.', err);
        return of<SeasonSummary[]>([]);
      })
    );
  }

  /**
   * Finds the most recent league to start walking back from.
   *
   * The NFL's current year gets checked first, then the year before it. That second look
   * matters in the spring: the new season's league won't exist yet, so without it the app
   * would come up empty for months.
   */
  private findNewestLeague(config: LeagueConfig): Observable<SleeperLeague | null> {
    const sport = config.league.sport;

    return this.sleeper.getNflState(sport).pipe(
      switchMap(state => {
        const thisYear = Number(state.season);

        return this.sleeper.getUserByName(config.league.sleeperUsername).pipe(
          switchMap(account =>
            this.sleeper.getUserLeagues(account.user_id, sport, thisYear).pipe(
              switchMap(leagues => {
                if (leagues.length > 0) return of(this.pickLeague(leagues, config));
                return this.sleeper
                  .getUserLeagues(account.user_id, sport, thisYear - 1)
                  .pipe(map(previous => this.pickLeague(previous, config)));
              })
            )
          ),
          catchError(err => {
            // The username lookup failed, maybe a typo or Sleeper being down. Fall back to
            // the pinned ID if the config has one, so the app still shows something.
            console.warn('Could not look up the Sleeper username, falling back to the configured league ID.', err);
            const fallback = config.league.fallbackLeagueId;
            return fallback ? this.sleeper.getLeague(fallback) : of(null);
          })
        );
      })
    );
  }

  /**
   * Picks the right league when an account is in more than one that year. It matches on the
   * configured league name, and takes the first rather than giving up if nothing matches.
   */
  private pickLeague(leagues: SleeperLeague[], config: LeagueConfig): SleeperLeague | null {
    if (leagues.length === 0) return null;
    if (leagues.length === 1) return leagues[0];

    const wanted = config.league.name.trim().toLowerCase();
    const match = leagues.find(l => l.name.trim().toLowerCase() === wanted);

    if (!match) {
      console.warn(`Found ${leagues.length} leagues for this account and none named "${config.league.name}", so using the first one.`);
    }

    return match ?? leagues[0];
  }

  /**
   * Follows previous_league_id back through every earlier season.
   *
   * `expand` keeps re-running the fetch on each result until one comes back without a
   * previous league, which is the first season the league ever played.
   */
  private walkChain(newest: SleeperLeague): Observable<SeasonSummary[]> {
    let visited = 0;

    return of(newest).pipe(
      expand(league => {
        const previousId = league.previous_league_id;
        if (!previousId || ++visited >= MAX_SEASONS) return of<SleeperLeague>();

        return this.sleeper.getLeague(previousId).pipe(
          catchError(err => {
            // A season Sleeper no longer serves. Stop walking rather than fail the whole
            // chain, since everything found so far is still perfectly good.
            console.warn(`Could not load league ${previousId}, stopping the season walk here.`, err);
            return of<SleeperLeague>();
          })
        );
      }),
      reduce((acc: SeasonSummary[], league: SleeperLeague) => {
        acc.push({
          year: Number(league.season),
          leagueId: league.league_id,
          status: league.status,
          totalRegularSeasonWeeks: this.regularSeasonLength(league),
          hasStarted: false,
        });
        return acc;
      }, []),
      map(seasons => seasons.sort((a, b) => b.year - a.year))
    );
  }

  /**
   * How many weeks of regular season a league played.
   *
   * Sleeper says where the playoffs start, so the regular season is everything below that.
   * It's been weeks 1 to 14 every year here, but reading it means the length is never
   * hardcoded and it self corrects if the commissioner ever moves the playoff start.
   */
  private regularSeasonLength(league: SleeperLeague): number {
    const playoffStart = league.settings?.playoff_week_start;
    const startWeek = league.settings?.start_week ?? 1;

    if (playoffStart && playoffStart > startWeek) return playoffStart - startWeek;

    // Sleeper didn't say, which happens on some very old leagues. 14 is the normal shape
    // of a fantasy regular season and matches every season mine has played.
    console.warn(`League ${league.league_id} didn't report a playoff start week, assuming a 14 week regular season.`);
    return 14;
  }

  /**
   * Flags which seasons actually have games in them.
   *
   * A league that exists but hasn't been drafted yet returns an empty list of matchups.
   * Better for the year picker to say so than for somebody to click 2026 in August and
   * find a page of blanks with no explanation.
   */
  private markWhichHaveStarted(seasons: SeasonSummary[]): Observable<SeasonSummary[]> {
    if (seasons.length === 0) return of(seasons);

    return forkJoin(
      seasons.map(season => {
        // Anything Sleeper calls complete definitely has games, no need to ask.
        if (season.status === 'complete') return of({ ...season, hasStarted: true });

        return this.sleeper.getMatchups(season.leagueId, 1).pipe(
          map(week1 => ({ ...season, hasStarted: week1.length > 0 })),
          catchError(() => of({ ...season, hasStarted: false }))
        );
      })
    );
  }

  /** Drops anything older than the first season worth tracking. */
  private applyFirstTrackedSeason(seasons: SeasonSummary[], config: LeagueConfig): SeasonSummary[] {
    const first = config.league.firstTrackedSeason;
    if (!first) return seasons;
    return seasons.filter(s => s.year >= first);
  }

  // Cache

  private readCache(): SeasonSummary[] | null {
    try {
      const raw = localStorage.getItem(SEASON_INDEX_CACHE_KEY);
      if (!raw) return null;

      const cached = JSON.parse(raw) as CachedIndex;
      if (!Array.isArray(cached.seasons) || cached.seasons.length === 0) return null;

      if (Date.now() - cached.timestamp > SEASON_INDEX_TTL_MS) {
        localStorage.removeItem(SEASON_INDEX_CACHE_KEY);
        return null;
      }

      return cached.seasons;
    } catch {
      return null;
    }
  }

  private writeCache(seasons: SeasonSummary[]): void {
    if (seasons.length === 0) return;

    try {
      const payload: CachedIndex = { timestamp: Date.now(), seasons };
      localStorage.setItem(SEASON_INDEX_CACHE_KEY, JSON.stringify(payload));
    } catch {
      // Tiny amount of data, so this realistically only fails if storage is switched off.
      // Not worth doing anything about, the app just re-walks the chain next time.
    }
  }
}
