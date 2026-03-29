Use Changesets to manage package releases in this monorepo.

Typical flow:

1. Run `bun run changeset` and describe the package changes.
2. Commit the generated `.changeset/*.md` file.
3. Run `bun run version:packages` to bump package versions and internal dependency ranges.
4. Review the package.json changes.
5. Run `bun run publish:packages` to build and publish unpublished package versions.

Notes:

- `publish:packages` still uses the repo's publish script because it preserves build ordering and rewrites `workspace:*` dependencies to publishable semver ranges during publish.
- If publish partially succeeds, rerun `bun run publish:packages`; already-published versions are skipped.