import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { LeagueService } from './services/league.service';
import type { LeagueConfig, SeasonSummary } from './models/models';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="app-shell">
      <nav class="sidebar">
        <div class="sidebar-brand">
          <span class="brand-icon">🏈</span>
          <div class="brand-text">
            <span class="brand-name">{{ config()?.league?.name ?? 'Mad City FFL' }}</span>
            <span class="brand-sub">Fantasy Football</span>
          </div>
        </div>

        <!--
          The season picker sits above the pages it applies to, because all three of them
          show one season's data. Changing the year keeps you on whichever page you were
          already looking at rather than dumping you back at the start.
        -->
        <div class="nav-section">
          <span class="nav-section-label">Season</span>
          @if (seasons().length) {
            <!--
              Marking the chosen option with [selected] rather than putting [value] on the
              select. Binding value on the select doesn't stick when the options are
              rendered in the same pass, so the box would show the newest year while the
              page was actually showing a different one.
            -->
            <select class="season-select" (change)="onSeasonChange($event)">
              @for (season of seasons(); track season.year) {
                <option [value]="season.year" [selected]="season.year === activeYear()">
                  {{ season.year }}{{ season.hasStarted ? '' : ' (not started)' }}
                </option>
              }
            </select>
          } @else {
            <div class="season-loading">Loading seasons...</div>
          }
        </div>

        <div class="nav-section">
          <span class="nav-section-label">{{ activeYear() ?? '' }} Pages</span>
          <a [routerLink]="pageLink('weekly')" routerLinkActive="active" class="nav-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Weekly Winners
          </a>
          <a [routerLink]="pageLink('total-scores')" routerLinkActive="active" class="nav-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            Total Scores
          </a>
          <a [routerLink]="pageLink('money-earned')" routerLinkActive="active" class="nav-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><line x1="12" y1="6" x2="12" y2="18"/></svg>
            Money Earned
          </a>
        </div>

        <div class="nav-section">
          <span class="nav-section-label">League</span>
          <a routerLink="/settings" routerLinkActive="active" class="nav-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>
            League Settings
          </a>
        </div>
      </nav>

      <!-- Mobile top bar -->
      <div class="mobile-topbar">
        <div class="mobile-brand-row">
          <span class="brand-name">{{ config()?.league?.name ?? 'Mad City FFL' }}</span>
          @if (seasons().length) {
            <select class="season-select compact" (change)="onSeasonChange($event)">
              @for (season of seasons(); track season.year) {
                <option [value]="season.year" [selected]="season.year === activeYear()">{{ season.year }}</option>
              }
            </select>
          }
        </div>
        <div class="mobile-nav">
          <a [routerLink]="pageLink('weekly')" routerLinkActive="active" class="mobile-nav-link">Weekly</a>
          <a [routerLink]="pageLink('total-scores')" routerLinkActive="active" class="mobile-nav-link">Scores</a>
          <a [routerLink]="pageLink('money-earned')" routerLinkActive="active" class="mobile-nav-link">Money</a>
          <a routerLink="/settings" routerLinkActive="active" class="mobile-nav-link">Settings</a>
        </div>
      </div>

      <main class="main-content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [`
    .app-shell {
      display: flex;
      min-height: 100vh;
      background: var(--bg);
    }

    /* Sidebar */
    .sidebar {
      width: 220px;
      background: var(--surface);
      border-right: 1px solid var(--border);
      padding: 1.5rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 2rem;
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
      flex-shrink: 0;
    }

    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0 0.5rem;
    }

    .brand-icon { font-size: 1.75rem; }

    .brand-text {
      display: flex;
      flex-direction: column;
    }

    .brand-name {
      font-weight: 700;
      font-size: 0.95rem;
      color: var(--text-primary);
      line-height: 1.2;
    }

    .brand-sub {
      font-size: 0.7rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .nav-section {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .nav-section-label {
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--text-muted);
      padding: 0 0.75rem;
      margin-bottom: 0.25rem;
    }

    .nav-link {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.55rem 0.75rem;
      border-radius: 8px;
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 0.875rem;
      font-weight: 500;
      transition: all 0.15s ease;
    }

    .nav-link svg {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    .nav-link:hover {
      background: var(--surface-hover);
      color: var(--text-primary);
    }

    .nav-link.active {
      background: var(--accent-dim);
      color: var(--accent);
    }

    /* Season picker */
    .season-select {
      width: 100%;
      padding: 0.5rem 0.75rem;
      border-radius: 8px;
      background: var(--surface-hover);
      border: 1px solid var(--border);
      color: var(--text-primary);
      font-size: 0.9rem;
      font-weight: 700;
      cursor: pointer;
      outline: none;
    }
    .season-select:hover { border-color: var(--accent); }
    .season-select:focus { border-color: var(--accent); }
    .season-select.compact { width: auto; min-height: 40px; padding: 0.3rem 0.6rem; font-size: 0.9rem; }

    .season-loading { padding: 0.5rem 0.75rem; font-size: 0.8rem; color: var(--text-muted); }

    /* Mobile topbar */
    .mobile-topbar {
      display: none;
    }

    /* Main */
    .main-content {
      flex: 1;
      overflow-y: auto;
      min-width: 0;
    }

    @media (max-width: 768px) {
      .sidebar { display: none; }

      .mobile-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 1rem;
        background: var(--surface);
        border-bottom: 1px solid var(--border);
        position: sticky;
        top: 0;
        z-index: 100;
        flex-wrap: wrap;
        gap: 0.5rem;
      }

      .mobile-brand-row {
        display: flex;
        align-items: center;
        gap: 0.6rem;
      }

      /* Wraps rather than running off the edge on a narrow phone. */
      .mobile-nav {
        display: flex;
        gap: 0.25rem;
        flex-wrap: wrap;
      }

      /*
        Sized for thumbs, not mouse pointers. These were about 27px tall, which is a fiddly
        thing to hit on a phone, and most people open this on a phone. 44px is the size
        Apple's guidelines ask for and it's a noticeable difference in practice.
      */
      .mobile-nav-link {
        display: flex;
        align-items: center;
        min-height: 44px;
        padding: 0 0.85rem;
        border-radius: 22px;
        font-size: 0.85rem;
        font-weight: 500;
        color: var(--text-secondary);
        text-decoration: none;
        transition: all 0.15s ease;
      }

      .mobile-nav-link:hover { background: var(--surface-hover); color: var(--text-primary); }
      .mobile-nav-link.active { background: var(--accent-dim); color: var(--accent); }

      .app-shell { flex-direction: column; }
    }
  `]
})
export class AppComponent implements OnInit {
  private leagueService = inject(LeagueService);
  private router = inject(Router);

  config = signal<LeagueConfig | null>(null);
  seasons = signal<SeasonSummary[]>([]);

  /** The year currently in the URL, or null on a page that isn't season scoped. */
  activeYear = signal<number | null>(null);

  /** Which of the three season pages is open, so switching years can stay on it. */
  private activePage = signal<string>('weekly');

  ngOnInit() {
    this.leagueService.getConfig().subscribe(c => this.config.set(c));

    this.leagueService.getSeasons().subscribe({
      next: seasons => {
        this.seasons.set(seasons);

        // Landing straight on Settings means no year has ever been in the URL, so seed one
        // or the sidebar links would have nowhere to point.
        if (this.activeYear() === null) {
          const fallback = seasons.find(s => s.hasStarted) ?? seasons[0];
          if (fallback) this.activeYear.set(fallback.year);
        }
      },
      error: err => console.error('Could not load the season list for the sidebar.', err)
    });

    // Read the year straight back out of the URL rather than tracking it separately. The
    // URL is the one source of truth for which season is showing, so a pasted link, the
    // back button and the picker can't disagree with each other.
    this.syncFromUrl(this.router.url);
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => this.syncFromUrl(e.urlAfterRedirects));
  }

  /** Where a sidebar link points, keeping whatever year is currently showing. */
  pageLink(page: string): string[] {
    const year = this.activeYear();
    return year ? ['/', String(year), page] : ['/'];
  }

  /** Switching year keeps you on the same page, just for the other season. */
  onSeasonChange(event: Event) {
    const year = (event.target as HTMLSelectElement).value;
    if (year) this.router.navigate(['/', year, this.activePage()]);
  }

  /**
   * Pulls the year and page out of a URL like /2025/money-earned.
   *
   * Hash routing means router.url is already the part after the #, so this is just a
   * matter of splitting on slashes.
   */
  private syncFromUrl(url: string) {
    const parts = url.split('?')[0].split('/').filter(Boolean);
    const year = Number(parts[0]);

    if (Number.isFinite(year) && year > 2000) {
      this.activeYear.set(year);
      if (parts[1]) this.activePage.set(parts[1]);
    }

    // No year in the URL means Settings or the redirect page. The last known year is kept
    // on purpose rather than cleared, so the sidebar links still point somewhere real and
    // leaving Settings lands back on whichever season was being looked at.
  }
}
