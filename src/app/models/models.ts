/**
 * Every type in the app lives here, split into two groups.
 *
 * The first group mirrors what Sleeper's API actually hands back. Only the fields that
 * actually get used are declared, not the full response, because Sleeper returns a lot
 * that doesn't matter here and listing all of it would just be noise.
 *
 * The second group is the app's own shapes, which are what the components render.
 * Keeping those separate means a field rename on Sleeper's end only breaks the
 * translation in league.service.ts instead of every template.
 */

// What Sleeper hands back

export interface SleeperLeague {
  league_id: string;
  name: string;

  /**
   * The starting lineup slots in order, followed by the bench. This league reads
   * ["QB","RB","RB","WR","WR","TE","FLEX","K","DEF","BN","BN","BN","BN","BN"].
   * It matters because a matchup's `starters` array lines up with this one index for
   * index, which is the only way to tell which player was in the FLEX slot.
   */
  roster_positions: string[];

  /** "pre_draft" | "drafting" | "in_season" | "complete" */
  status: string;

  /** The year this league played, as a string, so "2025". */
  season: string;

  /**
   * Sleeper spins up a brand new league every year and points the new one back at the old
   * one with this field. Walking it backwards is what finds every past season without any
   * league IDs having to be written down.
   */
  previous_league_id: string | null;

  settings?: {
    /**
     * The first playoff week, so the regular season is everything below it. It's 15 here,
     * which makes the regular season weeks 1 through 14. Reading it means the season
     * length never gets hardcoded, and if the commissioner moves the playoffs the app
     * just follows along.
     */
    playoff_week_start?: number;

    /** The first week that counts. Effectively always 1, but read rather than assumed. */
    start_week?: number;
  };
}

/** A Sleeper account. This is only used to turn a username into the numeric ID. */
export interface SleeperAccount {
  user_id: string;
  username: string;
  display_name: string;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string;
  players: string[] | null;
}

export interface SleeperUser {
  user_id: string;
  display_name: string;

  /**
   * The **account** avatar, and only an ID rather than a URL, so it needs the CDN prefix
   * `https://sleepercdn.com/avatars/thumbs/<id>`. This is whatever picture the person uses
   * on Sleeper generally, and plenty of people never change it off the stock one.
   */
  avatar: string | null;

  metadata?: {
    team_name?: string;

    /**
     * A **league specific** team image, uploaded for this league only. This one comes back
     * as a complete URL rather than an ID, so it must not get the CDN prefix stuck on the
     * front of it. When somebody has set one it's the picture they actually want shown
     * next to their team, so it wins over the account avatar above.
     */
    avatar?: string;
  };
}

export interface SleeperMatchup {
  roster_id: number;
  matchup_id: number;

  /** The team's total for the week. Comes back as 0 for weeks that haven't been played. */
  points: number;

  /** Points per player, keyed by Sleeper player ID. */
  players_points: Record<string, number>;

  /** Player IDs in starting lineup order, matching the league's roster_positions. */
  starters: string[];
}

export interface SleeperPlayer {
  player_id: string;

  /** Null for team defenses. Buffalo comes back as first_name "Buffalo", last_name "Bills". */
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  team?: string | null;
}

export interface SleeperNflState {
  /** The NFL's current week. During the preseason this is 1 with a season_type of "pre". */
  week: number;

  /** "pre" | "regular" | "post" */
  season_type: string;

  /** The year the NFL is currently in, which isn't necessarily the year the league is in. */
  season: string;

  /** Weeks completed in the current season type. This sits at 0 all through the preseason. */
  leg: number;

  display_week: number;
}

/**
 * One matchup in the playoff bracket. Sleeper's field names are painfully short:
 * r = round, m = match, t1/t2 = the two teams, w = winner, l = loser, p = placement.
 * The placement field is the useful one, since p:1 is the championship game and
 * p:3 is the third place game.
 */
export interface SleeperBracketNode {
  r: number;
  m: number;
  t1?: number;
  t2?: number;
  w?: number;
  l?: number;
  t1_from?: { w?: number; l?: number };
  t2_from?: { w?: number; l?: number };
  p?: number;
}

