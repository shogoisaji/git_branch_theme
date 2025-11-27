# Changelog

## [Unreleased]
- None.

## [0.0.7]
- Track applied branch colors and clean them up so disabling the extension reliably restores the original theme colors.

## [0.0.6]
- Remember original user-defined colors before cleaning up rule-color matches when no rule applies, so user overrides are preserved.

## [0.0.5]
- Preserve original `workbench.colorCustomizations` values and restore them when the extension deactivates.
- Reapply branch colors after theme or color customization changes while keeping user-defined overrides intact.

## [0.0.4]
- Add a default suffix rule to match branches ending with `-prod` or `-production`.

## [0.0.3] - 2025-11-27
- Updated the icon (no functional changes).

## [0.0.2]
- Initial release.
