import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LeagueService } from '../../services/league.service';
import { SeasonArchiveService } from '../../services/season-archive.service';
import type { LeagueConfig, SeasonSummary } from '../../models/models';

/**
 * League level settings and the season export.
 *
 * This page sits outside the year picker on purpose. It's about the app as a whole, not
 * about one season, so putting it under a year would suggest per-season settings that
 * don't exist.
 */
@Component({
  selector: 'app-settings',
  imports: [CommonModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">League Settings</h1>
          <p class="page-sub">How the app is set up and what it knows about the league</p>
        </div>
      </div>

      <!-- Seasons -->
      <div class="card">
        <div class="card-title">Seasons</div>
        <p class="card-hint">
          These come from Sleeper, not from a list I maintain. Sleeper creates a new league
          every August and links it back to the previous year, so the app follows that chain
          to find every season the league has played.
        </p>

        @if (seasons().length) {
          <div class="season-table">
            @for (season of seasons(); track season.year) {
              <div class="season-row">
                <span class="year">{{ season.year }}</span>
                <span class="league-id">{{ season.leagueId }}</span>
                <span class="weeks">{{ season.totalRegularSeasonWeeks }} wks</span>
                <span class="status" [class.done]="season.status === 'complete'">
                  {{ season.hasStarted ? season.status : 'not started' }}
                </span>
                <button
                  class="btn-export"
                  [disabled]="!season.hasStarted || exporting() === season.year"
                  (click)="exportSeason(season)">
                  {{ exporting() === season.year ? 'Working...' : 'Export' }}
                </button>
              </div>
            }
          </div>
        } @else {
          <p class="empty">Still working out which seasons exist...</p>
        }

        @if (exportError()) {
          <p class="error-note">{{ exportError() }}</p>
        }

        <p class="card-hint archive-note">
          <strong>What Export does:</strong> downloads that season as a JSON file. Drop it in
          <code>src/seasons/</code> (so a 2025 export becomes <code>src/seasons/2025.json</code>),
          then commit and deploy. From then on the app reads that file instead of calling
          Sleeper for that year. If the file isn't there it just uses the API as normal, so
          this is entirely optional. I'm doing it as insurance in case Sleeper ever stops
          serving data more than a few years old.
        </p>
      </div>

      <!-- Configuration -->
      @if (config(); as cfg) {
        <div class="card">
          <div class="card-title">Configuration</div>
          <p class="card-hint">
            Everything here comes from <code>src/league.config.json</code>. Payout amounts and
            the weekly position rotation live in <code>defaults</code>, and any season that
            played by different rules overrides them in its own entry under
            <code>seasons</code>. An override replaces the whole block rather than merging,
            so a season's entry is either empty or it's the complete truth for that year.
          </p>

          <div class="kv">
            <span class="k">League</span><span class="v">{{ cfg.league.name }}</span>
            <span class="k">Sleeper user</span><span class="v">{{ cfg.league.sleeperUsername }}</span>
            <span class="k">Tracking from</span><span class="v">{{ cfg.league.firstTrackedSeason ?? 'as far back as Sleeper goes' }}</span>
          </div>
        </div>

        <div class="config-preview">
          <div class="preview-title">Loaded league.config.json</div>
          <pre class="preview-code">{{ cfg | json }}</pre>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 2rem; max-width: 760px; }
    .page-header { margin-bottom: 1.5rem; }
    .page-title { font-size: 1.75rem; font-weight: 800; color: var(--text-primary); margin: 0; }
    .page-sub { color: var(--text-muted); margin: 0.25rem 0 0; font-size: 0.875rem; }

    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 1.5rem; margin-bottom: 1.5rem; }
    .card-title { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 0.75rem; }
    .card-hint { font-size: 0.8rem; color: var(--text-muted); line-height: 1.6; margin: 0 0 1rem; }
    .card-hint code { background: var(--surface-hover); padding: 0.1rem 0.3rem; border-radius: 4px; font-family: monospace; font-size: 0.75rem; }
    .card-hint strong { color: var(--text-secondary); }
    .archive-note { margin: 1rem 0 0; padding-top: 1rem; border-top: 1px solid var(--border); }

    .season-table { display: flex; flex-direction: column; gap: 0.4rem; }
    .season-row { display: grid; grid-template-columns: 3.5rem 1fr 4rem 6rem auto; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }
    .year { font-weight: 800; color: var(--text-primary); font-size: 0.9rem; }
    .league-id { font-family: monospace; font-size: 0.7rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .weeks { font-size: 0.75rem; color: var(--text-muted); }
    .status { font-size: 0.7rem; font-weight: 600; color: var(--text-muted); text-transform: capitalize; }
    .status.done { color: #4ade80; }

    .btn-export { padding: 0.35rem 0.75rem; border-radius: 6px; background: var(--surface-hover); border: 1px solid var(--border); color: var(--text-primary); font-size: 0.75rem; font-weight: 600; cursor: pointer; white-space: nowrap; }
    .btn-export:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
    .btn-export:disabled { opacity: 0.35; cursor: not-allowed; }

    .empty { font-size: 0.8rem; color: var(--text-muted); }
    .error-note { font-size: 0.8rem; color: #ff8080; margin: 0.75rem 0 0; }

    .kv { display: grid; grid-template-columns: 9rem 1fr; gap: 0.4rem 1rem; font-size: 0.8rem; }
    .k { color: var(--text-muted); }
    .v { color: var(--text-primary); font-weight: 600; }

    .config-preview { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
    .preview-title { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); padding: 0.75rem 1.25rem; border-bottom: 1px solid var(--border); background: var(--surface-hover); }
    .preview-code { margin: 0; padding: 1.25rem; font-size: 0.75rem; color: var(--text-secondary); overflow-x: auto; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }

    @media (max-width: 700px) {
      .page { padding: 1rem; }

      /* The league ID is too long to be useful on a phone and the week count is the same
         for every season, so both give up their space to the status and the button. */
      .season-row { grid-template-columns: 3rem 1fr auto; gap: 0.5rem; padding: 0.6rem 0.75rem; }
      .league-id, .weeks { display: none; }

      .btn-export { min-height: 40px; padding: 0.35rem 0.9rem; }
      .kv { grid-template-columns: 1fr; gap: 0.15rem 0; }
      .k { margin-top: 0.5rem; }
    }
  `]
})
export class SettingsComponent implements OnInit {
  private leagueService = inject(LeagueService);
  private archive = inject(SeasonArchiveService);

  config = signal<LeagueConfig | null>(null);
  seasons = signal<SeasonSummary[]>([]);

  /** Which year is mid-export, so its button can show it's working. */
  exporting = signal<number | null>(null);
  exportError = signal<string | null>(null);

  ngOnInit() {
    this.leagueService.getConfig().subscribe(c => this.config.set(c));
    this.leagueService.getSeasons().subscribe({
      next: seasons => this.seasons.set(seasons),
      error: err => {
        console.error('Could not load the season list.', err);
        this.exportError.set('Could not work out which seasons exist. Check the browser console.');
      }
    });
  }

  /**
   * Loads a season and hands it back as a downloadable JSON file.
   *
   * This goes through the normal load, so if the season is already open in another tab of
   * the app it costs nothing, and whatever gets exported is exactly what the app is
   * showing rather than a separate code path that could drift.
   */
  exportSeason(season: SeasonSummary) {
    this.exporting.set(season.year);
    this.exportError.set(null);

    this.leagueService.loadSeason(season.year).subscribe({
      next: data => {
        this.archive.download(this.archive.buildArchive(data));
        this.exporting.set(null);
      },
      error: (err: Error) => {
        console.error(`Could not export ${season.year}.`, err);
        this.exportError.set(`Could not export ${season.year}: ${err?.message ?? 'unknown error'}`);
        this.exporting.set(null);
      }
    });
  }
}
