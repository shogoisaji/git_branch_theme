import * as vscode from 'vscode';
import { API as GitAPI, GitExtension, Repository } from './git';

type BranchRule = {
  pattern: string;
  color: string;
};

type ColorTargets = {
  apply: readonly string[];
  cleanup: readonly string[];
};

type OriginalColorEntry = { missing: true } | { value: unknown };
type OriginalColorsState = Record<string, OriginalColorEntry>;
type AppliedColorsState = Record<string, string>;

const DEFAULT_COLOR_KEYS = ['titleBar.activeBackground', 'titleBar.inactiveBackground'] as const;
const LAST_KEYS_STATE_KEY = 'branchColor.lastTargetColorKeys';
const ORIGINAL_COLORS_STATE_KEY = 'branchColor.originalColorCustomizations';
const APPLIED_COLORS_STATE_KEY = 'branchColor.appliedColors';

let extensionContext: vscode.ExtensionContext | undefined;
let isApplyingColors = false;

async function runWithApplying<T>(fn: () => Thenable<T>): Promise<T> {
  isApplyingColors = true;
  try {
    return await Promise.resolve(fn());
  } finally {
    isApplyingColors = false;
  }
}

export async function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  const git = await getGitAPI();
  if (!git) {
    vscode.window.showErrorMessage('Cannot run Git Branch Theme because the Git extension was not found.');
    return;
  }

  const repository = git.repositories[0];
  if (!repository) {
    vscode.window.showWarningMessage('No Git repository found, so colors will not be updated.');
    return;
  }

  const update = () => updateColors(repository, context);

  context.subscriptions.push(repository.state.onDidChange(update));
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('branchColor.rules') ||
        event.affectsConfiguration('branchColor.targetColorKeys')
      ) {
        update();
      } else if (
        !isApplyingColors &&
        (event.affectsConfiguration('workbench.colorTheme') ||
          event.affectsConfiguration('workbench.colorCustomizations'))
      ) {
        void rebaseAfterThemeChange(repository, context);
      }
    })
  );

  await update();
}

async function getGitAPI(): Promise<GitAPI | undefined> {
  const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!extension) {
    return undefined;
  }

  if (!extension.isActive) {
    await extension.activate();
  }

  return extension.exports.getAPI(1);
}

async function updateColors(repository: Repository, context: vscode.ExtensionContext): Promise<void> {
  const rules = getRules();
  const targets = getColorTargets(context);
  const branchName = repository.state.HEAD?.name;
  const color = branchName ? findMatchingRule(branchName, rules)?.color : undefined;

  await runWithApplying(() => applyColor(color, rules, targets, context));
  await context.workspaceState.update(LAST_KEYS_STATE_KEY, targets.apply);
}

function getRules(): BranchRule[] {
  const config = vscode.workspace.getConfiguration('branchColor');
  const rules = config.get<BranchRule[]>('rules') || [];
  return rules.filter((rule) => rule.pattern && rule.color);
}

function getColorTargets(context: vscode.ExtensionContext): ColorTargets {
  const config = vscode.workspace.getConfiguration('branchColor');
  const configuredKeys = config.get<string[]>('targetColorKeys') || [];
  const normalizedKeys = configuredKeys
    .filter((key) => typeof key === 'string')
    .map((key) => key.trim())
    .filter((key) => key.length > 0);

  const applyKeys = (normalizedKeys.length > 0 ? normalizedKeys : Array.from(DEFAULT_COLOR_KEYS)).filter(
    (value, index, self) => self.indexOf(value) === index
  );

  const previousKeys = context.workspaceState.get<string[]>(LAST_KEYS_STATE_KEY, []);
  const cleanupKeys = Array.from(new Set([...applyKeys, ...DEFAULT_COLOR_KEYS, ...previousKeys]));

  return { apply: applyKeys, cleanup: cleanupKeys };
}

function getOriginalColors(context: vscode.ExtensionContext): OriginalColorsState {
  return context.workspaceState.get<OriginalColorsState>(ORIGINAL_COLORS_STATE_KEY, {});
}

