import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, map, tap } from 'rxjs';
import type {
  SleeperLeague, SleeperRoster, SleeperUser, SleeperMatchup, SleeperAccount,
  SleeperPlayer, SleeperNflState, SleeperBracketNode
} from '../models/models';

/**
 * This is the only file that talks to Sleeper. Everything here is a thin wrapper around one
 * endpoint, with no logic in it beyond the player caching below. It's the complete list of
 * what the app ever asks Sleeper for.
 *
 * Sleeper's API is public and needs no key, but they ask you to stay under 1000 calls a
 * minute or they'll block your IP. A full page load here is about 20 calls, so that's not a
 * real risk, but it is why the player endpoint gets special treatment.
 */

const BASE = 'https://api.sleeper.app/v1';

const PLAYER_CACHE_KEY = 'mcffl_players_cache';
const PLAYER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * What goes in localStorage.
 *
 * `players` only holds the guys that have actually been looked up, never the whole league.
 * See the long note on getPlayersById() for why that matters so much.
 *
 * `lookedUp` is every ID ever asked about, including ones Sleeper had no record of. Without
 * it, a single unknown ID would count as a cache miss forever and the entire player list
 * would get re-downloaded on every single page load.
 */
interface PlayerCache {
  timestamp: number;
  players: Record<string, SleeperPlayer>;
  lookedUp: string[];
}

@Injectable({ providedIn: 'root' })
export class SleeperService {
  private http = inject(HttpClient);

  getLeague(leagueId: string): Observable<SleeperLeague> {
    return this.http.get<SleeperLeague>(`${BASE}/league/${leagueId}`);
  }

  /**
   * Looks up a Sleeper account by username. This is needed because every other user
   * endpoint wants the numeric user ID, and the username is the only part that's actually
   * memorable enough to put in a config file.
   */
  getUserByName(username: string): Observable<SleeperAccount> {
    return this.http.get<SleeperAccount>(`${BASE}/user/${encodeURIComponent(username)}`);
  }

  /**
   * Every league an account is in for a given season. This is how the app finds the current
   * year's league without a new ID getting pasted in each August, since Sleeper creates a
   * brand new league with a brand new ID for every season.
   */
  getUserLeagues(userId: string, sport: string, season: number): Observable<SleeperLeague[]> {
    return this.http.get<SleeperLeague[]>(`${BASE}/user/${userId}/leagues/${sport}/${season}`);
  }

  getRosters(leagueId: string): Observable<SleeperRoster[]> {
    return this.http.get<SleeperRoster[]>(`${BASE}/league/${leagueId}/rosters`);
  }

  getUsers(leagueId: string): Observable<SleeperUser[]> {
    return this.http.get<SleeperUser[]>(`${BASE}/league/${leagueId}/users`);
  }

  /**
   * Scores for one week. Worth knowing: Sleeper answers for any week number, even ones that
   * haven't been played. Unplayed weeks come back as a full set of rows with every score
   * sitting at 0, so "did data come back" can't be used to mean "was this played". That's
   * why week status is decided from the season state instead, over in LeagueService.
   */
  getMatchups(leagueId: string, week: number): Observable<SleeperMatchup[]> {
    return this.http.get<SleeperMatchup[]>(`${BASE}/league/${leagueId}/matchups/${week}`);
  }

  /** Where the NFL is right now. This is the real NFL, not the fantasy league. */
  getNflState(sport: string): Observable<SleeperNflState> {
    return this.http.get<SleeperNflState>(`${BASE}/state/${sport}`);
  }

  getWinnersBracket(leagueId: string): Observable<SleeperBracketNode[]> {
    return this.http.get<SleeperBracketNode[]>(`${BASE}/league/${leagueId}/winners_bracket`);
  }

