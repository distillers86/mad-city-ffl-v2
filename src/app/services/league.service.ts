import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, of, switchMap, map, shareReplay, catchError, throwError } from 'rxjs';
import { SleeperService } from './sleeper.service';
import { SeasonIndexService } from './season-index.service';
import { SeasonArchiveService } from './season-archive.service';
import type {
  LeagueConfig, LeagueData, Team, WeekMatchup, StarterScore, SeasonState,
  WeeklyWinner, TeamSeasonTotal, TeamEarnings, EarningsBreakdown, SeasonSummary,
  ResolvedSeasonConfig, ArchivedSeason,
  WeekStatus, WeekRotation, SleeperLeague, SleeperNflState, SleeperUser, SleeperRoster,
  SleeperPlayer, SleeperBracketNode
} from '../models/models';

/**
 * This is the brain of the app. It pulls a season's data down, turns it into the app's own
 * shapes, and does all the payout math on top of that.
 *
 * The split: sleeper.service.ts knows how to talk to Sleeper and nothing else, this file
 * knows all the league's rules and nothing about HTTP beyond calling that service, and the
 * components just render whatever comes out of here. If a payout looks wrong on screen,
 * the math is in this file and nowhere else.
 *
 * Everything is scoped to a season. There's no such thing as "the current data" any more,
 * only "the data for year X", because the app can show any season the league has played.
 */
@Injectable({ providedIn: 'root' })
export class LeagueService {
  private http = inject(HttpClient);
  private sleeper = inject(SleeperService);
  private seasonIndex = inject(SeasonIndexService);
  private archive = inject(SeasonArchiveService);

  /**
   * league.config.json is served as a plain static file rather than compiled in, so payouts
   * or the position rotation can change without touching any TypeScript. shareReplay means
   * it only gets fetched once no matter how many things ask for it.
   */
  private config$ = this.http.get<LeagueConfig>('league.config.json').pipe(shareReplay(1));

  /**
   * Loaded seasons, keyed by year.
   *
   * All three pages need the same twenty-odd calls for a season, and without this each one
   * would fire its own set on every click between them. That was the single biggest waste
   * in the old app. Keying by year means flipping back and forth between seasons is free
   * too, not just flipping between pages.
   */
  private loadedSeasons = new Map<number, Observable<LeagueData>>();

  getConfig(): Observable<LeagueConfig> {
    return this.config$;
  }

  /** Every season the app can show, newest first. This is what fills the year picker. */
  getSeasons(): Observable<SeasonSummary[]> {
    return this.config$.pipe(switchMap(config => this.seasonIndex.getSeasons(config)));
  }

  /**
   * Which season to open on when somebody lands on the site with no year in the URL.
   *
   * The newest season isn't always the right answer. In August the next season's league
   * already exists but hasn't been drafted, so opening on it would show a page of blanks.
   * The newest season that actually has games in it wins instead.
   */
  getDefaultSeason(): Observable<SeasonSummary | null> {
    return this.getSeasons().pipe(
      map(seasons => seasons.find(s => s.hasStarted) ?? seasons[0] ?? null)
    );
  }

  // Loading

  /**
   * Everything the app needs for one season.
   *
   * Pass true to force a fresh trip to Sleeper, which is what the Refresh buttons do.
   * Otherwise you get whatever was already loaded for that year.
   */
  loadSeason(year: number, forceRefresh = false): Observable<LeagueData> {
    if (forceRefresh) {
      this.loadedSeasons.delete(year);
      this.seasonIndex.clearCache();

      // The player cache deliberately isn't cleared here. Whether it's even relevant
      // depends on where this season's data comes from, and that isn't known yet, so the
      // decision happens further down in fetchSeason once the archive has been checked.
    }

    const existing = this.loadedSeasons.get(year);
    if (existing) return existing;

    const load$ = this.fetchSeason(year, forceRefresh).pipe(
      // refCount stays false so the result sticks around after a page unsubscribes.
      // Otherwise navigating away would throw it out and the next page would refetch.
      shareReplay({ bufferSize: 1, refCount: false }),
      catchError(err => {
        // Don't let a failed load stay cached, or every retry would replay the same error
        // and the Refresh button would look broken.
        this.loadedSeasons.delete(year);
        return throwError(() => err);
      })
    );

    this.loadedSeasons.set(year, load$);
    return load$;
  }