function getAppliedColors(context: vscode.ExtensionContext): AppliedColorsState {
  return context.workspaceState.get<AppliedColorsState>(APPLIED_COLORS_STATE_KEY, {});
}

function hasOriginalColors(context: vscode.ExtensionContext): boolean {
  return Object.keys(getOriginalColors(context)).length > 0;
}

function hasAppliedColors(context: vscode.ExtensionContext): boolean {
  return Object.keys(getAppliedColors(context)).length > 0;
}

function hasStoredColorState(context: vscode.ExtensionContext): boolean {
  return hasOriginalColors(context) || hasAppliedColors(context);
}

function findMatchingRule(branchName: string, rules: BranchRule[]): BranchRule | undefined {
  for (const rule of rules) {
    try {
      const regex = new RegExp(rule.pattern);
      if (regex.test(branchName)) {
        return rule;
      }
    } catch (error) {
      console.warn(`Invalid branchColor.rules pattern: ${rule.pattern}`, error);
    }
  }
  return undefined;
}

async function applyColor(
  color: string | undefined,
  rules: BranchRule[],
  targets: ColorTargets,
  context: vscode.ExtensionContext
): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const current = config.get<Record<string, unknown>>('workbench.colorCustomizations') || {};
  const next = { ...current };
  const originals = getOriginalColors(context);
  const appliedColors = getAppliedColors(context);
  let originalsChanged = false;
  let appliedColorsChanged = false;
  const getOriginalEntry = (key: string): OriginalColorEntry | undefined => originals[key];

  const rememberOriginal = (key: string) => {
    if (key in originals) {
      return;
    }
    if (key in current) {
      originals[key] = { value: current[key] };
    } else {
      originals[key] = { missing: true };
    }
    originalsChanged = true;
  };

  const restoreOriginal = (key: string): boolean => {
    const original = getOriginalEntry(key);
    if (!original) {
      return false;
    }

    if ('missing' in original && original.missing) {
      if (key in next) {
        delete next[key];
        return true;
      }
      return false;
    }

    if (!('value' in original)) {
      return false;
    }

    if (next[key] !== original.value) {
      if (original.value === undefined) {
        if (key in next) {
          delete next[key];
          return true;
        }
        return false;
      }

      next[key] = original.value;
      return true;
    }

    return false;
  };

  const setAppliedColor = (key: string, value: string) => {
    if (appliedColors[key] !== value) {
      appliedColors[key] = value;
      appliedColorsChanged = true;
    }
  };

  const removeAppliedColor = (key: string) => {
    if (key in appliedColors) {
      delete appliedColors[key];
      appliedColorsChanged = true;
    }
  };

  const ruleColors = new Set(rules.map((rule) => rule.color));
  let changed = false;

  for (const key of targets.apply) {
    if (color) {
      setAppliedColor(key, color);
      if (next[key] !== color) {
        rememberOriginal(key);
        next[key] = color;
        changed = true;
      }
    } else {
      if (restoreOriginal(key)) {
        changed = true;
      } else {
        const currentValue = next[key];
        const appliedColor = appliedColors[key];
        if (
          typeof currentValue === 'string' &&
          (ruleColors.has(currentValue) || (appliedColor && currentValue === appliedColor))
        ) {
          delete next[key];
          changed = true;
        }
      }
      removeAppliedColor(key);
    }
  }

  for (const key of targets.cleanup) {
    if (targets.apply.includes(key)) {
      continue;
    }
    const currentValue = next[key];
    const appliedColor = appliedColors[key];
    if (typeof currentValue === 'string') {
      const isRuleColor = ruleColors.has(currentValue) || currentValue === color;
      const isAppliedColor = appliedColor !== undefined && currentValue === appliedColor;
      if (isRuleColor || isAppliedColor) {
        delete next[key];
        changed = true;
      }
    }
    removeAppliedColor(key);
  }

  if (changed) {
    await config.update('workbench.colorCustomizations', next, vscode.ConfigurationTarget.Workspace);
  }

  if (originalsChanged) {
    await context.workspaceState.update(ORIGINAL_COLORS_STATE_KEY, originals);
  }

  if (appliedColorsChanged) {
    await context.workspaceState.update(APPLIED_COLORS_STATE_KEY, appliedColors);
  }
}

