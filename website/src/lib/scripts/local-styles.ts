import fs from 'fs';

// Generates copies of the gpx.studio basemap styles that do not depend on the gpx.studio
// tile servers (which only allow requests from https://gpx.studio), for running the app
// locally or self-hosting it. Use with PUBLIC_STYLES_URL=/local-styles in .env.
// Contour lines have no public replacement and are removed.

const sourceUrl = 'https://styles.gpx.studio';
const outDir = 'static/local-styles';
const styles = ['liberty-topo', 'liberty-satellite', 'osm', 'osm-topo'];

const openFreeMap = 'https://tiles.openfreemap.org';
const sprites: Record<string, string> = {
    'https://sprites.gpx.studio/ofm_f384/ofm': `${openFreeMap}/sprites/ofm_f384/ofm`,
    'https://sprites.gpx.studio/osm/sprite': 'sprites/osm/sprite',
};
// Sprites without a public mirror are copied next to the styles
const localSprites = Object.entries(sprites).filter(([, local]) => !local.startsWith('http'));

async function download(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error fetching "${url}": ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
}

function convertStyle(style: any) {
    for (const [id, source] of Object.entries<any>(style.sources)) {
        if (id === 'openmaptiles') {
            source.url = `${openFreeMap}/planet`;
        } else if (id === 'hillshading') {
            style.sources[id] = {
                type: 'raster-dem',
                tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'],
                tileSize: 512,
                maxzoom: 12,
                encoding: 'terrarium',
                attribution: '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>',
            };
        } else if (id.startsWith('contours')) {
            delete style.sources[id];
        }
    }

    style.layers = style.layers
        .filter((layer: any) => !layer.source?.startsWith('contours'))
        .map((layer: any) =>
            layer.source === 'hillshading'
                ? {
                      id: layer.id,
                      type: 'hillshade',
                      source: 'hillshading',
                      paint: {
                          'hillshade-exaggeration': 0.25,
                          'hillshade-shadow-color': '#7a7a7a',
                      },
                  }
                : layer
        );

    if (!(style.sprite in sprites)) {
        throw new Error(`Unknown sprite "${style.sprite}"`);
    }
    style.sprite = sprites[style.sprite];
    style.glyphs = `${openFreeMap}/fonts/{fontstack}/{range}.pbf`;

    const remaining = JSON.stringify(style).match(/https:\/\/[a-z]+\.gpx\.studio[^"]*/g);
    if (remaining) {
        throw new Error(`Unreplaced gpx.studio URLs: ${remaining.join(', ')}`);
    }
}

async function generateLocalStyles() {
    for (const name of styles) {
        const style = JSON.parse((await download(`${sourceUrl}/${name}.json`)).toString());
        convertStyle(style);
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(`${outDir}/${name}.json`, JSON.stringify(style));
        console.log(`${outDir}/${name}.json`);
    }

    for (const [remote, local] of localSprites) {
        const dir = `${outDir}/${local.substring(0, local.lastIndexOf('/'))}`;
        fs.mkdirSync(dir, { recursive: true });
        for (const suffix of ['.json', '.png', '@2x.json', '@2x.png']) {
            fs.writeFileSync(`${outDir}/${local}${suffix}`, await download(`${remote}${suffix}`));
            console.log(`${outDir}/${local}${suffix}`);
        }
    }
}

generateLocalStyles();
