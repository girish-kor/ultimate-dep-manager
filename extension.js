const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);

const PM_LOCK_FILES = {
  npm: 'package-lock.json',
  yarn: 'yarn.lock',
  pnpm: 'pnpm-lock.yaml',
  bun: 'bun.lockb',
};

async function activate(context) {
  const outputChannel = vscode.window.createOutputChannel('Ultimate Dep Manager');
  context.subscriptions.push(outputChannel);

  // Status Bar Integration
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = '(♧)';
  statusBar.tooltip = 'Ultimate Dependency Management';
  statusBar.command = 'ultimateDep.showPanel';
  statusBar.color = '#007ACC';
  statusBar.backgroundColor = new vscode.ThemeColor('statusBar.background');
  statusBar.show();

  // Tree View Provider
  const treeDataProvider = new DependencyTreeProvider();
  vscode.window.registerTreeDataProvider('dependencyExplorer', treeDataProvider);

  // Webview Content Generator
  const getWebviewContent = () => {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        :root {
          --vscode-font-family: var(--vscode-font-family, 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Ubuntu', 'Droid Sans', sans-serif);
          --vscode-background: var(--vscode-editor-background);
          --vscode-foreground: var(--vscode-editor-foreground);
          --vscode-button-bg: var(--vscode-button-background);
          --vscode-button-hover: var(--vscode-button-hoverBackground);
          --vscode-border: var(--vscode-editorWidget-border);
        }

        body {
          padding: 20px;
          margin: 0;
          background: var(--vscode-background);
          color: var(--vscode-foreground);
          font-family: var(--vscode-font-family);
          line-height: 1.6;
        }

        .container {
          max-width: 800px;
          margin: 0 auto;
        }

        h1 {
          font-size: 1.8em;
          font-weight: 600;
          margin-bottom: 1.5rem;
          border-bottom: 1px solid var(--vscode-border);
          padding-bottom: 0.5rem;
          color: var(--vscode-titleBar-activeForeground);
        }

        .button-group {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          margin-bottom: 2rem;
        }

        button {
          padding: 10px 16px;
          background: var(--vscode-button-bg);
          color: var(--vscode-button-foreground);
          border: 1px solid var(--vscode-button-border);
          border-radius: 3px;
          cursor: pointer;
          font-family: inherit;
          font-size: 0.9em;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        button:hover {
          background: var(--vscode-button-hover);
          transform: translateY(-1px);
        }

        button:active {
          transform: translateY(0);
        }

        .status-section {
          background: var(--vscode-sideBar-background);
          border-radius: 4px;
          padding: 1.5rem;
          margin-top: 1.5rem;
          border: 1px solid var(--vscode-border);
        }

        .status-title {
          font-size: 1.1em;
          font-weight: 500;
          margin-bottom: 1rem;
          color: var(--vscode-statusBar-foreground);
        }

        .status-item {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid var(--vscode-border);
        }

        .status-label {
          color: var(--vscode-descriptionForeground);
        }

        .status-value {
          font-family: var(--vscode-editor-font-family);
          font-weight: 600;
        }

        .progress-bar {
          height: 4px;
          background: var(--vscode-progressBar-background);
          border-radius: 2px;
          margin-top: 1rem;
          overflow: hidden;
        }

        .progress {
          width: 0%;
          height: 100%;
          background: var(--vscode-activityBarBadge-background);
          transition: width 0.3s ease;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Ultimate Dependency Manager</h1>
        
        <div class="button-group">
          <button onclick="handleCommand('install')">
            Install All
          </button>
          <button onclick="handleCommand('update')">
            Update All
          </button>
        </div>

        <div class="status-section">
          <div class="status-title">Current Status</div>
          <div class="status-item">
            <span class="status-label">Last Updated:</span>
            <span class="status-value" id="lastUpdated">-</span>
          </div>
          <div class="status-item">
            <span class="status-label">Dependencies:</span>
            <span class="status-value" id="dependencyCount">Loading...</span>
          </div>
          <div class="progress-bar">
            <div class="progress" id="progress"></div>
          </div>
        </div>
      </div>

      <script>
        const vscode = acquireVsCodeApi();
        
        function handleCommand(command) {
          document.getElementById('progress').style.width = '30%';
          vscode.postMessage({ type: command });
        }

        window.addEventListener('message', event => {
          const message = event.data;
          if (message.type === 'updateStatus') {
            document.getElementById('lastUpdated').textContent = new Date().toLocaleString();
            document.getElementById('dependencyCount').textContent = message.count;
            document.getElementById('progress').style.width = '100%';
            setTimeout(() => {
              document.getElementById('progress').style.width = '0%';
            }, 1000);
          }
        });
      </script>
    </body>
    </html>
  `;
  };

  // Webview Message Handler
  const handleWebviewMessage = message => {
    switch (message.type) {
      case 'install':
        handleDependencyAction('install');
        break;
      case 'update':
        handleDependencyAction('update');
        break;
    }
  };

  // Modified handleDependencyAction
  const handleDependencyAction = async (action, dep) => {
    const pm = await detectPackageManager();
    try {
      let command = `${pm} `;
      switch (action) {
        case 'install':
          command += dep ? `install ${dep}` : 'install';
          break;
        case 'uninstall':
          command += `remove ${dep}`;
          break;
        case 'update':
          command += dep ? `update ${dep}` : 'update';
          break;
      }

      await executeCommand(command);
      treeDataProvider.refresh();

      // Add status update after successful command
      const count = await getDependencyCount();
      if (panel) {
        panel.webview.postMessage({
          type: 'updateStatus',
          count,
        });
      }
    } catch (error) {
      vscode.window.showErrorMessage(`${action} failed: ${error.message}`);
    }
  };

  // Modified runSecurityAudit
  const runSecurityAudit = async () => {
    try {
      const pm = await detectPackageManager();
      await executeCommand(`${pm} audit fix`);
      treeDataProvider.refresh();

      // Add status update after audit fix
      const count = await getDependencyCount();
      if (panel) {
        panel.webview.postMessage({
          type: 'updateStatus',
          count,
        });
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Security audit failed: ${error.message}`);
    }
  };

  // Add at the top of activate function
  let panel;

  // Modified showWebviewPanel function
  const showWebviewPanel = () => {
    panel = vscode.window.createWebviewPanel(
      'depManager',
      'Ultimate Dependency Manager',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    panel.webview.html = getWebviewContent();
    panel.webview.onDidReceiveMessage(handleWebviewMessage);

    // Add initial status update
    panel.onDidChangeViewState(async ({ webviewPanel }) => {
      if (webviewPanel.visible) {
        const count = await getDependencyCount();
        webviewPanel.webview.postMessage({
          type: 'updateStatus',
          count,
        });
      }
    });

    // Cleanup on panel close
    panel.onDidDispose(() => {
      panel = undefined;
    });
  };

  // Add new helper function to count dependencies
  const getDependencyCount = async () => {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) return 0;

    try {
      const packageJson = JSON.parse(
        await readFile(path.join(workspaceRoot, 'package.json'), 'utf8')
      );
      return (
        Object.keys(packageJson.dependencies || {}).length +
        Object.keys(packageJson.devDependencies || {}).length
      );
    } catch {
      return 0;
    }
  };

  // Package Manager Detection
  const detectPackageManager = async () => {
    const workspaceRoot = getWorkspaceRoot();
    for (const [pm, lockFile] of Object.entries(PM_LOCK_FILES)) {
      if (fs.existsSync(path.join(workspaceRoot, lockFile))) {
        return pm;
      }
    }
    return 'npm';
  };

  // Command Executor
  const executeCommand = command => {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Running ${command}`,
        cancellable: false,
      },
      async () => {
        return new Promise((resolve, reject) => {
          const child = exec(command, { cwd: getWorkspaceRoot() }, (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve({ stdout, stderr });
          });

          outputChannel.appendLine(`Running: ${command}`);
          child.stdout.on('data', data => outputChannel.append(data));
          child.stderr.on('data', data => outputChannel.append(data));
        });
      }
    );
  };

  // Workspace Utilities
  const getWorkspaceRoot = () => {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  };

  // Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('ultimateDep.showPanel', showWebviewPanel),
    vscode.commands.registerCommand('ultimateDep.install', dep =>
      handleDependencyAction('install', dep)
    ),
    vscode.commands.registerCommand('ultimateDep.uninstall', dep =>
      handleDependencyAction('uninstall', dep)
    ),
    vscode.commands.registerCommand('ultimateDep.update', dep =>
      handleDependencyAction('update', dep)
    ),
    vscode.commands.registerCommand('ultimateDep.auditFix', runSecurityAudit),
    vscode.commands.registerCommand('ultimateDep.refresh', () => treeDataProvider.refresh())
  );
}

class DependencyTreeProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  getTreeItem(element) {
    return element;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  async getChildren(element) {
    return element ? this.getDependencyNodes(element) : this.getRootNodes();
  }

  async getRootNodes() {
    const analysis = await this.analyzeDependencies();
    return [
      new DependencyNode('Outdated Dependencies', analysis?.outdated, 'warning'),
      new DependencyNode('Security Vulnerabilities', analysis?.vulnerabilities, 'error'),
      new DependencyNode('Unused Dependencies', analysis?.unused, 'info'),
    ];
  }

  async getDependencyNodes(element) {
    if (!element?.data) return [];
    return Object.entries(element.data).map(
      ([name, details]) =>
        new DependencyNode(`${name}@${details.current} → ${details.latest}`, details, 'info')
    );
  }

  async analyzeDependencies() {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return {};

    try {
      const [outdated, unused] = await Promise.all([
        this.getOutdatedDependencies(),
        this.findUnusedDependencies(),
      ]);
      return { outdated, vulnerabilities: {}, unused };
    } catch (error) {
      return {};
    }
  }

  async getOutdatedDependencies() {
    try {
      const { stdout } = await this.executeCommand('npm outdated --json');
      return JSON.parse(stdout || '{}');
    } catch (error) {
      return {};
    }
  }

  async findUnusedDependencies() {
    try {
      const { stdout } = await this.executeCommand('npx depcheck --json');
      return JSON.parse(stdout || '{}');
    } catch (error) {
      return {};
    }
  }

  executeCommand(command) {
    return new Promise((resolve, reject) => {
      exec(
        command,
        { cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath },
        (error, stdout, stderr) => {
          if (error) reject(error);
          else resolve({ stdout, stderr });
        }
      );
    });
  }
}

class DependencyNode extends vscode.TreeItem {
  constructor(label, data, severity) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.data = data;
    this.iconPath = new vscode.ThemeIcon(severity === 'error' ? 'warning' : 'info');
    this.contextValue = severity;
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
