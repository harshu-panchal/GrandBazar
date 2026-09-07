import { lazy } from 'react';

/**
 * Wraps React.lazy to automatically reload the page if fetching a dynamic chunk fails
 * (e.g. after a new deployment when old chunk filenames no longer exist on the server).
 */
export const lazyWithRetry = (componentImport) =>
    lazy(async () => {
        const pageHasAlreadyBeenReloaded = JSON.parse(
            sessionStorage.getItem('page_reloaded_for_chunk_error') || 'false'
        );

        try {
            const component = await componentImport();
            sessionStorage.setItem('page_reloaded_for_chunk_error', 'false');
            return component;
        } catch (error) {
            const errorMsg = error?.message || String(error || '');
            const isChunkError =
                /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk/i.test(errorMsg);

            if (isChunkError && !pageHasAlreadyBeenReloaded) {
                sessionStorage.setItem('page_reloaded_for_chunk_error', 'true');
                window.location.reload();
                return new Promise(() => {}); // Pause until browser reloads page
            }

            throw error;
        }
    });

/**
 * Registers global window listeners for Vite chunk preload errors and unhandled chunk rejections.
 */
export const registerChunkErrorListeners = () => {
    if (typeof window === 'undefined') return;

    const handleChunkError = () => {
        const lastReload = Number(sessionStorage.getItem('chunk_reload_time') || 0);
        // Throttle reloads to at most once per 10 seconds to prevent infinite reload loops
        if (Date.now() - lastReload > 10000) {
            sessionStorage.setItem('chunk_reload_time', String(Date.now()));
            window.location.reload();
        }
    };

    window.addEventListener('vite:preloadError', (event) => {
        event.preventDefault();
        handleChunkError();
    });

    window.addEventListener('unhandledrejection', (event) => {
        const msg = event.reason?.message || String(event.reason || '');
        if (/Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk/i.test(msg)) {
            event.preventDefault();
            handleChunkError();
        }
    });

    window.addEventListener('error', (event) => {
        const msg = event.message || String(event.error?.message || '');
        if (/Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk/i.test(msg)) {
            event.preventDefault();
            handleChunkError();
        }
    });
};
