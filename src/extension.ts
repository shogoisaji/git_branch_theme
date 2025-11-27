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

const DEFAULT_COLOR_KEYS = ['titleBar.activeBackground', 'titleBar.inactiveBackground'] as const;
const LAST_KEYS_STATE_KEY = 'branchColor.lastTargetColorKeys';

export async function activate(context: vscode.ExtensionContext) {
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

  await applyColor(color, rules, targets);
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

async function applyColor(color: string | undefined, rules: BranchRule[], targets: ColorTargets): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const current = config.get<Record<string, unknown>>('workbench.colorCustomizations') || {};
  const next = { ...current };

  const ruleColors = new Set(rules.map((rule) => rule.color));
  let changed = false;

  for (const key of targets.apply) {
    if (color) {
      if (next[key] !== color) {
        next[key] = color;
        changed = true;
      }
    } else if (key in next) {
      delete next[key];
      changed = true;
    }
  }

  for (const key of targets.cleanup) {
    if (targets.apply.includes(key)) {
      continue;
    }
    const currentValue = next[key];
    if (typeof currentValue === 'string' && (ruleColors.has(currentValue) || currentValue === color)) {
      delete next[key];
      changed = true;
    }
  }

  if (changed) {
    await config.update('workbench.colorCustomizations', next, vscode.ConfigurationTarget.Workspace);
  }
}

export function deactivate(): void {
  // No special cleanup necessary.
}
