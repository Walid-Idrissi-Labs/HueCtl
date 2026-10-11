# Releasing HueCtl

## Making a release

1. Bump `VERSION` in `sw.js`. Every installed copy keeps the app in a cache named after it, and a new name is what makes a browser take the new files as one set instead of one at a time.
2. Run the tests: `node --test`, then `node tests/e2e.mjs`.
3. If the controls or any number in the README changed, redraw the artwork with `node scripts/readme-art.mjs` and read the README against the app once more.
4. Commit and push to `main`. CI runs both test suites again, and Vercel serves the new commit at huectl.vercel.app.
5. Tag the commit `vX.Y.Z`, the same number as in `sw.js`, and push the tag. CI tests it once more and drafts a GitHub release. It fails if the tag and `VERSION` disagree. Read the notes through and publish.

There is nothing to build and nothing to upload. The files in the repository are the files the browser runs, and the release is a marker with notes, not a download.

## What a visitor gets

### On a first visit

The page, its style sheet and nine modules: about 60 kB, 21 kB over the wire. Once the page has loaded, the service worker stores those files and the icons, and from then on the app opens without a network.

### After a release

The app opens at once from the cache, so the first launch after a release is still the old version. In the background the browser sees that `sw.js` has changed, the new worker fetches every file in `SHELL` into a cache of its own, takes over and deletes the old one. The next launch is the new version, whole.

That is what step 1 is for. Without a new `VERSION` the worker stays the same and only refreshes files one by one as they are asked for, and someone who closes the app half way through can be left with a new page and an old script.

### What the host adds

[`vercel.json`](vercel.json) sets two headers. `sw.js` is never served from the browser's own cache, so a release is noticed on the next launch, and the manifest is sent with its proper type. Any static host that does the same will do.

## Tests

- `node --test` runs the unit tests in [`tests/unit.test.mjs`](tests/unit.test.mjs): the color of a light, the state and what it refuses, the sunset timer and the effects. They need nothing but Node.
- `node tests/e2e.mjs` serves the folder and works the app in a real Chrome, by touch, by mouse and by keyboard, on a phone-sized screen and a desktop one. It needs Chrome or Chromium, and `CHROME=/path/to/chrome` if yours is somewhere unusual. Each line it prints is one behavior.

Both need Node 22 or later and no packages. CI runs them on every push. `SLOW=4 node tests/e2e.mjs` runs the page on a quarter of the processor, to rehearse a slow machine before CI finds out.

## Artwork

- The app icon is [`assets/icon.svg`](assets/icon.svg). The PNG files beside it are that drawing at the sizes a home screen asks for.
- `node scripts/readme-art.mjs` redraws the pictures in the README. The light in them comes from the app's own color code, and the control unit is drawn to measurements taken from the page, which are at the top of the script.
