import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { LeagueService } from '../../services/league.service';
import type { WeeklyWinner, ResolvedSeasonConfig, WeekMatchup, SeasonState } from '../../models/models';

@Component({
  selector: 'app-weekly',
  imports: [CommonModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">Weekly Winners</h1>
          <p class="page-sub">
            Top team score &amp; position of the week
            @if (seasonState(); as season) {
              <span class="season-chip">{{ season.season }} season</span>
              @if (season.isComplete) { <span class="season-chip">Complete</span> }
            }
            @if (config()?.fromArchive) {
              <span class="season-chip archive" title="Loaded from src/seasons/, not from the Sleeper API">Archived</span>
            }
          </p>
        </div>
        <button class="btn-refresh" (click)="refresh()" [disabled]="loading()">
          <svg [class.spin]="loading()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          {{ loading() ? 'Loading...' : 'Refresh' }}
        </button>
      </div>

      @if (error()) {
        <div class="error-banner">⚠️ {{ error() }}</div>
      }

      @if (!loading() && config()) {
        <!-- Week selector -->
        <div class="week-tabs">
          @for (rot of config()!.weeklyPositionRotation; track rot.week) {
            <button
              class="week-tab"
              [class.active]="selectedWeek() === rot.week"
              [class.current]="rot.week === liveWeek()"
              (click)="selectedWeek.set(rot.week)">
              {{ rot.week }}
            </button>
          }
        </div>

        @if (currentWinner()) {
          <div class="week-meta">
            <span class="week-label">Week {{ selectedWeek() }}</span>
            <span class="status-badge" [class]="'status-' + currentWinner()!.status.toLowerCase()">
              {{ currentWinner()!.status === 'PENDING' ? '🔴 Live' : currentWinner()!.status === 'FINAL' ? '✅ Final' : '⏳ Not Started' }}
            </span>
            <span class="position-badge">{{ currentWinner()!.positionLabel }} Week</span>
          </div>

          @if (currentWinner()!.status === 'FUTURE') {
            <div class="future-state">
              <div class="future-icon">📅</div>
              <p>Week {{ selectedWeek() }} hasn't started yet.</p>
              <p class="future-sub">This week's position: <strong>{{ currentWinner()!.positionLabel }}</strong></p>
            </div>
          } @else {
            <div class="winners-grid">

              <!-- Top Team Card -->
              <div class="winner-card">
                <div class="card-eyebrow">
                  <span class="trophy">🏆</span>
                  Top Scoring Team
                </div>
                @if (currentWinner()!.topTeam) {
                  <div class="card-hero">
                    <img class="avatar" [src]="currentWinner()!.topTeam!.avatarUrl" [alt]="currentWinner()!.topTeam!.teamName" (error)="onImgError($event)">
                    <div class="card-hero-info">
                      <div class="hero-name">{{ currentWinner()!.topTeam!.teamName }}</div>
                      <div class="hero-sub">{{ currentWinner()!.topTeam!.ownerName }}</div>
                    </div>
                    <div class="hero-score">
                      <span class="score-big">{{ currentWinner()!.topTeamScore | number:'1.2-2' }}</span>
                      <span class="score-label">pts</span>
                    </div>
                  </div>
                  @if (topTeamStarters()) {
                    <div class="starters-list">
                      <div class="starters-header">Top Starters</div>
                      @for (s of topTeamStarters()!.slice(0, 5); track s.playerId) {
                        <div class="starter-row">
                          <span class="pos-chip" [attr.data-pos]="s.position">{{ s.position }}</span>
                          <span class="starter-name">{{ s.playerName }}</span>
                          <span class="starter-score">{{ s.score | number:'1.2-2' }}</span>
                        </div>
                      }
                    </div>
                  }
                } @else {
                  <p class="empty-state">No data available.</p>
                }
              </div>

              <!--
                Built to mirror the Top Scoring Team card next to it. Both awards are won by
                a team, not by a player, so both cards lead with the team name and then show
                the detail underneath. The player who actually did it is the supporting line
                here, the same way the top starters are on the other card.
              -->
              <div class="winner-card accent-card">
                <div class="card-eyebrow">
                  <span class="trophy">👑</span>
                  Position of the Week: {{ currentWinner()!.positionLabel }}
                </div>
                @if (currentWinner()!.topPlayer) {
                  <div class="card-hero">
                    @if (currentWinner()!.topPlayerTeam; as owner) {
                      <img class="avatar" [src]="owner.avatarUrl" [alt]="owner.teamName" (error)="onImgError($event)">
                    }
                    <div class="card-hero-info">
                      <div class="hero-name">{{ currentWinner()!.topPlayerTeam?.teamName ?? 'Unknown team' }}</div>
                      <div class="hero-sub">{{ currentWinner()!.topPlayerTeam?.ownerName ?? '' }}</div>
                    </div>
                    <div class="hero-score">
                      <span class="score-big">{{ currentWinner()!.topPlayer!.score | number:'1.2-2' }}</span>
                      <span class="score-label">pts</span>
                    </div>
                  </div>

                  <div class="starters-list">
                    <div class="starters-header">Top {{ currentWinner()!.positionLabel }}</div>
                    <div class="starter-row">
                      <span class="pos-chip" [attr.data-pos]="currentWinner()!.topPlayer!.position">{{ currentWinner()!.topPlayer!.position }}</span>
                      <span class="starter-name">{{ currentWinner()!.topPlayer!.playerName }}</span>
                      <span class="starter-score">{{ currentWinner()!.topPlayer!.score | number:'1.2-2' }}</span>
                    </div>
                  </div>
                } @else {
                  <p class="empty-state">No {{ currentWinner()!.positionLabel }} scores recorded.</p>
                }
              </div>

            </div>
          }
        }
      } @else if (loading()) {
        <div class="skeleton-grid">
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 2rem; max-width: 1000px; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.5rem; gap: 1rem; flex-wrap: wrap; }
    .page-title { font-size: 1.75rem; font-weight: 800; color: var(--text-primary); margin: 0; }
    .page-sub { color: var(--text-muted); margin: 0.25rem 0 0; font-size: 0.875rem; }
    .season-chip { display: inline-block; margin-left: 0.5rem; padding: 0.1rem 0.5rem; border-radius: 20px; background: var(--surface-hover); color: var(--text-secondary); font-size: 0.7rem; font-weight: 600; }
    .season-chip.archive { background: var(--accent-dim); color: var(--accent); }

    .btn-refresh {
      display: flex; align-items: center; gap: 0.5rem;
      padding: 0.5rem 1rem; border-radius: 8px;
      background: var(--surface); border: 1px solid var(--border);
      color: var(--text-primary); font-size: 0.875rem; font-weight: 500;
      cursor: pointer; transition: all 0.15s ease;
      white-space: nowrap;
    }
    .btn-refresh svg { width: 15px; height: 15px; }
    .btn-refresh:hover:not(:disabled) { background: var(--surface-hover); }
    .btn-refresh:disabled { opacity: 0.5; cursor: not-allowed; }
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .error-banner { background: #3d1a1a; border: 1px solid #7a2e2e; color: #ff8080; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.875rem; }

    .week-tabs { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 1.25rem; }
    .week-tab {
      width: 2.5rem; height: 2.5rem;
      border-radius: 8px; border: 1px solid var(--border);
      background: var(--surface); color: var(--text-secondary);
      font-size: 0.8rem; font-weight: 600; cursor: pointer;
      transition: all 0.15s ease;
    }
    .week-tab:hover { background: var(--surface-hover); color: var(--text-primary); }
    .week-tab.active { background: var(--accent); color: #000; border-color: var(--accent); }
    .week-tab.current { border-color: var(--accent); }

    .week-meta { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
    .week-label { font-size: 1.1rem; font-weight: 700; color: var(--text-primary); }
    .status-badge { padding: 0.25rem 0.65rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; }
    .status-final { background: #0d3321; color: #4ade80; }
    .status-pending { background: #3d2800; color: #fb923c; }
    .status-future { background: var(--surface); color: var(--text-muted); }
    .position-badge { padding: 0.25rem 0.65rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; background: var(--accent-dim); color: var(--accent); }

    .future-state { text-align: center; padding: 3rem 1rem; color: var(--text-muted); }
    .future-icon { font-size: 3rem; margin-bottom: 0.75rem; }
    .future-sub { margin-top: 0.5rem; font-size: 0.875rem; }

    .winners-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }

    .winner-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 14px; padding: 1.25rem;

      /* Grid items refuse to shrink past their content by default, which pushed these
         cards wider than the screen on a narrow phone and gave the whole page a
         sideways scrollbar. This lets them shrink so the names ellipsis instead. */
      min-width: 0;
    }
    .accent-card { border-color: var(--accent-dim); }

    .card-eyebrow { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 1rem; }
    .trophy { font-size: 1rem; }

    .card-hero { display: flex; align-items: center; gap: 0.875rem; margin-bottom: 1rem; }
    .avatar { width: 52px; height: 52px; border-radius: 50%; border: 2px solid var(--border); object-fit: cover; flex-shrink: 0; background: var(--surface-hover); }

    .card-hero-info { flex: 1; min-width: 0; }
    .hero-name { font-size: 1rem; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .hero-sub { font-size: 0.8rem; color: var(--text-muted); margin-top: 0.1rem; }

    .hero-score { text-align: right; flex-shrink: 0; }
    .score-big { display: block; font-size: 1.75rem; font-weight: 800; color: var(--accent); line-height: 1; }
    .score-label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; }

    .starters-list { border-top: 1px solid var(--border); padding-top: 0.875rem; }
    .starters-header { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 0.5rem; }
    .starter-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0; }
    .pos-chip { font-size: 0.65rem; font-weight: 700; padding: 0.15rem 0.4rem; border-radius: 4px; background: var(--surface-hover); color: var(--text-muted); min-width: 2.5rem; text-align: center; }
    .pos-chip[data-pos="QB"] { background: #1e3a5f; color: #60a5fa; }
    .pos-chip[data-pos="RB"] { background: #1a3d2e; color: #4ade80; }
    .pos-chip[data-pos="WR"] { background: #3d1a3d; color: #c084fc; }
    .pos-chip[data-pos="TE"] { background: #3d2800; color: #fb923c; }
    .pos-chip[data-pos="K"]  { background: #1a1a3d; color: #818cf8; }
    .pos-chip[data-pos="DEF"]{ background: #3d1a1a; color: #f87171; }
    .starter-name { flex: 1; font-size: 0.82rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .starter-score { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); font-variant-numeric: tabular-nums; }


    .empty-state { color: var(--text-muted); font-size: 0.875rem; padding: 1rem 0; }

    .skeleton-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; margin-top: 1rem; }
    .skeleton-card { height: 280px; background: var(--surface); border-radius: 14px; animation: pulse 1.5s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

    /*
      Phone layout, and it has to stay at the bottom of this stylesheet. A media query
      doesn't beat a plain rule that comes after it, they have the same weight and the last
      one wins, so putting this any higher up means the desktop rules quietly undo it.

      Cards stack, anything you tap is sized for a thumb, and the team name is allowed to
      wrap rather than being cut off mid word.
    */
    @media (max-width: 640px) {
      .page { padding: 1rem; }
      .winners-grid, .skeleton-grid { grid-template-columns: 1fr; }

      .week-tabs { gap: 0.4rem; }
      .week-tab { width: 2.75rem; height: 2.75rem; font-size: 0.85rem; }
      .btn-refresh { min-height: 44px; padding: 0.5rem 1.1rem; }

      .hero-name { white-space: normal; overflow: visible; overflow-wrap: anywhere; line-height: 1.25; }
      .score-big { font-size: 1.5rem; }
      .avatar { width: 46px; height: 46px; }
    }
  `]
})
export class WeeklyComponent implements OnInit {
  private leagueService = inject(LeagueService);
  private route = inject(ActivatedRoute);

  loading = signal(true);
  error = signal<string | null>(null);
  config = signal<ResolvedSeasonConfig | null>(null);
  seasonState = signal<SeasonState | null>(null);
  selectedWeek = signal(1);

  /** The season being shown, straight from the URL. */
  private year = signal<number | null>(null);

  private winners = signal<WeeklyWinner[]>([]);
  private matchupsByWeek = signal<Map<number, WeekMatchup[]>>(new Map());

  /**
   * Whether the very first load has happened yet. This is what keeps Refresh from moving
   * the week tab. Before, refreshing called the same load method as startup and that method
   * always jumped the view back to the current week, so hitting Refresh while looking at
   * week 8 landed you back on week 1.
   */
  private hasPickedInitialWeek = false;

  /**
   * The week to outline in the tab strip as "this one is happening now". A finished season
   * doesn't have one, so this returns 0 and nothing gets outlined.
   */
  liveWeek = computed(() => {
    const season = this.seasonState();
    if (!season || season.isComplete) return 0;
    return season.currentWeek;
  });

  currentWinner = computed(() =>
    this.winners().find(w => w.week === this.selectedWeek()) ?? null
  );

  topTeamStarters = computed(() => {
    const winner = this.currentWinner();
    if (!winner?.topTeam) return null;
    const matchups = this.matchupsByWeek().get(winner.week) ?? [];
    const mu = matchups.find(m => m.teamId === winner.topTeam!.id);
    return mu?.starters.slice().sort((a, b) => b.score - a.score) ?? null;
  });

  ngOnInit() {
    // Subscribing to the params rather than reading them once means switching seasons in
    // the sidebar reloads this page in place instead of needing a full navigation.
    this.route.paramMap.pipe(map(params => Number(params.get('year')))).subscribe(year => {
      if (!Number.isFinite(year)) return;

      this.year.set(year);

      // A different season gets to choose its own starting week.
      this.hasPickedInitialWeek = false;
      this.loadData();
    });
  }

  /** Refresh goes back to Sleeper for fresh scores instead of reusing what's in memory. */
  refresh() {
    this.loadData(true);
  }

  private loadData(forceRefresh = false) {
    const year = this.year();
    if (year === null) return;

    this.loading.set(true);
    this.error.set(null);

    this.leagueService.loadSeason(year, forceRefresh).subscribe({
      next: ({ config, teams, matchupsByWeek, seasonState }) => {
        this.config.set(config);
        this.seasonState.set(seasonState);
        this.matchupsByWeek.set(matchupsByWeek);

        this.winners.set(this.leagueService.computeWeeklyWinners(
          matchupsByWeek, teams, config, seasonState
        ));

        // Only choose a week on the first load of a season. After that whatever tab is open
        // stays put, so hitting Refresh on week 8 doesn't land you back on week 1.
        if (!this.hasPickedInitialWeek) {
          this.selectedWeek.set(this.defaultWeek(seasonState, config));
          this.hasPickedInitialWeek = true;
        }

        this.loading.set(false);
      },
      error: (err: Error) => {
        this.error.set(err?.message ?? 'Could not load data from Sleeper.');
        this.loading.set(false);
      }
    });
  }

  /**
   * Which week to land on when the page first opens. A season still being played opens on
   * the week in progress. A finished season opens on the last week of the regular season,
   * since that's the most recent thing that happened and opening on week 1 of a season
   * that ended months ago isn't much use.
   */
  private defaultWeek(season: SeasonState, config: ResolvedSeasonConfig): number {
    if (season.isComplete) return config.totalRegularSeasonWeeks;
    return season.currentWeek;
  }

  onImgError(event: Event) {
    (event.target as HTMLImageElement).src = 'https://ui-avatars.com/api/?name=?&background=1a1a2e&color=f2a93b';
  }
}
