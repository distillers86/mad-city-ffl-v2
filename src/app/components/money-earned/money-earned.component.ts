import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { LeagueService } from '../../services/league.service';
import type { TeamEarnings, ResolvedSeasonConfig } from '../../models/models';

@Component({
  selector: 'app-money-earned',
  imports: [CommonModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">Money Earned</h1>
          <p class="page-sub">
            Weekly payouts, season awards &amp; playoff prizes
            @if (season()) { <span class="season-chip">{{ season() }}</span> }
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

      @if (config()) {
        <div class="payout-legend">
          <div class="legend-title">Payout Structure</div>
          <div class="legend-pills">
            <span class="legend-pill">🏆 Weekly Top Team: <strong>\${{ config()!.payouts.weeklyTopTeam.amount }}</strong></span>
            <span class="legend-pill">👑 Weekly Top Player: <strong>\${{ config()!.payouts.weeklyTopPlayer.amount }}</strong></span>
            <span class="legend-pill">📊 Season High Total: <strong>\${{ config()!.payouts.seasonHighTotal.amount }}</strong></span>
            <span class="legend-pill">🥇 1st Place: <strong>\${{ config()!.payouts.playoffs.first.amount }}</strong></span>
            <span class="legend-pill">🥈 2nd Place: <strong>\${{ config()!.payouts.playoffs.second.amount }}</strong></span>
            <span class="legend-pill">🥉 3rd Place: <strong>\${{ config()!.payouts.playoffs.third.amount }}</strong></span>
          </div>
        </div>
      }

      @if (error()) {
        <div class="error-banner">⚠️ {{ error() }}</div>
      }

      @if (loading()) {
        <div class="skeleton-list">
          @for (i of [1,2,3,4,5]; track i) { <div class="skeleton-row"></div> }
        </div>
      } @else if (earnings().length) {
        <div class="earnings-table">
          <div class="table-header">
            <span>Team</span>
            <span>Regular Season</span>
            <span>Playoffs</span>
            <span>Total</span>
          </div>

          @for (entry of earnings(); track entry.team.id; let i = $index) {
            <!--
              The three money cells are wrapped in .money-row so this works on a phone as
              well as a desktop. On a wide screen the wrapper is display:contents, so the
              cells behave as if they were direct children of the row's grid. On a narrow
              one it becomes a three across strip under the team name, with the little
              labels turned on so each number still says what it is once the table header
              is gone.
            -->
            <div class="table-row" [class.top-earner]="i === 0 && entry.total > 0">
              <div class="team-cell">
                <img class="avatar" [src]="entry.team.avatarUrl" [alt]="entry.team.teamName" (error)="onImgError($event)">
                <div class="team-text">
                  <div class="team-name">{{ entry.team.teamName }}</div>
                  <div class="owner-name">{{ entry.team.ownerName }}</div>
                </div>
              </div>

              <div class="money-row">
                <div class="money-cell">
                  <span class="cell-label">Regular</span>
                  {{ entry.regularSeason > 0 ? ('$' + (entry.regularSeason | number:'1.2-2')) : '-' }}
                </div>
                <div class="money-cell playoff-money">
                  <span class="cell-label">Playoffs</span>
                  {{ entry.playoffs > 0 ? ('$' + (entry.playoffs | number:'1.2-2')) : '-' }}
                </div>
                <div class="money-cell total-money" [class.has-money]="entry.total > 0">
                  <span class="cell-label">Total</span>
                  {{ entry.total > 0 ? ('$' + (entry.total | number:'1.2-2')) : '-' }}
                </div>
              </div>

              @if (entry.breakdown.length) {
                <div class="breakdown">
                  @for (b of entry.breakdown; track b.label) {
                    <span class="breakdown-chip">{{ b.label }}: \${{ b.amount | number:'1.0-0' }}</span>
                  }
                </div>
              }
            </div>
          }

          <div class="table-footer">
            <span class="footer-label">Total Paid Out</span>
            <div class="money-row">
              <span class="money-cell"><span class="cell-label">Regular</span>\${{ totalRegular() | number:'1.2-2' }}</span>
              <span class="money-cell"><span class="cell-label">Playoffs</span>\${{ totalPlayoffs() | number:'1.2-2' }}</span>
              <span class="money-cell grand-total"><span class="cell-label">Total</span>\${{ grandTotal() | number:'1.2-2' }}</span>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 2rem; max-width: 900px; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; gap: 1rem; flex-wrap: wrap; }
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

    .payout-legend { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1rem 1.25rem; margin-bottom: 1.25rem; }
    .legend-title { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 0.6rem; }
    .legend-pills { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .legend-pill { font-size: 0.78rem; color: var(--text-secondary); background: var(--surface-hover); padding: 0.25rem 0.6rem; border-radius: 20px; }
    .legend-pill strong { color: var(--accent); }

    .earnings-table { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }

    .table-header {
      display: grid; grid-template-columns: 1fr 130px 100px 100px;
      padding: 0.75rem 1.25rem;
      background: var(--surface-hover);
      font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.08em; color: var(--text-muted);
      border-bottom: 1px solid var(--border);
    }

    .table-row {
      display: grid; grid-template-columns: 1fr 130px 100px 100px;
      padding: 0.875rem 1.25rem;
      border-bottom: 1px solid var(--border);
      transition: background 0.1s ease; align-items: start;
    }
    .table-row:hover { background: var(--surface-hover); }
    .table-row:last-child { border-bottom: none; }
    .top-earner { background: linear-gradient(135deg, var(--surface) 0%, #0d2b1a 100%); }

    /* Lets the three money cells act as direct children of the row's grid. */
    .money-row { display: contents; }

    .team-cell { display: flex; align-items: flex-start; gap: 0.75rem; min-width: 0; }
    .team-text { min-width: 0; }
    .avatar { width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--border); object-fit: cover; flex-shrink: 0; margin-top: 0.1rem; }
    .team-name { font-size: 0.9rem; font-weight: 700; color: var(--text-primary); overflow-wrap: anywhere; }
    .owner-name { font-size: 0.75rem; color: var(--text-muted); overflow-wrap: anywhere; }

    /* Sits under the team name on a wide screen rather than starting a column of its own. */
    .breakdown { grid-column: 1; display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.4rem; padding-left: 3.25rem; }
    .breakdown-chip { font-size: 0.65rem; background: var(--surface-hover); color: var(--text-muted); padding: 0.15rem 0.4rem; border-radius: 4px; }

    .money-cell { font-size: 0.9rem; font-weight: 500; color: var(--text-secondary); padding-top: 0.1rem; font-variant-numeric: tabular-nums; }
    .playoff-money { color: #818cf8; }
    .total-money { color: var(--text-muted); }
    .total-money.has-money { color: var(--accent); font-weight: 700; font-size: 1rem; }

    /* Only shown once the table header is gone on a narrow screen. */
    .cell-label { display: none; }

    .table-footer {
      display: grid; grid-template-columns: 1fr 130px 100px 100px;
      padding: 0.875rem 1.25rem;
      background: var(--surface-hover);
      border-top: 2px solid var(--border);
      font-size: 0.8rem; font-weight: 700; color: var(--text-muted);
    }
    .grand-total { color: var(--accent); font-size: 1rem; }

    .skeleton-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .skeleton-row { height: 80px; background: var(--surface); border-radius: 12px; animation: pulse 1.5s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

    /*
      Phone layout. The four column table can't work at this width, the money columns alone
      need 330px. So each team becomes a stacked card instead: name on top, then the three
      figures side by side, then the breakdown chips.

      The old version of this kept the table and just hid the Regular Season column to make
      things fit, which meant a phone couldn't see most of the payouts. Everything is
      visible here.
    */
    @media (max-width: 700px) {
      .page { padding: 1rem; }

      .btn-refresh { min-height: 44px; padding: 0.5rem 1.1rem; }

      .table-header { display: none; }

      .table-row {
        display: flex; flex-direction: column; gap: 0.7rem;
        padding: 1rem;
      }

      .money-row {
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem;
        padding: 0.6rem 0.75rem;
        background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
      }

      .cell-label {
        display: block;
        font-size: 0.6rem; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.06em; color: var(--text-muted);
        margin-bottom: 0.1rem;
      }

      .money-cell { padding-top: 0; font-size: 0.95rem; font-weight: 600; }
      .total-money.has-money { font-size: 1.05rem; }

      .breakdown { padding-left: 0; margin-top: 0; }

      .table-footer {
        display: flex; flex-direction: column; gap: 0.6rem;
        padding: 1rem;
      }
      .footer-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; }
      .table-footer .money-row { background: transparent; border: none; padding: 0; }
    }
  `]
})
export class MoneyEarnedComponent implements OnInit {
  private leagueService = inject(LeagueService);
  private route = inject(ActivatedRoute);

  loading = signal(true);
  error = signal<string | null>(null);
  earnings = signal<TeamEarnings[]>([]);
  config = signal<ResolvedSeasonConfig | null>(null);
  season = signal<string>('');

  totalRegular = signal(0);
  totalPlayoffs = signal(0);
  grandTotal = signal(0);

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
      next: ({ config, teams, matchupsByWeek, seasonState, bracket }) => {
        this.config.set(config);
        this.season.set(seasonState.season);

        // Each of these feeds the next: the weekly winners decide the weekly payouts, the
        // season totals decide the high score bonus, and the earnings pull both together
        // along with the playoff bracket.
        const winners = this.leagueService.computeWeeklyWinners(
          matchupsByWeek, teams, config, seasonState
        );
        const seasonTotals = this.leagueService.computeSeasonTotals(matchupsByWeek, teams, config, winners);
        const earnings = this.leagueService.computeEarnings(winners, seasonTotals, bracket, teams, config);

        this.earnings.set(earnings);
        this.totalRegular.set(earnings.reduce((s, e) => s + e.regularSeason, 0));
        this.totalPlayoffs.set(earnings.reduce((s, e) => s + e.playoffs, 0));
        this.grandTotal.set(earnings.reduce((s, e) => s + e.total, 0));
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
