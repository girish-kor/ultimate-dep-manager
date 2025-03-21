const assert = require('assert');
const vscode = require('vscode');

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Running tests...');

  test('Extension should be present', () => {
    const extension = vscode.extensions.getExtension('girish-kor.ultimate-dependency-manager');
    assert.ok(extension, 'Extension is not installed or loaded properly');
  });

  test('Dependency Manager Panel should register commands', async () => {
    const commands = await vscode.commands.getCommands();
    assert.ok(commands.includes('ultimateDep.showPanel'), 'Show Panel command is missing');
    assert.ok(commands.includes('ultimateDep.install'), 'Install command is missing');
    assert.ok(commands.includes('ultimateDep.update'), 'Update command is missing');
    assert.ok(commands.includes('ultimateDep.auditFix'), 'Security audit command is missing');
  });
});
