import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  LOCALE_ID,
} from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeIt from '@angular/common/locales/it';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { BackupService } from './core/data/backup.service';
import { ProfileService } from './core/data/profile.service';
import { InstallService } from './core/platform/install.service';
import { StorageService } from './core/platform/storage.service';
import { ThemeService } from './core/platform/theme.service';

registerLocaleData(localeIt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: LOCALE_ID, useValue: 'it-IT' },
    provideRouter(routes, withComponentInputBinding(), withViewTransitions({
        skipInitialTransition: true,
        // In background (tab nascosta) il browser annulla le transizioni: niente errori in console.
        onViewTransitionCreated: ({ transition }) => {
          if (document.hidden) transition.skipTransition();
          transition.ready.catch(() => {});
        },
      })),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideAppInitializer(async () => {
      inject(ThemeService);
      inject(InstallService).init();
      // Non blocca l'avvio: persistenza e controllo backup girano in background.
      void inject(StorageService).init();
      void inject(BackupService).init();
      // Il profilo serve alla guardia delle route: si attende (lettura locale, pochi ms).
      await inject(ProfileService).load();
    }),
  ],
};
