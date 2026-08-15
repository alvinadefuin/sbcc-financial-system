const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const readPublic = (file) => fs.readFileSync(path.join(publicDir, file), 'utf8');

const manifest = JSON.parse(readPublic('manifest.json'));
const indexHtml = readPublic('index.html');

/**
 * Create React App scaffolds these two files, and they contain the React atom
 * logo — not StewardBox. The manifest pointed at them until August 2026, so
 * installing the PWA from Chrome put the React logo on the home screen. The
 * real icons had been in public/ since June but nothing referenced them.
 */
const CRA_SCAFFOLD_ICONS = ['logo192.png', 'logo512.png'];

describe('PWA install icons', () => {
  test('every icon the manifest advertises actually exists', () => {
    for (const icon of manifest.icons) {
      expect({ src: icon.src, exists: fs.existsSync(path.join(publicDir, icon.src)) })
        .toEqual({ src: icon.src, exists: true });
    }
  });

  test('the manifest does not install the Create React App logo', () => {
    const sources = manifest.icons.map((icon) => icon.src);
    for (const scaffold of CRA_SCAFFOLD_ICONS) {
      expect(sources).not.toContain(scaffold);
    }
  });

  test('the manifest offers the 192px and 512px icons Chrome installs from', () => {
    const sizes = manifest.icons.flatMap((icon) => icon.sizes.split(/\s+/));
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });

  test('iOS add-to-home-screen gets the app icon, not the React logo', () => {
    const match = indexHtml.match(/rel="apple-touch-icon"\s+href="[^"]*?\/?([^"/]+)"/);
    expect(match).not.toBeNull();

    const [, file] = match;
    expect(CRA_SCAFFOLD_ICONS).not.toContain(file);
    expect(fs.existsSync(path.join(publicDir, file))).toBe(true);
  });
});

describe('PWA install identity', () => {
  /**
   * The <meta name="theme-color"> tag wins over manifest.json's theme_color for
   * the live page, so changing only the manifest leaves the status bar on the
   * old colour. Keeping them equal is the whole point of this test.
   */
  test('the theme colour in index.html matches the manifest', () => {
    const match = indexHtml.match(/<meta name="theme-color" content="([^"]+)"/);
    expect(match).not.toBeNull();
    expect(match[1].toLowerCase()).toBe(manifest.theme_color.toLowerCase());
  });

  test('no Create React App scaffold text is left in the page description', () => {
    expect(indexHtml).not.toMatch(/create-react-app/i);
  });
});
