import * as publicEnv from '$env/static/public';

// The gpx.studio servers only allow requests from https://gpx.studio (CORS).
// To run the app from another origin (localhost, self-hosting), override these in .env.
const env: Record<string, string | undefined> = publicEnv;

export const GRAPHHOPPER_URL = env.PUBLIC_GRAPHHOPPER_URL || 'https://graphhopper.gpx.studio';
export const OVERPASS_URL =
    env.PUBLIC_OVERPASS_URL || 'https://overpass.gpx.studio/api/interpreter';
export const STYLES_URL = env.PUBLIC_STYLES_URL || 'https://styles.gpx.studio';
export const ELEVATION_TILES_URL =
    env.PUBLIC_ELEVATION_TILES_URL || 'https://tiles.gpx.studio/mapterhorn';
