# Media pipeline

Studio photography is not part of the Git history. This tool downloads the
originals from the shared SOBIE Drive folder, exports fixed WebP sizes, records
a SHA-256 manifest, and packs a release archive. The application then reads the
committed manifest and the extracted archive, or the same objects copied to
Supabase Storage.

## Input

The inventory CSV is an argument, never a hard-coded path. It is the flat
inventory of the Drive folder, with one row per folder and file. The pipeline
only reads nodes where `group = studio` and `type = image`; feedback photos are
ignored. The Drive file ID is the traceability key, `sku` comes from the SKU
folder, and the file name determines the position.

```sh
pnpm media:build --inventory /path/to/sobie-drive-inventory.csv
```

The path convention is shared with the catalog export:

```text
studio/<SKU>/<NN>-<size>.webp
```

`NN` is the one-based position of the source file when the files in the SKU
folder are sorted by name, padded to two digits. The sizes are `480`, `960`,
and `1600`, for listing, listing at 2x (and detail on mobile), and detail.

## Build

```sh
pnpm media:build --inventory <inventory.csv> [options]
```

| Option                | Default                                  | Purpose                                       |
| --------------------- | ---------------------------------------- | --------------------------------------------- |
| `--inventory <path>`  | required                                 | SOBIE Drive inventory CSV                     |
| `--out <dir>`         | `.media-build`                           | Build output directory                        |
| `--limit <count>`     | all images                               | Process only the first N images (preview run) |
| `--concurrency <n>`   | `3`                                      | Parallel downloads/encodes, capped at 3       |
| `--checkpoint <path>` | `<out>/checkpoint-studio-v1.json`        | Resume file                                   |
| `--manifest <path>`   | `data/media/manifest-studio-v1.json`     | Manifest output                               |
| `--report <path>`     | `data/media/build-report-studio-v1.json` | Build report output                           |
| `--archive <path>`    | `<out>/coveweft-media-studio-v1.tar.gz`  | Release archive                               |
| `--no-archive`        | archive created                          | Skip archive creation                         |

Output layout:

```text
.media-build/
├── studio/                             # exported WebP files (not committed)
├── checkpoint-studio-v1.json           # resume state (not committed)
├── coveweft-media-studio-v1.tar.gz     # release archive (not committed)
├── coveweft-media-studio-v1.tar.gz.sha256
└── preview/                            # metadata when --limit is used
data/media/
├── manifest-studio-v1.json             # committed metadata
└── build-report-studio-v1.json         # committed metadata
```

Every exported file is re-encoded as WebP at quality 80. Sharp keeps the aspect
ratio, applies the EXIF orientation before resizing, and writes no EXIF, XMP,
IPTC, or GPS metadata. A requested width is capped at the source width so a
small original is never upscaled; the manifest records the real width and
height of each output.

Downloads run three at a time. A throttled or transient response (403, 408,
425, 429, or 5xx) is retried with exponential backoff and jitter, honoring
`Retry-After` when Drive sends it. Other 4xx responses fail immediately. The
checkpoint is written atomically while the build runs. A restart reuses an
image only when all three output files still match the recorded byte size and
SHA-256, so interrupted builds resume without downloading completed images
again.

A full build that ends with failures writes `manifest-partial.json` and
`build-report-partial.json` inside the output directory, lists every failure,
and exits non-zero. Run the same command again to resume. Do not treat a
partial build as a release.

For a quick check of the pipeline without touching the committed metadata:

```sh
pnpm media:build --inventory <inventory.csv> --limit 20
pnpm media:verify --manifest .media-build/preview/manifest-studio-v1.json \
  --report .media-build/preview/build-report-studio-v1.json --allow-partial
```

## Manifest and report

`manifest-studio-v1.json` is the source of truth for the exported archive:

```json
{
  "version": 1,
  "createdAt": "2026-11-06T00:00:00.000Z",
  "imageCount": 1,
  "entries": [
    {
      "sku": "10F1",
      "position": 1,
      "driveFileId": "…",
      "sizes": {
        "480": {
          "path": "studio/10F1/01-480.webp",
          "width": 480,
          "height": 720,
          "bytes": 11244,
          "sha256": "…"
        }
      }
    }
  ]
}
```

`build-report-studio-v1.json` records the run: total and per-size byte counts,
successful/failed/reused images, the downloaded source bytes, the failure list
with a reason for each image, and the archive size and SHA-256. It is the
evidence used to choose what to upload when a storage quota is limited.

## Verify

```sh
pnpm media:verify [options]
```

The command reads the committed manifest and checks every referenced file in
the build output:

- the file exists and is a regular file;
- its byte size and SHA-256 match the manifest;
- it decodes as WebP with the recorded width and height;
- it has no EXIF, XMP, IPTC, or orientation metadata.

It also validates the build report structure and cross-checks the report's
image count, file count, and per-size and overall byte totals against the
manifest and the files actually checked. This means a truncated manifest fails
even when `--inventory` is not supplied. The archive size and SHA-256 are
checked against the report and the `.sha256` sidecar.

Pass `--inventory <csv>` to compare the manifest against the source inventory,
or `--allow-partial` for a `--limit` preview report. A preview report is
rejected without that flag.

`pnpm media:verify` needs the build output. On a fresh clone, first download and
extract the release archive into `.media-build/`.

## Versioning and storage

The archive is named `coveweft-media-studio-v1.tar.gz` and is published as a
GitHub Release asset with its `.sha256` sidecar. Images and archives are never
committed; only `data/media/*.json` is. `.media-build/` and `.media-cache/` are
gitignored. A new image set gets a new version suffix, a new manifest, and a new
archive rather than silently changing the current one.

## Rebuilding

The checkpoint is tied to the inventory snapshot and the source file IDs. After
changing the inventory or renaming a source file, rebuild the affected outputs.
For a clean build, remove the checkpoint and the exported `studio/` directory in
the output folder, then run the command again.

## Brand photography

The storefront also uses four photos that are not part of the catalog. They
appear in the hero, the shop banners, the activity panels, the sign-in panel,
and the status pages. They live in `public/brand/` as `<name>-<width>.webp`
(480, 960, and 1600 px, plus 2400 px for the hero), re-encoded and stripped of
metadata, and are listed in `src/lib/brand-images.ts`. All four are published under the
[Unsplash License](https://unsplash.com/license), which allows free use
without attribution; the photographers are credited here anyway.

| File prefix       | Photo                                                                                      | Photographer      | Edit                        |
| ----------------- | ------------------------------------------------------------------------------------------ | ----------------- | --------------------------- |
| `ocean-shore`     | [Turquoise sea wave on a white sand beach](https://unsplash.com/photos/QP6XWJ9q6GY)        | Shifaaz Shamoon   | Rotated 90° to landscape    |
| `pool-lanes`      | [Blue and white striped swimming lanes](https://unsplash.com/photos/OAg9u5E1ju0)           | Markus Spiske     | None                        |
| `surf-lines`      | [Aerial view of waves on a sandy beach](https://unsplash.com/photos/zWFa7mlQAYk)           | Hameen Reynolds   | Light blur to cut file size |
| `underwater-swim` | [Underwater photo of a person swimming in a pool](https://unsplash.com/photos/eCNz5PiiUCc) | Jan Antonin Kolar | None                        |