// The app's own shapes

export interface Team {
  /** Sleeper's roster_id as a string. This is what everything else keys off of. */
  id: string;
  ownerName: string;
  teamName: string;
  avatarUrl: string;
}

export interface StarterScore {
  playerId: string;
  playerName: string;

  /** The player's real position, so a running back in the flex slot still reads "RB". */
  position: string;

  score: number;

  /** The lineup slot they filled, which is what identifies who was in the FLEX spot. */
  starterSlot: string;
}

export interface WeekMatchup {
  week: number;
  teamId: string;
  totalScore: number;
  starters: StarterScore[];
}

export type WeekStatus = 'FUTURE' | 'PENDING' | 'FINAL';

/**
 * Where a season sits in time. This gets worked out once when the data loads and then
 * passed around, because the answer is the same for every week and every page.
 */
export interface SeasonState {
  /** The year the league played, so "2025". */
  season: string;

  /** True once the season is over, which means every week counts as final. */
  isComplete: boolean;

  /**
   * How far along the season is. Only meaningful while it's still being played, and this
   * gets set to the full regular season length once the season is done.
   */
  currentWeek: number;
}

export interface WeeklyWinner {
  week: number;
  status: WeekStatus;

  /** What shows on screen for the position of the week, so "QB" or "Flex". */
  positionLabel: string;

  topTeam: Team | null;
  topTeamScore: number;

  /**
   * The player or players that won the position award. Usually one, but a combined week
   * like "QB + Flex" is won by a pair, and both of them are worth showing since both
   * contributed to the total.
   */
  topPlayers: StarterScore[];

  /** What the award was actually won with: one player's score, or the combined total. */
  topPlayerScore: number;

  topPlayerTeam: Team | null;
}

export interface TeamSeasonTotal {
  team: Team;
  totalScore: number;

  /** How many weeks this team had the highest score, so how many $25 payouts they took. */
  weeklyWins: number;

  /** How many weeks this team rostered the top scorer at the position of the week. */
  playerWins: number;
}

export interface TeamEarnings {
  team: Team;
  regularSeason: number;
  playoffs: number;
  total: number;
  breakdown: EarningsBreakdown[];
}

export interface EarningsBreakdown {
  label: string;
  amount: number;
}

// The config file
// These mirror league.config.json. Adding a field there means adding it here too,
// otherwise TypeScript won't let it be read.

/**
 * One week's position of the week rule.
 *
 * There are three ways to say who's eligible and a week should use exactly one of them.
 * They're checked in this order: anyPosition, then slots, then positions.
 *
 * Bench players are never eligible under any of them. Only the starting lineup is ever
 * looked at, which is the rule the old app got wrong and cost an evening of fixing
 * payouts by hand.
 */
export interface WeekRotation {
  week: number;

  /** What shows on screen. Free text, so "QB + Flex" is fine. */
  label: string;

  /**
   * Match on the lineup slot the player actually filled, so ["FLEX"] means only the guy in
   * the flex spot counts and a running back in a normal RB slot is ignored. This is for
   * any week where the award is about the slot rather than the position.
   */
  slots?: string[];

  /** Match on the player's real position regardless of which slot they filled. */
  positions?: string[];

  /** Every starter is eligible and both lists above get ignored. */
  anyPosition?: boolean;

  /**
   * Add the eligible slots together per team instead of looking for one standout player.
   *
   * This is what a combined week like "QB + Flex" actually means: whichever team has the
   * best QB and flex **added together** takes it. Without this the award goes to whoever
   * owns the single highest scorer, which is a different question and picks a different
   * team often enough to matter.
   *
   * Only makes sense alongside `slots`.
   */
  combined?: boolean;
}

export interface PayoutTier {
  label: string;
  amount: number;
  description?: string;
}

export interface PayoutStructure {
  weeklyTopTeam: PayoutTier;
  weeklyTopPlayer: PayoutTier;
  seasonHighTotal: PayoutTier;
  playoffs: {
    first: PayoutTier;
    second: PayoutTier;
    third: PayoutTier;
  };
}

