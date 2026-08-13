import { Routes } from '@angular/router';

/**
 * The season lives in the URL, so /#/2025/weekly is week-by-week for 2025 and /#/2024/money-earned
 * is what everybody was owed in 2024. That means a link somebody pastes into the league
 * chat opens on the season they were actually looking at, and a refresh doesn't lose it.
 *
 * League Settings deliberately sits outside the year. It's app level configuration, not
 * season data, and nesting it under a year would suggest per-season settings that don't
 * exist.
 *
 * Each page is loaded on demand rather than bundled into the initial download, which is
 * what loadComponent does.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./components/season-redirect/season-redirect.component').then(m => m.SeasonRedirectComponent)
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./components/settings/settings.component').then(m => m.SettingsComponent)
  },
  {
    path: ':year/weekly',
    loadComponent: () => import('./components/weekly/weekly.component').then(m => m.WeeklyComponent)
  },
  {
    path: ':year/total-scores',
    loadComponent: () =>
      import('./components/total-scores/total-scores.component').then(m => m.TotalScoresComponent)
  },
  {
    path: ':year/money-earned',
    loadComponent: () =>
      import('./components/money-earned/money-earned.component').then(m => m.MoneyEarnedComponent)
  },

  // A bare year with no page, so send them to that season's weekly page.
  { path: ':year', redirectTo: ':year/weekly', pathMatch: 'full' },

  // Anything else falls back to working out the default season rather than erroring.
  { path: '**', redirectTo: '' }
];
