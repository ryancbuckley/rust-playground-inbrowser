// The service worker (web/coi-sw.js) after the first visit, on which
// index.html registers it to make the page cross-origin isolated: a new build
// is offered rather than imposed, and the page's storage is asked to be kept.
// Only where the worker is in control: a server that sends the headers itself
// (web/serve.py) has no worker to look after.
import * as styles from './pwa.module.css';

export function watchServiceWorker(): void {
  const sw = navigator.serviceWorker;
  if (!window.isSecureContext || !sw?.controller) return;

  // Registering on every visit applies updateViaCache "none" to a
  // registration made before it was passed, and checks for a new build
  // besides. GitHub Pages serves the worker with max-age=600; a stale one
  // pins the app to the build that installed it.
  sw.register('coi-sw.js', { updateViaCache: 'none' })
    .then((registration) => {
      // Already superseded at page load.
      if (registration.waiting) offerReload(registration);
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed' && sw.controller) offerReload(registration);
        });
      });
    })
    .catch((err) => console.error('[pwa] registration failed', err));

  // The new worker takes over once it is told to (SKIP_WAITING): reload
  // under it, once.
  let reloading = false;
  sw.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

/** Offer the new build. Reloading unasked would be rude mid-edit, though the
 *  code is saved as it is typed and would survive it. */
function offerReload(registration: ServiceWorkerRegistration) {
  if (document.querySelector(`.${styles.update}`)) return;
  const banner = document.createElement('div');
  banner.className = styles.update;
  banner.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = 'A new version of the playground is ready.';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Reload';
  button.addEventListener('click', () =>
    registration.waiting?.postMessage({ type: 'SKIP_WAITING' }),
  );
  banner.append(text, button);
  document.body.append(banner);
}

/**
 * Ask the browser not to evict this origin's storage: the offline copy of
 * the page and the toolchain, the crates, and the code in localStorage.
 *
 * An app on the Home Screen is exempt from Safari's seven-day inactivity
 * purge, but not from eviction under pressure. Best effort by design: browsers
 * decide for themselves, some grant it silently on install, and losing it
 * costs a download, not work (the code is in localStorage, which is evicted
 * last). Logged either way.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    // Already granted is the common case on a second launch, and asking again
    // would prompt some browsers for nothing.
    if (await navigator.storage.persisted?.()) return true;
    const granted = await navigator.storage.persist();
    console.info(
      granted
        ? "[pwa] storage is persistent; it won't be evicted under pressure"
        : '[pwa] storage is best-effort; the offline copy could be evicted',
    );
    return granted;
  } catch {
    return false;
  }
}