/**
 * The rules for one season.
 *
 * Leave `payouts` or `weeklyPositionRotation` off and the season uses the defaults block.
 * Declare either one and it replaces the default **completely** rather than merging field
 * by field. That's deliberate: a half-merged config is miserable to debug, and this way a
 * season's block is either empty or it is the whole truth for that season.
 *
 * In practice every season is just `{ "year": 2025 }`, because the commissioner keeps the
 * featured positions and the payouts the same year to year. The override exists so that a
 * season which ever does play by different rules can say so in the config without any code
 * changing, not because it's expected to come up often.
 */
export interface SeasonConfig {
  year: number;

  /** Replaces the default payouts entirely for this season. */
  payouts?: PayoutStructure;

  /** Replaces the default rotation entirely for this season. */
  weeklyPositionRotation?: WeekRotation[];

  /**
   * Only needed if the app can't find this season's league on its own, which shouldn't
   * happen since Sleeper chains the seasons together.
   */
  leagueId?: string;

  /**
   * Overrides the regular season length. Normally left unset, because Sleeper already says
   * where the playoffs start and the length gets worked out from that.
   */
  totalRegularSeasonWeeks?: number;
}

export interface LeagueConfig {
  league: {
    name: string;

    /**
     * The Sleeper username to look up. That lookup is what finds the right league each
     * year, and it's what stops the config going stale every August when Sleeper mints a
     * new league ID for the new season.
     */
    sleeperUsername: string;

    sport: string;

    /** Don't go back further than this year, even if Sleeper has older seasons. */
    firstTrackedSeason?: number;

    /** Used only if the username lookup fails. The app walks back from here instead. */
    fallbackLeagueId?: string;
  };

  /** What every season uses unless its own block says otherwise. */
  defaults: {
    payouts: PayoutStructure;
    weeklyPositionRotation: WeekRotation[];
  };

  seasons: SeasonConfig[];
}

/**
 * A season's config after the defaults have been applied, so nothing is optional any more.
 * This is what the rest of the app works with, so no code outside the resolver ever has to
 * think about whether a value came from the defaults or from a season override.
 */
export interface ResolvedSeasonConfig {
  year: number;
  leagueId: string;
  totalRegularSeasonWeeks: number;
  payouts: PayoutStructure;
  weeklyPositionRotation: WeekRotation[];

  /** True when this season's numbers came from an archived JSON file instead of the API. */
  fromArchive: boolean;
}

/**
 * One season the app knows how to show, worked out by walking Sleeper's league chain.
 * This is what fills the year picker in the sidebar.
 */
export interface SeasonSummary {
  year: number;
  leagueId: string;

  /** Sleeper's league status: "pre_draft" | "drafting" | "in_season" | "complete" */
  status: string;

  /** Weeks 1 through this count toward weekly payouts and the season total. */
  totalRegularSeasonWeeks: number;

  /** Whether any games have actually been played, so the year picker can flag empty years. */
  hasStarted: boolean;
}

/**
 * A finished season saved to `src/seasons/<year>.json`.
 *
 * Raw results only. The payout amounts deliberately aren't in here, they stay in
 * league.config.json so a fix to the math still applies to old seasons.
 */
export interface ArchivedSeason {
  /** Guards against this app reading a file written by an older, different version. */
  formatVersion: number;

  year: number;
  leagueId: string;

  /** When it was exported, which tells you whether a file predates some fix. */
  exportedAt: string;

  totalRegularSeasonWeeks: number;
  rosterPositions: string[];
  teams: Team[];
  bracket: SleeperBracketNode[];

  /** A Map doesn't survive JSON, so the weeks are stored as an array. */
  weeks: { week: number; matchups: WeekMatchup[] }[];
}

/** Everything one call to LeagueService.loadSeason() hands back. */
export interface LeagueData {
  config: ResolvedSeasonConfig;
  teams: Team[];
  matchupsByWeek: Map<number, WeekMatchup[]>;
  seasonState: SeasonState;
  bracket: SleeperBracketNode[];
  rosterPositions: string[];
}
