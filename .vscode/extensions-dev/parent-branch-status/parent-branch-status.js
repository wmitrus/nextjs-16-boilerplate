const cp = require('child_process');

const vscode = require('vscode');

/**
 * Executes one of the extension's allowlisted git commands in the workspace root.
 * @param {{ executable: string, args: string[] } | null} command
 * @returns {Promise<string>}
 */
function runAsync(command) {
  return new Promise((resolve) => {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;

    if (!cwd || !command) {
      resolve('');
      return;
    }

    cp.execFile(
      command.executable,
      command.args,
      { encoding: 'utf8', cwd },
      (error, stdout) => {
        if (error) {
          resolve('');
        } else {
          resolve(stdout.trim());
        }
      },
    );
  });
}

function getCurrentBranchCommand() {
  return {
    executable: 'git',
    args: ['rev-parse', '--abbrev-ref', 'HEAD'],
  };
}

function getBranchOriginCommand(branch) {
  if (typeof branch !== 'string' || branch.trim().length === 0) {
    return null;
  }

  return {
    executable: 'git',
    args: ['branch-origin', 'show', branch],
  };
}

function activate(context) {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  item.tooltip = 'Parent branch metadata';
  item.show();

  let timeout = null;

  async function update() {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    if (!cwd) {
      item.text = '$(git-branch) Parent: <no workspace>';
      return;
    }

    // Get current branch
    const branch = await runAsync(getCurrentBranchCommand());

    if (!branch || branch === 'HEAD') {
      item.text = '$(git-branch) Parent: <detached>';
      return;
    }

    // Get metadata in one call
    const output = await runAsync(getBranchOriginCommand(branch));

    if (!output) {
      item.text = `$(git-branch) Parent: <none>`;
      return;
    }

    const lines = output.split('\n');
    const localLine = lines.find((l) => l.startsWith('local:')) || '';
    const noteLine = lines.find((l) => l.startsWith('note:')) || '';

    const localParent = localLine.replace('local:', '').trim();
    const noteParent = noteLine.replace('note:', '').trim();

    const parent =
      (localParent && localParent !== '<none>' && localParent) ||
      (noteParent && noteParent !== '<none>' && noteParent) ||
      '<none>';

    item.text = `$(git-branch) Parent: ${parent}`;
  }

  function debouncedUpdate() {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => update().catch(console.error), 150);
  }

  // Initial update
  update().catch(console.error);

  // Watch .git/HEAD for instant branch switching
  const gitHeadWatcher =
    vscode.workspace.createFileSystemWatcher('**/.git/HEAD');
  gitHeadWatcher.onDidChange(debouncedUpdate);
  gitHeadWatcher.onDidCreate(debouncedUpdate);
  gitHeadWatcher.onDidDelete(debouncedUpdate);

  // Other useful events
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(debouncedUpdate),
    vscode.workspace.onDidSaveTextDocument(debouncedUpdate),
    vscode.workspace.onDidChangeWorkspaceFolders(debouncedUpdate),
    gitHeadWatcher,
    item,
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