  private fetchSeason(year: number, forceRefresh = false): Observable<LeagueData> {
    return this.config$.pipe(
      switchMap(config =>
        this.seasonIndex.getSeasons(config).pipe(
          switchMap(seasons => {
            const summary = seasons.find(s => s.year === year);
            if (!summary) {
              return throwError(() => new Error(`There's no league on record for ${year}.`));
            }

            const seasonConfig = this.resolveSeasonConfig(config, summary);

            // Archived first. A finished season saved to disk never needs the API again.
            return this.archive.load(year).pipe(
              switchMap(archived => {
                if (archived) return of(this.fromArchive(archived, seasonConfig));

                // Only a season coming from the API cares about player names, so this is
                // the only place a refresh should throw that cache away. Doing it up in
                // loadSeason meant hitting Refresh on an archived season binned the whole
                // 2.5MB player list for nothing, and the next live season then had to pull
                // it down again.
                if (forceRefresh) this.sleeper.clearPlayerCache();

                return this.fromApi(config, seasonConfig);
              })
            );
          })
        )
      )
    );
  }

  /**
   * Applies the defaults to one season's config so nothing downstream has to care where a
   * value came from.
   *
   * An override replaces its whole block rather than merging field by field. That's on
   * purpose. Half-merged config is miserable to debug, and this way a season's entry is
   * either empty or it's the complete truth for that year.
   */
  private resolveSeasonConfig(config: LeagueConfig, summary: SeasonSummary): ResolvedSeasonConfig {
    const declared = config.seasons.find(s => s.year === summary.year);

    return {
      year: summary.year,
      leagueId: declared?.leagueId ?? summary.leagueId,

      // Sleeper already knows where the playoffs start, so the length comes from the league
      // itself unless a season explicitly overrides it.
      totalRegularSeasonWeeks: declared?.totalRegularSeasonWeeks ?? summary.totalRegularSeasonWeeks,

      payouts: declared?.payouts ?? config.defaults.payouts,
      weeklyPositionRotation: declared?.weeklyPositionRotation ?? config.defaults.weeklyPositionRotation,
      fromArchive: false,
    };
  }

  /** Rebuilds a season from a saved JSON file, no API calls at all. */
  private fromArchive(archived: ArchivedSeason, seasonConfig: ResolvedSeasonConfig): LeagueData {
    return {
      config: { ...seasonConfig, fromArchive: true },
      teams: archived.teams,
      matchupsByWeek: this.archive.toMatchupMap(archived),

      // An archive only ever gets made from a finished season, so every week is final.
      seasonState: {
        season: String(archived.year),
        isComplete: true,
        currentWeek: seasonConfig.totalRegularSeasonWeeks,
      },

      bracket: archived.bracket,
      rosterPositions: archived.rosterPositions,
    };
  }

  private fromApi(config: LeagueConfig, seasonConfig: ResolvedSeasonConfig): Observable<LeagueData> {
    const leagueId = seasonConfig.leagueId;
    const totalWeeks = seasonConfig.totalRegularSeasonWeeks;
    const weekNumbers = Array.from({ length: totalWeeks }, (_, i) => i + 1);

    return forkJoin({
      league: this.sleeper.getLeague(leagueId),
      rosters: this.sleeper.getRosters(leagueId),
      users: this.sleeper.getUsers(leagueId),
      nflState: this.sleeper.getNflState(config.league.sport),
      bracket: this.sleeper.getWinnersBracket(leagueId),
      weeks: forkJoin(weekNumbers.map(w => this.sleeper.getMatchups(leagueId, w))),
    }).pipe(
      switchMap(({ league, rosters, users, nflState, bracket, weeks }) => {
        // Collect every player who started a game all season, so they can all be looked up
        // in one shot instead of once per week.
        const starterIds = new Set<string>();
        for (const week of weeks) {
          for (const matchup of week) {
            for (const id of matchup.starters ?? []) starterIds.add(id);
          }
        }

        return this.sleeper.getPlayersById([...starterIds]).pipe(
          map(players => ({
            config: seasonConfig,
            teams: this.buildTeams(rosters, users),
            matchupsByWeek: this.buildMatchups(weeks, players, league.roster_positions ?? []),
            seasonState: this.resolveSeasonState(league, nflState, totalWeeks),
            bracket,
            rosterPositions: league.roster_positions ?? [],
          }))
        );
      })
    );
  }

