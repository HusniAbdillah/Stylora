# PWA and app icon audit

Owner 1, O1.5. Implementation review: 7 November 2026. Lane B.

## Findings and changes

| Finding                                                  | Implemented behavior                                                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Root metadata had only a title and description           | App name, Apple standalone metadata, light theme color, explicit favicon and Apple icon links                    |
| Existing icons were outside the public directory         | Generated public PNGs, SVG favicon and a three-frame ICO from the existing mark                                  |
| Existing maskable source had rounded transparent corners | Dedicated full-bleed maskable PNG; Apple icon also uses an opaque square                                         |
| No web app manifest                                      | Stable root identity and scope, standalone display, 192 and 512 px icons, maskable icon and task shortcuts       |
| No install action                                        | Workspace footer offers the native prompt when available; iPhone and iPad receive expandable Safari instructions |
| No offline navigation recovery                           | Network-first document navigation with a branded, self-contained fallback and retry button                       |

The manifest uses Next.js's metadata route. Installation events are captured in
the root provider so landing-to-workspace navigation retains an offered prompt.
Unsupported browsers receive no inactive install button. Standalone mode hides
the installation controls. A dismissed prompt is consumed; it is not repeatedly
shown. No dependency, database contract or provider call was added.

## Cache and update boundary

- Only `/offline.html`, `/offline-retry.js` and the public 192 px icon are
  precached. Workspace pages and results are fetched from the network.
- API requests, RSC fetches, writes, cross-origin requests and signed media pass
  through without service-worker caching or offline write replay.
- Registration runs in production only. `/sw.js` has a no-store header,
  JavaScript content type, nosniff and a same-origin worker CSP.
- Worker updates wait for existing tabs to close. There is no forced reload,
  `skipWaiting` or takeover of an open draft. First installation controls later
  navigations after reload. Cache cleanup touches only Stylora offline caches.
- Bump the worker cache version when changing recovery assets. Test an upgrade
  with an existing installation before release.
- Offline recovery does not provide offline wardrobe reads, saves or image
  generation. Its text states the connection requirement without promising that
  an unsaved change reached the server.

## Icon maintenance

Run `node scripts/generate-app-icons.mjs` after changing the brand source in
`assets/icon-maskable.svg`. Commit the generated public files with the source.
The favicon uses a larger mark for small tabs. Apple uses 180 px; the manifest
uses 192 and 512 px. The ICO contains 16, 32 and 48 px PNG frames. The maskable
logo stays within the centered circle with a radius of 40 percent of icon width.
Keep the zoomable viewport and platform-default safe-area handling; fullscreen
and a portrait orientation lock are not imposed.

## Release verification

See the Owner 1 PWA entry in `PROGRESS-NEW.md` for actual local evidence. These
device checks remain necessary on an approved HTTPS preview after merge:

| Platform                | Check                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Android Chrome          | Install from the workspace, inspect round and squircle launcher masks, open shortcuts and rotate                                                 |
| iPhone and iPad Safari  | Follow Share then Add to Home Screen, inspect the opaque icon, launch standalone, check status bar and keyboard                                  |
| Desktop Chrome and Edge | Install, relaunch, resize, inspect tab favicon and task shortcuts                                                                                |
| Every installation      | Reload once, disconnect and navigate to a deep link, retry after reconnecting, inspect cache keys, then test a worker upgrade with an open draft |

Inspect the browser's manifest and service-worker panels as well as the UI.
Installability and appearance on actual devices are not established by a build
or a simulated viewport. Browser engagement and platform policy control when a
native install prompt is offered. HTTPS is required outside localhost.

## References

- [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [MDN install prompt behavior](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt)
- [Web app manifest icon safe zone](https://www.w3.org/TR/appmanifest/#icon-masks)
