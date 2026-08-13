import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { LeagueService } from '../../services/league.service';

/**
 * What loads when somebody hits the site with no year in the URL.
 *
 * It works out which season to open on and forwards them there, so every real page ends up
 * with a year in its address and a link somebody pastes in the league chat always points at
 * the season they were actually looking at.
 *
 * It exists as a real component rather than a route redirect because picking the default
 * season means asking Sleeper which seasons exist first, and a plain redirectTo can't wait
 * on an HTTP call.
 */
@Component({
  selector: 'app-season-redirect',
  imports: [],
  template: `
    <div class="loading">
      @if (failed) {
        <p class="msg">Couldn't work out which seasons this league has played.</p>
        <p class="hint">Sleeper may be down, or the username in league.config.json may be wrong. Check the browser console for the actual error.</p>
      } @else {
        <div class="spinner"></div>
        <p class="msg">Finding the latest season...</p>
      }
    </div>
  `,
  styles: [`
    .loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem; padding: 5rem 1.5rem; text-align: center; }
    .spinner { width: 28px; height: 28px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .msg { color: var(--text-secondary); font-size: 0.9rem; }
    .hint { color: var(--text-muted); font-size: 0.8rem; max-width: 420px; line-height: 1.5; }
  `]
})
export class SeasonRedirectComponent implements OnInit {
  private leagueService = inject(LeagueService);
  private router = inject(Router);

  failed = false;

  ngOnInit() {
    this.leagueService.getDefaultSeason().subscribe({
      next: season => {
        if (!season) {
          this.failed = true;
          return;
        }
        // replaceUrl so the back button doesn't bounce off this page forever.
        this.router.navigate([season.year, 'weekly'], { replaceUrl: true });
      },
      error: err => {
        console.error('Could not load the season list.', err);
        this.failed = true;
      }
    });
  }
}
