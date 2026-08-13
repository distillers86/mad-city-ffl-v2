import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';

/**
 * Everything the app needs at startup lives here.
 *
 * A note on withHashLocation(): GitHub Pages is dumb static file hosting. It has no
 * server to rewrite unknown paths back to index.html, so a normal Angular URL like
 * /money-earned would 404 the moment somebody refreshed the page or opened a direct
 * link. Hash URLs (/#/money-earned) keep the whole route on the client side, where
 * the browser never asks GitHub for it. Ugly URLs, but they always work.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withHashLocation()),
    provideHttpClient(),
  ]
};
