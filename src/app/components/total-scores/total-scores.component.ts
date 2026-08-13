import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { LeagueService } from '../../services/league.service';
import type { TeamSeasonTotal } from '../../models/models';

@Component({
  selector: 'app-total-scores',
  imports: [CommonModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">Total Scores</h1>
          <p class="page-sub">
            Season-long cumulative points leaderboard
            @if (season()) { <span class="season-chip">{{ season() }}</span> }
            @if (fromArchive()) {
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

      @if (loading()) {
        <div class="skeleton-list">
          @for (i of [1,2,3,4,5,6,7,8,9,10]; track i) {
            <div class="skeleton-row"></div>
          }
        </div>
      } @else if (totals().length) {
        <div class="leaderboard">
          @for (entry of totals(); track entry.team.id; let i = $index) {
            <div class="leaderboard-row" [class.podium-1]="i===0" [class.podium-2]="i===1" [class.podium-3]="i===2">
              <div class="rank">
                @if (i === 0) { <span class="medal">🥇</span> }
                @else if (i === 1) { <span class="medal">🥈</span> }
                @else if (i === 2) { <span class="medal">🥉</span> }
                @else { <span class="rank-num">{{ i + 1 }}</span> }
              </div>

              <img class="avatar" [src]="entry.team.avatarUrl" [alt]="entry.team.teamName" (error)="onImgError($event)">

              <div class="team-info">
                <div class="team-name">{{ entry.team.teamName }}</div>
                <div class="owner-name">{{ entry.team.ownerName }}</div>
                @if (entry.weeklyWins || entry.playerWins) {
                  <div class="award-chips">
                    @if (entry.weeklyWins) {
                      <span class="award-chip">{{ entry.weeklyWins }} top {{ entry.weeklyWins === 1 ? 'week' : 'weeks' }}</span>
                    }
                    @if (entry.playerWins) {
                      <span class="award-chip">{{ entry.playerWins }} top {{ entry.playerWins === 1 ? 'player' : 'players' }}</span>
                    }
                  </div>
                }
              </div>

              <div class="score-section">
                <div class="total-score">{{ entry.totalScore | number:'1.2-2' }}</div>
                <div class="score-label">points</div>
              </div>

              @if (i === 0 && totals().length > 1) {
                <div class="lead-badge">
                  +{{ (entry.totalScore - totals()[1].totalScore) | number:'1.2-2' }} lead
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 2rem; max-width: 800px; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.5rem; gap: 1rem; flex-wrap: wrap; }
    .page-title { font-size: 1.75rem; font-weight: 800; color: var(--text-primary); margin: 0; }
    .page-sub { color: var(--text-muted); margin: 0.25rem 0 0; font-size: 0.875rem; }
    .season-chip { display: inline-block; margin-left: 0.5rem; padding: 0.1rem 0.5rem; border-radius: 20px; background: var(--surface-hover); color: var(--text-secondary); font-size: 0.7rem; font-weight: 600; }
    .season-chip.archive { background: var(--accent-dim); color: var(--accent); }

    .btn-refresh { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; border-radius: 8px; background: var(--surface); border: 1px solid var(--border); color: var(--text-primary); font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: all 0.15s ease; }
    .btn-refresh svg { width: 15px; height: 15px; }
    .btn-refresh:hover:not(:disabled) { background: var(--surface-hover); }
    .btn-refresh:disabled { opacity: 0.5; cursor: not-allowed; }
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error-banner { background: #3d1a1a; border: 1px solid #7a2e2e; color: #ff8080; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.875rem; }

    .leaderboard { display: flex; flex-direction: column; gap: 0.5rem; }

    .leaderboard-row {
      display: flex; align-items: center; gap: 1rem;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; padding: 0.875rem 1.25rem;
      transition: border-color 0.15s ease;
      position: relative; overflow: hidden;
    }
    .podium-1 { border-color: #b45309; background: linear-gradient(135deg, var(--surface) 0%, #2a1f0a 100%); }
    .podium-2 { border-color: #475569; background: linear-gradient(135deg, var(--surface) 0%, #1a1f28 100%); }
    .podium-3 { border-color: #7c3d1e; background: linear-gradient(135deg, var(--surface) 0%, #2a1810 100%); }

    .rank { width: 2.5rem; flex-shrink: 0; text-align: center; }
    .medal { font-size: 1.4rem; }
    .rank-num { font-size: 1rem; font-weight: 700; color: var(--text-muted); }

    .avatar { width: 46px; height: 46px; border-radius: 50%; border: 2px solid var(--border); object-fit: cover; flex-shrink: 0; }

    .award-chips { display: flex; gap: 0.3rem; margin-top: 0.3rem; flex-wrap: wrap; }
    .award-chip { font-size: 0.65rem; font-weight: 600; padding: 0.1rem 0.4rem; border-radius: 4px; background: var(--accent-dim); color: var(--accent); white-space: nowrap; }

    .team-info { flex: 1; min-width: 0; }
    .team-name { font-size: 0.95rem; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .owner-name { font-size: 0.78rem; color: var(--text-muted); margin-top: 0.1rem; }

    .score-section { text-align: right; flex-shrink: 0; }
    .total-score { font-size: 1.35rem; font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums; }
    .score-label { font-size: 0.68rem; color: var(--text-muted); text-transform: uppercase; }

    .lead-badge { font-size: 0.7rem; font-weight: 600; color: #f59e0b; background: #2a1f0a; padding: 0.2rem 0.5rem; border-radius: 20px; white-space: nowrap; }

    .skeleton-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .skeleton-row { height: 72px; background: var(--surface); border-radius: 12px; animation: pulse 1.5s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

    /*
      Phone layout. Most people open this on their phone, so the team name matters more
      than a big score. Let the name wrap onto a second line instead of cutting it off,
      shrink the score a bit to make room, and put the award chips on one line.
    */
    @media (max-width: 640px) {
      .page { padding: 1rem; }
      .lead-badge { display: none; }
      .btn-refresh { min-height: 44px; padding: 0.5rem 1.1rem; }

      .leaderboard-row { gap: 0.7rem; padding: 0.75rem 0.85rem; }
      .rank { width: 1.6rem; }
      .medal { font-size: 1.2rem; }
      .avatar { width: 40px; height: 40px; }

      .team-name { white-space: normal; overflow: visible; overflow-wrap: anywhere; line-height: 1.25; }

      .total-score { font-size: 1.15rem; }
      .score-label { font-size: 0.6rem; }

      .award-chips { gap: 0.25rem; }
      .award-chip { font-size: 0.6rem; }
    }
  `]
})
export class TotalScoresComponent implements OnInit {
  private leagueService = inject(LeagueService);
  private route = inject(ActivatedRoute);

  loading = signal(true);
  error = signal<string | null>(null);
  totals = signal<TeamSeasonTotal[]>([]);
  season = signal<string>('');
  fromArchive = signal(false);

  /** The season being shown, straight from the URL. */
  private year = signal<number | null>(null);

  ngOnInit() {
    this.route.paramMap.pipe(map(params => Number(params.get('year')))).subscribe(year => {
      if (!Number.isFinite(year)) return;
      this.year.set(year);
      this.loadData();
    });
  }

  /** Refresh goes back to Sleeper for fresh scores instead of reusing what's in memory. */
  refresh() { this.loadData(true); }

  private loadData(forceRefresh = false) {
    const year = this.year();
    if (year === null) return;

    this.loading.set(true);
    this.error.set(null);

    this.leagueService.loadSeason(year, forceRefresh).subscribe({
      next: ({ config, teams, matchupsByWeek, seasonState }) => {
        this.season.set(seasonState.season);
        this.fromArchive.set(config.fromArchive);

        // The weekly winners feed the award counts on each row, so they have to be worked
        // out before the totals. This is all local math on data that's already loaded,
        // so it costs nothing extra in API calls.
        const winners = this.leagueService.computeWeeklyWinners(
          matchupsByWeek, teams, config, seasonState
        );

        this.totals.set(
          this.leagueService.computeSeasonTotals(matchupsByWeek, teams, config, winners)
        );
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.error.set(err?.message ?? 'Could not load data from Sleeper.');
        this.loading.set(false);
      }
    });
  }

  onImgError(event: Event) {
    (event.target as HTMLImageElement).src = 'https://ui-avatars.com/api/?name=?&background=1a1a2e&color=f2a93b';
  }
}