  /**
   * Turns player IDs into names and positions.
   *
   * This one needs explaining, because it's the most expensive thing the app does and the
   * reason the old version got rebuilt in the first place.
   *
   * Sleeper has no endpoint for looking up a handful of players. The only option is
   * /players/nfl, which returns every player in the NFL as one blob. Their docs say it's
   * about 5MB and to call it no more than once a day. As of right now it's actually closer
   * to 15MB, so it's even worse than advertised.
   *
   * The first version of this cached the response by dumping that entire blob into
   * localStorage. That never worked. Browsers cap localStorage at roughly 5MB per site, so
   * the write threw a quota error every single time and got swallowed by the catch below.
   * The cache was always empty, which meant every page click re-downloaded 15MB.
   *
   * The fix is to only ever store the players actually asked about. Across a whole season
   * this league starts about 240 different guys, which comes out to roughly 300KB. That
   * fits with room to spare, so the cache does its job and the big download happens once a
   * day at most.
   */
  getPlayersById(playerIds: string[]): Observable<Record<string, SleeperPlayer>> {
    const wanted = [...new Set(playerIds)];
    const cache = this.loadPlayerCache();

    if (cache) {
      const knownIds = new Set(cache.lookedUp);
      const allKnown = wanted.every(id => knownIds.has(id));

      // Only a hit if every single ID has been looked up before. If even one is new the
      // full list has to come down again, since there's no way to fetch just that player.
      if (allKnown) {
        return of(this.pick(cache.players, wanted));
      }
    }

    return this.http.get<Record<string, SleeperPlayer>>(`${BASE}/players/nfl`).pipe(
      tap(everyone => this.savePlayerCache(everyone, wanted, cache)),
      map(everyone => this.pick(everyone, wanted))
    );
  }

  /** Wipes the player cache so the next lookup re-downloads. Wired to the Refresh buttons. */
  clearPlayerCache(): void {
    try {
      localStorage.removeItem(PLAYER_CACHE_KEY);
    } catch {
      // Nothing to do about it, and an unusable cache is not worth breaking the app over.
    }
  }

  // Cache plumbing

  /** Pulls just the requested IDs out of a bigger map. */
  private pick(source: Record<string, SleeperPlayer>, ids: string[]): Record<string, SleeperPlayer> {
    const result: Record<string, SleeperPlayer> = {};
    for (const id of ids) {
      const player = source[id];
      if (player) result[id] = player;
    }
    return result;
  }

  private loadPlayerCache(): PlayerCache | null {
    try {
      const raw = localStorage.getItem(PLAYER_CACHE_KEY);
      if (!raw) return null;

      const cache = JSON.parse(raw) as PlayerCache;

      // Anything older than a day gets thrown out. Player names barely change but team
      // changes and position changes do, and once a day is what Sleeper asks for anyway.
      if (Date.now() - cache.timestamp > PLAYER_CACHE_TTL_MS) {
        localStorage.removeItem(PLAYER_CACHE_KEY);
        return null;
      }

      // Guard against an old-format cache left over from a previous version of the app.
      if (!cache.players || !Array.isArray(cache.lookedUp)) {
        localStorage.removeItem(PLAYER_CACHE_KEY);
        return null;
      }

      return cache;
    } catch {
      // Corrupt JSON or localStorage blocked entirely. Either way, treat it as no cache.
      return null;
    }
  }

  /**
   * Saves only the players that were asked for, merged on top of whatever was cached so a
   * lookup for a new week doesn't throw away the previous week's names.
   */
  private savePlayerCache(
    everyone: Record<string, SleeperPlayer>,
    wanted: string[],
    previous: PlayerCache | null
  ): void {
    const players = { ...(previous?.players ?? {}), ...this.pick(everyone, wanted) };

    // lookedUp gets every ID that was asked about, even the ones that weren't in Sleeper's
    // response. Recording the misses is what stops them forcing a re-download.
    const lookedUp = [...new Set([...(previous?.lookedUp ?? []), ...wanted])];

    try {
      const cache: PlayerCache = { timestamp: Date.now(), players, lookedUp };
      localStorage.setItem(PLAYER_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Out of storage space, or the browser is in a mode that blocks it. The app still
      // works without a cache, it just has to re-download the player list, so carrying on
      // beats throwing. If this ever starts firing, the console warning below is the clue.
      console.warn('Could not save the player cache. The app will keep working but will re-fetch player data on each load.');
    }
  }
}
