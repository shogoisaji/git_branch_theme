import { Event, Uri } from 'vscode';

export interface API {
  readonly repositories: Repository[];
  readonly onDidOpenRepository: Event<Repository>;
  readonly onDidCloseRepository: Event<Repository>;
  toGitUri(uri: Uri, ref: string): Uri;
}

export interface Repository {
  readonly state: RepositoryState;
}

export interface RepositoryState {
  readonly HEAD: Branch | undefined;
  readonly onDidChange: Event<void>;
}

export interface GitExtension {
  readonly enabled: boolean;
  readonly onDidChangeEnablement: Event<boolean>;
  getAPI(version: 1): API;
}

export interface Branch {
  readonly name?: string;
  readonly upstream?: Branch;
  readonly commit?: string;
  readonly type?: BranchType;
}

export type BranchType = 'local' | 'remote';