  // Where the season sits in time

  /**
   * Works out whether the season being viewed is finished or still being played.
   *
   * This is the thing the first version got wrong. It compared every week against the NFL's
   * current week and nothing else, so opening the app in August put the NFL at preseason
   * week 0, and the finished 2025 season rendered with week 1 marked live and weeks 2
   * through 14 marked "hasn't started yet". All the scores were sitting right there in the
   * API the whole time.
   *
   * The fix is to ask which season the league belongs to first. If it's a past year, or
   * Sleeper has already flagged it complete, then it's over and every week is final. The
   * NFL's current week only matters when the league is the one being played right now.
   */
  private resolveSeasonState(
    league: SleeperLeague,
    nflState: SleeperNflState,
    totalWeeks: number
  ): SeasonState {
    const isPastSeason = league.season !== nflState.season;
    const isComplete = isPastSeason || league.status === 'complete';

    if (isComplete) {
      return { season: league.season, isComplete: true, currentWeek: totalWeeks };
    }

    // Still being played. `leg` is how many weeks are done in the current season type,
    // which sits at 0 through the whole preseason, so it gets floored at week 1.
    const week = nflState.leg || nflState.week || 1;

    return {
      season: league.season,
      isComplete: false,
      currentWeek: Math.max(1, Math.min(week, totalWeeks)),
    };
  }

  /**
   * Final means it's been played and the money is settled, pending means it's being played
   * right now, future means it hasn't happened. A finished season is final all the way
   * through, which is the whole point of resolveSeasonState above.
   */
  getWeekStatus(week: number, season: SeasonState): WeekStatus {
    if (season.isComplete) return 'FINAL';
    if (week < season.currentWeek) return 'FINAL';
    if (week > season.currentWeek) return 'FUTURE';
    return 'PENDING';
  }

  // Weekly winners

