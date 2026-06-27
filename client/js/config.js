// Client connection config.
//
// Replaces the legacy RequireJS `text!` JSON loading + build pragmas. Host,
// port and dispatcher are now provided through Vite env vars (see .env.example),
// with sensible localhost defaults for development. The object keeps the same
// shape the rest of the client expects: `dev`, `build`, and optional `local`.

var host = import.meta.env.VITE_GAME_HOST || 'localhost';
var port = Number(import.meta.env.VITE_GAME_PORT || 8000);
var dispatcher = import.meta.env.VITE_DISPATCHER === 'true';

var config = {
    dev: { host: host, port: port, dispatcher: dispatcher },
    build: {
        // In production the websocket host defaults to the page host unless
        // explicitly overridden via VITE_GAME_HOST.
        host: import.meta.env.VITE_GAME_HOST ||
            (typeof window !== 'undefined' ? window.location.hostname : 'localhost'),
        port: port,
        dispatcher: dispatcher
    }
};

// Optional local override. Provided via VITE_* env vars; left undefined by
// default so the client falls back to config.dev.
if (import.meta.env.VITE_GAME_HOST) {
    config.local = { host: host, port: port, dispatcher: dispatcher };
}

export default config;
