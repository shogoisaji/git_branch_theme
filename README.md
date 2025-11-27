# Git Branch Theme

This VS Code extension switches colors based on the current Git branch to help avoid mistakes on critical branches. It uses the `vscode.git` API to update workspace-level `workbench.colorCustomizations`.

## Features

- Detects the current branch and applies the first matching rule's color
- Lets you choose which UI keys change color (default: active/inactive title bar)
- Regex-based rules that are configurable per user/workspace
- Removes overrides when no rules match so the default theme returns

## Installation

- If not yet published on the Marketplace, install `git-branch-theme-0.0.1.vsix` from the repository root via the Extensions view (...) → "Install from VSIX".
- Open the target workspace and the extension activates automatically.

## Usage

1. Open a workspace that contains a Git repository.
2. Switch branches; the first matching rule's color is applied.
   - Default targets: `titleBar.activeBackground`, `titleBar.inactiveBackground`
   - Any `workbench.colorCustomizations` keys you specify in settings
3. If no rules match, the color settings are removed and the default theme returns.

## Settings

### `branchColor.rules`

Map branch names to colors. The first matching rule is applied.

```json
{
  "branchColor.rules": [
   { "pattern": "^main$", "color": "#C53436" },
   { "pattern": "^dev(elop)?$", "color": "#2750CB" },
   { "pattern": "^(feat|feature)/.*", "color": "#2E9125" },
   { "pattern": ".*-(prod|production)$", "color": "#D97706" }
 ]
}
```

- `pattern`: Regular expression string for the branch name.
- `color`: Hex color code to apply.

A suffix rule is included by default to catch branches ending with `-prod` or `-production`.

### `branchColor.targetColorKeys`

Specify the `workbench.colorCustomizations` keys whose colors change per branch.

```json
{
  "branchColor.targetColorKeys": [
    "titleBar.activeBackground",
    "titleBar.inactiveBackground",
    "titleBar.border"
  ]
}
```

- When omitted or empty, only `titleBar.activeBackground` and `titleBar.inactiveBackground` are changed.
- If a key you remove still has an older branch color applied, it is cleared automatically when that color comes from a rule.

## Commands

### `Git Branch Theme: Reset Colors`

Removes all color customizations applied by this extension. Use this command before uninstalling or disabling the extension to restore your workspace to its original state.

1. Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run `Git Branch Theme: Reset Colors`

## Limitations

- Targets only the first repository detected in the workspace (`git.repositories[0]`).
- Invalid regex rules are skipped and a warning is logged to the console.