  /**
   * Figures out, for each week, who put up the highest team score and who had the top
   * scoring starter at that week's position.
   *
   * The position of the week comes from league.config.json, and there are three ways a
   * week can define who's eligible. Most weeks filter on the player's position. Weeks
   * built around a lineup slot filter on the slot instead, so on a flex week a running
   * back only counts if he was actually in the FLEX spot and not one of the normal RB
   * spots. And week 13 is a free for all where every starter is eligible.
   *
   * Bench players never count in any of these. The only thing read is the starters array
   * Sleeper hands back, which is the starting lineup and nothing else. The old app got
   * that wrong and it cost an evening of fixing payouts by hand before the commissioner
   * sent money out.
   */
  computeWeeklyWinners(
    matchupsByWeek: Map<number, WeekMatchup[]>,
    teams: Team[],
    config: ResolvedSeasonConfig,
    season: SeasonState
  ): WeeklyWinner[] {
    const teamsById = new Map(teams.map(t => [t.id, t]));

    return config.weeklyPositionRotation.map(rotation => {
      const week = rotation.week;
      const status = this.getWeekStatus(week, season);
      const matchups = matchupsByWeek.get(week) ?? [];

      const empty: WeeklyWinner = {
        week,
        status,
        positionLabel: rotation.label,
        topTeam: null,
        topTeamScore: 0,
        topPlayers: [],
        topPlayerScore: 0,
        topPlayerTeam: null,
      };

      if (status === 'FUTURE' || matchups.length === 0) return empty;

      // Highest team score of the week.
      const topMatchup = matchups.reduce((best, m) => (m.totalScore > best.totalScore ? m : best));

      // Nobody has scored yet, so there's no winner to show even though the week is live.
      if (topMatchup.totalScore <= 0) return empty;

      let topPlayers: StarterScore[] = [];
      let topPlayerTeam: Team | null = null;

      // Starting at 0 rather than -Infinity means a week where nobody scored has no winner,
      // instead of handing the award to an empty lineup slot sitting on zero.
      let bestScore = 0;

      for (const matchup of matchups) {
        const eligible = this.eligibleStarters(matchup.starters, rotation);
        if (eligible.length === 0) continue;

        if (rotation.combined) {
          // A combined week is won by the team, not by one player. Add the eligible slots
          // together and compare those totals, so "QB + Flex" means whoever had the best
          // QB and flex between them rather than whoever owned the single biggest score.
          const total = eligible.reduce((sum, s) => sum + s.score, 0);

          if (total > bestScore) {
            bestScore = total;
            topPlayers = eligible;
            topPlayerTeam = teamsById.get(matchup.teamId) ?? null;
          }
        } else {
          for (const starter of eligible) {
            if (starter.score > bestScore) {
              bestScore = starter.score;
              topPlayers = [starter];
              topPlayerTeam = teamsById.get(matchup.teamId) ?? null;
            }
          }
        }
      }

      return {
        week,
        status,
        positionLabel: rotation.label,
        topTeam: teamsById.get(topMatchup.teamId) ?? null,
        topTeamScore: topMatchup.totalScore,
        topPlayers,
        topPlayerScore: bestScore,
        topPlayerTeam,
      };
    });
  }

  /**
   * Narrows a starting lineup down to the players who can win the week's award.
   *
   * This only ever receives starters, so there's nothing here excluding the bench. The
   * bench simply never gets this far.
   */
  private eligibleStarters(starters: StarterScore[], rotation: WeekRotation): StarterScore[] {
    if (rotation.anyPosition) return starters;

    // Slot beats position when both are set, since a slot rule is the more specific one.
    if (rotation.slots?.length) {
      return starters.filter(s => rotation.slots!.includes(s.starterSlot));
    }

    if (rotation.positions?.length) {
      return starters.filter(s => rotation.positions!.includes(s.position));
    }

    // The config doesn't say who's eligible, so nobody is. Better to show no winner than
    // to quietly hand out money based on a rule that was never written down.
    console.warn(`Week ${rotation.week} in league.config.json has no slots, positions, or anyPosition set, so no player can win it.`);
    return [];
  }

  // Season totals

  /**
   * The cumulative points leaderboard, plus a count of how many weekly awards each team
   * has picked up. The weekly winners have to be computed first and handed in, since
   * that's where the award counts come from.
   */
  computeSeasonTotals(
    matchupsByWeek: Map<number, WeekMatchup[]>,
    teams: Team[],
    config: ResolvedSeasonConfig,
    weeklyWinners: WeeklyWinner[]
  ): TeamSeasonTotal[] {
    const totals = new Map<string, number>();
    const teamAwards = new Map<string, number>();
    const playerAwards = new Map<string, number>();

    for (const team of teams) {
      totals.set(team.id, 0);
      teamAwards.set(team.id, 0);
      playerAwards.set(team.id, 0);
    }

    // Only regular season weeks count toward the season total. Playoff weeks pay out
    // through the bracket instead, so folding them in here would double dip.
    for (let week = 1; week <= config.totalRegularSeasonWeeks; week++) {
      for (const matchup of matchupsByWeek.get(week) ?? []) {
        totals.set(matchup.teamId, (totals.get(matchup.teamId) ?? 0) + matchup.totalScore);
      }
    }

    for (const winner of weeklyWinners) {
      if (winner.status !== 'FINAL') continue;
      if (winner.topTeam) {
        teamAwards.set(winner.topTeam.id, (teamAwards.get(winner.topTeam.id) ?? 0) + 1);
      }
      if (winner.topPlayerTeam) {
        playerAwards.set(winner.topPlayerTeam.id, (playerAwards.get(winner.topPlayerTeam.id) ?? 0) + 1);
      }
    }

    return teams
      .map(team => ({
        team,
        totalScore: totals.get(team.id) ?? 0,
        weeklyWins: teamAwards.get(team.id) ?? 0,
        playerWins: playerAwards.get(team.id) ?? 0,
      }))
      .sort((a, b) => b.totalScore - a.totalScore);
  }

