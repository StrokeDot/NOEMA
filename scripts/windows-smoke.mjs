// Runs only on an ephemeral Windows CI runner, against the installed release.
// CDP is enabled by an app-specific policy on this disposable runner only.
// The shipped application configuration does not enable remote debugging.
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

if (process.platform !== 'win32' || !process.env.CI || !process.env.RUNNER_TEMP)
  throw new Error('This smoke test requires an ephemeral Windows CI runner.');
const output = resolve('test-results');
await mkdir(output, { recursive: true });
const report = { installed: false, launches: 0, embeddedAssets: false, bookReopened: false, scriptReopened: false, upgradePreserved: false };
let app, browser;
let testPolicy = false;
const pause = ms => new Promise(r => setTimeout(r, ms));
async function run(command, args) {
  const child = spawn(command, args, { stdio: 'inherit' });
  const [code] = await once(child, 'exit');
  if (code !== 0) throw new Error(`${command} exited with ${code}`);
}
async function stop() {
  if (app && app.exitCode === null) {
    await run('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${app.pid}).CloseMainWindow() | Out-Null`]);
    for (let i = 0; i < 100 && app.exitCode === null; i++) await pause(100);
    if (app.exitCode === null) throw new Error('Installed app did not close normally.');
  }
  await browser?.close().catch(() => {});
  browser = undefined;
}
const installDir = join(process.env.RUNNER_TEMP, 'noema-installed-smoke');
async function launch(executable) {
  app = spawn(executable, [], { stdio: 'inherit', env: { ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9222' } });
  app.on('error', e => console.error(e));
  let connectionError;
  for (let i = 0; i < 120; i++) {
    if (app.exitCode !== null) throw new Error(`App exited during startup: ${app.exitCode}`);
    try { browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 1000 }); break; }
    catch (error) { connectionError = String(error); await pause(500); }
  }
  if (!browser) throw new Error(`Installed WebView2 did not expose a test connection: ${connectionError}`);
  let page;
  for (let i = 0; i < 60; i++) {
    page = browser.contexts().flatMap(c => c.pages()).find(p => /tauri\.localhost|tauri:/.test(p.url()));
    if (page) break;
    await pause(500);
  }
  if (!page) throw new Error('Installed app did not load its embedded frontend.');
  page.setDefaultTimeout(15000);
  await expect(page.getByRole('button', { name: '+ New writing project' })).toBeVisible({ timeout: 30000 });
  report.launches++;
  report.embeddedAssets = true;
  return page;
}
try {
  const bundle = resolve('src-tauri/target/release/bundle/nsis');
  const installers = (await readdir(bundle)).filter(f => f.endsWith('.exe'));
  if (installers.length !== 1) throw new Error('Expected exactly one NSIS installer.');
  // NSIS requires /D to be the final argument, without embedded quotes.
  const currentInstaller = join(bundle, installers[0]);
  let initialInstaller = currentInstaller;
  if (process.env.NOEMA_BASELINE_DIR) {
    const files = (await readdir(process.env.NOEMA_BASELINE_DIR)).filter(f => f.endsWith('.exe'));
    if (files.length !== 1) throw new Error('Expected one baseline installer.');
    initialInstaller = join(process.env.NOEMA_BASELINE_DIR, files[0]);
  }
  await run(initialInstaller, ['/S', `/D=${installDir}`]);
  const executables = (await readdir(installDir)).filter(f => /^noema\.exe$/i.test(f));
  if (executables.length !== 1) throw new Error('Installer did not create noema.exe.');
  report.installed = true;
  const executable = join(installDir, executables[0]);
  // WebView2 150+ ignores environment and HKCU overrides for elevated hosts.
  // Use the documented HKLM test policy on this disposable CI runner only.
  // https://github.com/MicrosoftEdge/WebView2Feedback/issues/5645
  await run('reg.exe', ['add', 'HKLM\\Software\\Policies\\Microsoft\\Edge\\WebView2\\AdditionalBrowserArguments', '/v', 'noema.exe', '/t', 'REG_SZ', '/d', '--remote-debugging-port=9222', '/f']);
  testPolicy = true;
  let page = await launch(executable);
  const modal = page.getByRole('dialog', { name: 'New writing project' });
  if (!(await modal.isVisible())) await page.getByRole('button', { name: '+ New writing project' }).click();
  if (await modal.getByRole('button', { name: 'Book project', exact: false }).isVisible())
    await modal.getByRole('button', { name: 'Book project', exact: false }).click();
  await modal.getByLabel('Book title', { exact: true }).fill('Windows installer persistence check');
  await modal.getByLabel('Author', { exact: true }).fill('NOEMA verification');
  await modal.getByRole('button', { name: 'Create writing project' }).click();
  await expect(modal).toBeHidden();
  page.once('dialog', d => d.accept('Installed chapter'));
  await page.getByRole('button', { name: 'Create a chapter', exact: true }).click();
  await page.locator('[contenteditable=true]').fill('Written in the installed Windows application.');
  await expect(page.getByText('● Saved on this computer')).toBeVisible();
  await stop();
  page = await launch(executable);
  await expect(page.locator('[contenteditable=true]')).toContainText('Written in the installed Windows application.');
  report.bookReopened = true;
  await page.getByRole('button', { name: '+ New writing project' }).click();
  const project = page.getByRole('dialog', { name: 'New writing project' });
  if (await project.getByRole('button', { name: 'YouTube channel script', exact: false }).isVisible())
    await project.getByRole('button', { name: 'YouTube channel script', exact: false }).click();
  else await project.getByLabel('Project format').selectOption('Video Script');
  await project.getByLabel('New channel name').fill('Installed channel');
  await project.getByRole('button', { name: '+ Create channel' }).click();
  await expect(project.getByLabel('Video script channel')).not.toHaveValue('');
  await project.getByLabel('Video script title').fill('Installed video');
  await project.getByLabel('Author', { exact: true }).fill('NOEMA verification');
  await project.getByRole('button', { name: 'Create writing project' }).click();
  await expect(project).toBeHidden();
  await page.getByRole('button', { name: 'Create first scene' }).click();
  await page.getByLabel('Narration / voiceover').fill('Persistent narration.');
  await page.getByLabel('Footage and visual directions').fill('Persistent visual direction.');
  await expect(page.locator('.cue-header-actions [role=status]')).toHaveText('Saved on this computer');
  await stop();
  page = await launch(executable);
  await expect(page.getByLabel('Narration / voiceover')).toHaveValue('Persistent narration.');
  await expect(page.getByLabel('Footage and visual directions')).toHaveValue('Persistent visual direction.');
  report.scriptReopened = true;
  await stop();
  if (process.env.NOEMA_BASELINE_DIR) {
    // Upgrade the same installation, leaving its real app-data folder in place.
    await run(currentInstaller, ['/S', `/D=${installDir}`]);
    page = await launch(executable);
    await expect(page.getByLabel('Narration / voiceover')).toHaveValue('Persistent narration.');
    await expect(page.getByLabel('Footage and visual directions')).toHaveValue('Persistent visual direction.');
    await expect(page.getByRole('button', {name:'Manuscript', exact:true})).toHaveCount(0);
    await page.getByRole('button', {name:'Books', exact:true}).click();
    await expect(page.locator('[contenteditable=true]')).toContainText('Written in the installed Windows application.');
    await expect(page.getByRole('button', {name:'Channel profiles', exact:true})).toHaveCount(0);
    await stop();
    page = await launch(executable);
    await expect(page.locator('[contenteditable=true]')).toContainText('Written in the installed Windows application.');
    report.upgradePreserved = true;
  } else page = await launch(executable);
  await page.screenshot({ path: join(output, 'installed-windows-app.png') });
  await stop();
} catch (error) {
  report.error = String(error.stack || error);
  const page = browser?.contexts().flatMap(c => c.pages())[0];
  await page?.screenshot({ path: join(output, 'installed-windows-failure.png') }).catch(() => {});
  throw error;
} finally {
  await writeFile(join(output, 'native-windows-smoke.json'), JSON.stringify(report, null, 2));
  if (app && app.exitCode === null) app.kill();
  await browser?.close().catch(() => {});
  if (testPolicy) await run('reg.exe', ['delete', 'HKLM\\Software\\Policies\\Microsoft\\Edge\\WebView2\\AdditionalBrowserArguments', '/v', 'noema.exe', '/f']);
}