async function clearBranchOverrides(
  rules: BranchRule[],
  targets: ColorTargets,
  context: vscode.ExtensionContext
): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const current = config.get<Record<string, unknown>>('workbench.colorCustomizations') || {};
  const next = { ...current };

  const ruleColors = new Set(rules.map((rule) => rule.color));
  const keys = Array.from(new Set([...targets.apply, ...targets.cleanup]));
  const appliedColors = getAppliedColors(context);
  let changed = false;
  let appliedColorsChanged = false;

  for (const key of keys) {
    const value = next[key];
    const appliedColor = appliedColors[key];
    if (typeof value === 'string' && (ruleColors.has(value) || (appliedColor && appliedColor === value))) {
      delete next[key];
      changed = true;
    }
    if (appliedColor !== undefined) {
      delete appliedColors[key];
      appliedColorsChanged = true;
    }
  }

  if (changed) {
    await config.update('workbench.colorCustomizations', next, vscode.ConfigurationTarget.Workspace);
  }

  if (appliedColorsChanged) {
    await context.workspaceState.update(APPLIED_COLORS_STATE_KEY, appliedColors);
  }
}

async function rebaseAfterThemeChange(repository: Repository, context: vscode.ExtensionContext): Promise<void> {
  if (!hasStoredColorState(context)) {
    return;
  }

  const rules = getRules();
  const targets = getColorTargets(context);

  await runWithApplying(async () => {
    await clearBranchOverrides(rules, targets, context);
  });

  await context.workspaceState.update(ORIGINAL_COLORS_STATE_KEY, {});
  await context.workspaceState.update(APPLIED_COLORS_STATE_KEY, {});

  await updateColors(repository, context);
}

async function restoreOriginalColors(context: vscode.ExtensionContext): Promise<void> {
  const originals = getOriginalColors(context);
  const appliedColors = getAppliedColors(context);
  const keys = new Set([...Object.keys(originals), ...Object.keys(appliedColors)]);
  if (keys.size === 0) {
    const rules = getRules();
    if (rules.length === 0) {
      return;
    }

    const targets = getColorTargets(context);
    await runWithApplying(async () => {
      await clearBranchOverrides(rules, targets, context);
    });

    await context.workspaceState.update(ORIGINAL_COLORS_STATE_KEY, {});
    await context.workspaceState.update(APPLIED_COLORS_STATE_KEY, {});
    return;
  }

  const config = vscode.workspace.getConfiguration();
  const current = config.get<Record<string, unknown>>('workbench.colorCustomizations') || {};
  const next = { ...current };
  let changed = false;

  for (const key of keys) {
    const entry = originals[key];
    const appliedColor = appliedColors[key];

    if (entry) {
      if ('missing' in entry && entry.missing) {
        if (key in next) {
          delete next[key];
          changed = true;
        }
      } else if ('value' in entry) {
        if (next[key] !== entry.value) {
          if (entry.value === undefined) {
            if (key in next) {
              delete next[key];
              changed = true;
            }
          } else {
            next[key] = entry.value;
            changed = true;
          }
        }
      }
      continue;
    }

    if (appliedColor && typeof next[key] === 'string' && next[key] === appliedColor) {
      delete next[key];
      changed = true;
    }
  }

  if (changed) {
    await runWithApplying(() =>
      config.update('workbench.colorCustomizations', next, vscode.ConfigurationTarget.Workspace)
    );
  }

  await context.workspaceState.update(ORIGINAL_COLORS_STATE_KEY, {});
  await context.workspaceState.update(APPLIED_COLORS_STATE_KEY, {});
}

export async function deactivate(): Promise<void> {
  if (extensionContext) {
    await restoreOriginalColors(extensionContext);
  }
}