  // Money

  /**
   * Adds up what every team is owed. Nothing gets paid out for a week that isn't final,
   * so a live week shows a leader on the weekly page but no money against their name here
   * until it's actually over.
   */
  computeEarnings(
    weeklyWinners: WeeklyWinner[],
    seasonTotals: TeamSeasonTotal[],
    bracket: SleeperBracketNode[],
    teams: Team[],
    config: ResolvedSeasonConfig
  ): TeamEarnings[] {
    const payouts = config.payouts;
    const tally = new Map<string, { regular: number; playoff: number; breakdown: EarningsBreakdown[] }>();

    for (const team of teams) {
      tally.set(team.id, { regular: 0, playoff: 0, breakdown: [] });
    }

    const award = (teamId: string, amount: number, label: string, isPlayoff = false) => {
      const entry = tally.get(teamId);
      // A playoff bracket can name a roster that isn't in the teams list if something odd
      // happened, so skip rather than blow up.
      if (!entry || amount <= 0) return;
      if (isPlayoff) entry.playoff += amount;
      else entry.regular += amount;
      entry.breakdown.push({ label, amount });
    };

    for (const winner of weeklyWinners) {
      if (winner.status !== 'FINAL') continue;

      if (winner.topTeam) {
        award(winner.topTeam.id, payouts.weeklyTopTeam.amount, `Wk ${winner.week} Top Team`);
      }
      if (winner.topPlayerTeam) {
        award(winner.topPlayerTeam.id, payouts.weeklyTopPlayer.amount, `Wk ${winner.week} Top ${winner.positionLabel}`);
      }
    }

    // Highest cumulative score. Split evenly on the very unlikely chance of a tie.
    if (seasonTotals.length > 0 && seasonTotals[0].totalScore > 0) {
      const best = seasonTotals[0].totalScore;
      const tied = seasonTotals.filter(t => t.totalScore === best);
      const share = payouts.seasonHighTotal.amount / tied.length;
      for (const entry of tied) {
        award(entry.team.id, share, payouts.seasonHighTotal.label);
      }
    }

    const { first, second, third } = this.resolvePlayoffPlaces(bracket);
    if (first != null) award(String(first), payouts.playoffs.first.amount, payouts.playoffs.first.label, true);
    if (second != null) award(String(second), payouts.playoffs.second.amount, payouts.playoffs.second.label, true);
    if (third != null) award(String(third), payouts.playoffs.third.amount, payouts.playoffs.third.label, true);

    return teams
      .map(team => {
        const entry = tally.get(team.id)!;
        return {
          team,
          regularSeason: entry.regular,
          playoffs: entry.playoff,
          total: entry.regular + entry.playoff,
          breakdown: entry.breakdown,
        };
      })
      .sort((a, b) => b.total - a.total);
  }

  /**
   * Pulls the top three finishers out of the playoff bracket, as roster IDs.
   *
   * Sleeper tags the games that decide a placement with a `p` field, so the championship
   * game is p:1 and the third place game is p:3. Reading those directly is the reliable
   * way to do this. The old version guessed by finding the highest round and grabbing
   * whichever semifinal loser happened to come first in the array, which worked by luck
   * and would have picked the wrong team the moment the bracket shape changed.
   *
   * The fallback below only kicks in if Sleeper ever stops sending placement tags.
   */
  private resolvePlayoffPlaces(bracket: SleeperBracketNode[]): {
    first?: number;
    second?: number;
    third?: number;
  } {
    if (!bracket || bracket.length === 0) return {};

    const championship = bracket.find(node => node.p === 1);
    const thirdPlaceGame = bracket.find(node => node.p === 3);

    if (championship) {
      return {
        first: championship.w,
        second: championship.l,
        third: thirdPlaceGame?.w,
      };
    }

    // No placement tags. Fall back to the last round played and take the final from it.
    const lastRound = bracket.reduce((max, node) => Math.max(max, node.r), 0);
    const final = bracket.find(node => node.r === lastRound && node.w != null);

    return { first: final?.w, second: final?.l, third: thirdPlaceGame?.w };
  }

  // Turning Sleeper's data into mine

  private buildTeams(rosters: SleeperRoster[], users: SleeperUser[]): Team[] {
    const usersById = new Map(users.map(u => [u.user_id, u]));

    return rosters.map(roster => {
      const user = usersById.get(roster.owner_id);
      const displayName = user?.display_name ?? 'Unknown';

      return {
        id: String(roster.roster_id),
        ownerName: displayName,

        // Not everybody bothers naming their team, so fall back to their username.
        teamName: user?.metadata?.team_name?.trim() || displayName,

        avatarUrl: this.teamAvatar(user, displayName),
      };
    });
  }

  /**
   * Picks the right picture for a team.
   *
   * Sleeper keeps two of these and they are not interchangeable. `metadata.avatar` is a
   * team image somebody uploaded for this league specifically and arrives as a complete
   * URL. `avatar` is their account picture and is only an ID, so it needs the CDN prefix.
   *
   * The league one gets checked first, because if somebody bothered to upload a team image
   * then that's the picture they want next to their name. Reading only the account avatar
   * is what made half the league show the same stock Sleeper robot even though they'd all
   * set their own team pictures.
   */
  private teamAvatar(user: SleeperUser | undefined, displayName: string): string {
    const leagueImage = user?.metadata?.avatar?.trim();
    if (leagueImage) return leagueImage;

    if (user?.avatar) return `https://sleepercdn.com/avatars/thumbs/${user.avatar}`;

    return this.fallbackAvatar(displayName);
  }

  /** A generated placeholder for anyone who set no picture at all. */
  private fallbackAvatar(name: string): string {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1a1a2e&color=f2a93b`;
  }

  private buildMatchups(
    weeks: { roster_id: number; points: number; players_points: Record<string, number>; starters: string[] }[][],
    players: Record<string, SleeperPlayer>,
    rosterPositions: string[]
  ): Map<number, WeekMatchup[]> {
    const byWeek = new Map<number, WeekMatchup[]>();

    weeks.forEach((matchups, index) => {
      const week = index + 1;

      byWeek.set(week, matchups.map(matchup => ({
        week,
        teamId: String(matchup.roster_id),
        totalScore: matchup.points ?? 0,
        starters: (matchup.starters ?? []).map((playerId, slotIndex) => {
          const player = players[playerId];

          // The starters array lines up with roster_positions index for index, so slot 6
          // in this league is the FLEX. This is the only way to tell a flex running back
          // apart from one in a normal RB spot, which the flex weeks depend on.
          const slot = rosterPositions[slotIndex] ?? '?';

          return {
            playerId,
            playerName: this.playerName(player, playerId),
            position: player?.position ?? slot,
            score: (matchup.players_points ?? {})[playerId] ?? 0,
            starterSlot: slot,
          };
        }),
      })));
    });

    return byWeek;
  }

  /**
   * Real players have a full_name. Team defenses don't, they come back with the city in
   * first_name and the team in last_name, so Buffalo is "Buffalo" plus "Bills". Sticking
   * those together covers both cases.
   *
   * An empty starting slot comes through as an ID Sleeper has no record of, which is why
   * there's a last resort here rather than a blank space on screen.
   */
  private playerName(player: SleeperPlayer | undefined, playerId: string): string {
    if (!player) return `Unknown (${playerId})`;

    if (player.full_name) return player.full_name;

    const joined = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim();
    return joined || `Unknown (${playerId})`;
  }
}
