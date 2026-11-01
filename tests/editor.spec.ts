import { test, expect, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { newProject, object, Project } from '../src/runtime';

const num = (n: number) => ({ shadow: { type: 'math_number', fields: { NUM: n } } });
const get = (id: string) => ({ block: { type: 'variables_get', fields: { VAR: { id } } } });
function colorPng(red: number, green: number, blue: number) {
  const chunk = (name: string, data: Buffer) => {
    const type = Buffer.from(name), buffer = Buffer.concat([type, data]);
    let crc = 0xffffffff;
    for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    const size = Buffer.alloc(4), checksum = Buffer.alloc(4);
    size.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, buffer, checksum]);
  };
  const header = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.from([0, red, green, blue, 255]), { level: 0 })), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
async function importProject(page: Page, project: Project | string, html = false) {
  await page.locator('input[accept^=".json"]').setInputFiles({
    name: html ? 'game.html' : 'game.mge.json', mimeType: html ? 'text/html' : 'application/json',
    buffer: Buffer.from(typeof project === 'string' ? project : JSON.stringify(project)),
  });
  await expect(page.locator('input[accept^=".json"]')).toHaveValue('');
}
async function savedProject(page: Page) {
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  const download = await downloaded;
  return JSON.parse(await readFile((await download.path())!, 'utf8'));
}
async function observeText(page: Page) {
  await page.addInitScript(() => {
    (window as any).__drawnText = [];
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args: any[]) {
      (window as any).__drawnText.push(String(args[0]));
      if ((window as any).__drawnText.length > 100) (window as any).__drawnText.shift();
      return fillText.apply(this, args as any);
    };
  });
}
async function expectText(page: Page, text: string) {
  await expect.poll(() => page.evaluate((t) => (window as any).__drawnText.includes(t), text)).toBe(true);
}
async function gamePoint(page: Page, x = 0, y = -60) {
  const box = await page.locator('canvas[aria-label="게임 무대"],#game').boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width * (x / 480 + .5), y: box!.y + box!.height * (.5 - y / 360) };
}
function scoreGame() {
  const p = newProject(), scene = p.scenes[0];
  p.name = '점수 게임';
  const label = object('점수판'); label.y = 100; label.shape = 'text'; label.text = '점수: 0';
  label.code = { variables: [{ id: 'label-score', name: '점수' }], blocks: { languageVersion: 0, blocks: [
    { type: 'event_start', next: { block: { type: 'variables_set', fields: { VAR: { id: 'label-score' } }, inputs: { VALUE: num(0) }, next: { block: {
      type: 'forever', inputs: { DO: { block: { type: 'set_text', inputs: { TEXT: { block: {
        type: 'text_join', extraState: { itemCount: 2 }, inputs: { ADD0: { block: { type: 'text', fields: { TEXT: '점수: ' } } }, ADD1: get('label-score') },
      } } } } } },
    } } } } },
  ] } };
  const button = object('점수 버튼'); button.y = -60;
  button.code = { variables: [{ id: 'button-score', name: '점수' }, { id: 'amount', name: '얼마' }], blocks: { languageVersion: 0, blocks: [
    { type: 'procedures_defnoreturn', fields: { NAME: '점수 추가' }, extraState: { params: [{ id: 'amount', name: '얼마' }] }, inputs: { STACK: { block: {
      type: 'math_change', fields: { VAR: { id: 'button-score' } }, inputs: { DELTA: get('amount') }, next: { block: {
        type: 'controls_if', inputs: {
          IF0: { block: { type: 'logic_compare', fields: { OP: 'GTE' }, inputs: { A: get('button-score'), B: num(3) } } },
          DO0: { block: { type: 'switch_scene', fields: { NAME: '승리' } } },
        },
      } },
    } } } },
    { type: 'event_click', next: { block: { type: 'procedures_callnoreturn', extraState: { name: '점수 추가', params: ['얼마'] }, inputs: { ARG0: num(1) } } } },
  ] } };
  scene.objects = [label, button];
  const win = newProject().scenes[0]; win.name = '승리'; win.objects[0].shape = 'text'; win.objects[0].text = '승리!';
  p.scenes.push(win); p.selectedId = label.id;
  p.sounds = [{ id: 'silence', name: '무음', dataUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAESsAAABAAgAZGF0YQAAAAA=' }];
  return p;
}
test('장면 삭제·복원과 같은 ID 프로젝트 다시 불러오기', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const p = scoreGame(); await importProject(page, p);
  await expect(page.getByLabel('프로젝트 이름')).toHaveValue(p.name);
  await page.getByLabel('장면 선택').selectOption(p.scenes[1].id);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '장면 삭제', exact: true }).click();
  await expect(page.getByLabel('장면 선택').locator('option')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '장면 삭제', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '삭제 되돌리기' }).click();
  await expect(page.getByLabel('장면 선택').locator('option')).toHaveCount(2);
  await expect(page.getByLabel('장면 선택')).toHaveValue(p.scenes[1].id);
  await page.getByRole('button', { name: '장면 복제', exact: true }).click();
  await expect(page.getByLabel('장면 선택').locator('option')).toHaveCount(3);
  const copied = await savedProject(page);
  expect(new Set(copied.scenes.flatMap((s: any) => s.objects.map((o: any) => o.id))).size).toBe(4);
  const changed = structuredClone(p);
  changed.name = '같은 ID 다시 열기';
  changed.scenes[0].objects[0].code = { blocks: { languageVersion: 0, blocks: [{ type: 'event_start', next: { block: { type: 'change_x', inputs: { N: num(42) } } } }] } };
  await importProject(page, p);
  await importProject(page, changed);
  await expect(page.getByLabel('프로젝트 이름')).toHaveValue(changed.name);
  expect((await savedProject(page)).scenes[0].objects[0].code.blocks.blocks[0].next.block.inputs.N.shadow.fields.NUM).toBe(42);
  await expect(page.locator('footer')).toContainText('자동 저장됨');
  await page.reload();
  await expect(page.getByLabel('프로젝트 이름')).toHaveValue(changed.name);
  expect((await savedProject(page)).scenes[0].objects[0].code.blocks.blocks[0].next.block.inputs.N.shadow.fields.NUM).toBe(42);
  expect(errors).toEqual([]);
});
test('점수·사용자 블록·장면 전환과 오프라인 모바일 HTML 실행', async ({ page, browser }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await observeText(page); await page.goto('/');
  const p = scoreGame(); await importProject(page, p);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'HTML 내보내기' }).click();
  const file = testInfo.outputPath('game.html'); await (await downloaded).saveAs(file);
  const html = await readFile(file, 'utf8');
  expect(html).not.toContain('<button');
  expect(html).not.toMatch(/<(?:script|link)[^>]+(?:src|href)=/);
  await importProject(page, html, true);
  const roundTrip = await savedProject(page);
  expect(roundTrip.sounds).toEqual(p.sounds);
  expect(roundTrip.scenes[0].objects[1].code.blocks.blocks[1].next.block.extraState.name).toBe('점수 추가');
  await page.getByRole('button', { name: '▶ 실행' }).click();
  await page.getByRole('button', { name: '■ 중지' }).hover();
  await expect(page.getByRole('button', { name: '■ 중지' })).toHaveCSS('background-color', 'rgb(216, 77, 90)');
  await expectText(page, '점수: 0');
  const point = await gamePoint(page);
  for (let n = 1; n <= 2; n++) { await page.mouse.click(point.x, point.y); await expectText(page, '점수: ' + n); }
  await page.mouse.click(point.x, point.y); await expectText(page, '승리!');
  await page.getByRole('button', { name: '■ 중지' }).click();
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, offline: true });
  const exported = await mobile.newPage(); await observeText(exported);
  const requests: string[] = []; exported.on('request', (request) => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  exported.on('pageerror', (error) => errors.push(error.message));
  await exported.goto(pathToFileURL(file).href);
  await expectText(exported, '점수: 0');
  const bounds = await exported.locator('#game').boundingBox();
  expect(bounds!.width / bounds!.height).toBeCloseTo(4 / 3, 3);
  expect(bounds!.width).toBeLessThanOrEqual(390.1);
  expect(bounds!.height).toBeLessThanOrEqual(844);
  const touch = await gamePoint(exported);
  for (let n = 1; n <= 2; n++) { await exported.touchscreen.tap(touch.x, touch.y); await expectText(exported, '점수: ' + n); }
  await exported.screenshot({ path: testInfo.outputPath('mobile-game.png') });
  await exported.touchscreen.tap(touch.x, touch.y); await expectText(exported, '승리!');
  expect(await exported.locator('button').count()).toBe(0);
  expect(requests).toEqual([]); expect(errors).toEqual([]);
  await mobile.close();
});
test('모바일 실행 무대와 사용자 해상도 입력', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); await observeText(page); await page.goto('/');
  await importProject(page, scoreGame());
  await page.getByRole('button', { name: '▶ 실행' }).click();
  await expect(page.locator('canvas[aria-label="게임 무대"]')).toBeVisible();
  await expectText(page, '점수: 0');
  await page.screenshot({ path: testInfo.outputPath('mobile-editor.png') });
  await page.getByRole('button', { name: '■ 중지' }).click();
  await page.getByLabel('게임 기준 해상도').selectOption('custom');
  const width = page.getByLabel('너비 (240–3840)'), height = page.getByLabel('높이 (240–2160)');
  await width.fill('1000'); await width.press('Enter');
  await height.fill('625'); await height.press('Enter');
  await expect(width).toHaveValue('1000'); await expect(height).toHaveValue('625');
  const bounds = await page.locator('canvas[aria-label="게임 무대"]').boundingBox();
  expect(bounds!.width / bounds!.height).toBeCloseTo(1.6, 2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
test('도형·이미지 겹침 순서와 같은 크기 이미지 교체', async ({ page }) => {
  await page.goto('/');
  const colors = [colorPng(255, 0, 0), colorPng(0, 0, 255)];
  expect(colors[0].length).toBe(colors[1].length);
  const p = newProject(), sprite = p.scenes[0].objects[0];
  sprite.image = colors[0]; sprite.code = {};
  const square = object('앞 도형'); square.shape = 'square'; square.color = '#00ff00';
  p.scenes[0].objects.push(square); p.selectedId = square.id;
  await importProject(page, p);
  const pixel = () => page.locator('canvas[aria-label="게임 무대"]').evaluate((canvas: HTMLCanvasElement) => [...canvas.getContext('2d')!.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data].slice(0, 3));
  await expect.poll(pixel).toEqual([0, 255, 0]);
  await page.getByRole('button', { name: '뒤로', exact: true }).click();
  await expect.poll(pixel).toEqual([255, 0, 0]);
  await page.getByRole('button', { name: sprite.name, exact: true }).click();
  await page.locator('input[accept="image/png,image/jpeg,image/webp"]').setInputFiles({ name: 'blue.png', mimeType: 'image/png', buffer: Buffer.from(colors[1].split(',')[1], 'base64') });
  await expect.poll(pixel).toEqual([0, 0, 255]);
});
test('다른 오브젝트의 변수를 선택하고 블록을 끌어 작성하기', async ({ page }) => {
  await page.goto('/');
  const p = newProject(), other = object('다른 오브젝트');
  other.code = { variables: [{ id: 'shared-score', name: '점수' }], blocks: { languageVersion: 0, blocks: [] } };
  p.scenes[0].objects.push(other);
  await importProject(page, p);
  await page.locator('.blocklyToolboxCategory').filter({ hasText: /^자료$/ }).click();
  const flyout = page.locator('.blocklyFlyout').filter({ visible: true });
  await expect(flyout.locator('.blocklyText').filter({ hasText: '점수' }).first()).toBeVisible();
  const block = flyout.locator('.blocklyBlockCanvas > .blocklyDraggable').first();
  const from = await block.boundingBox(), workspace = await page.locator('.block-wrap').boundingBox();
  expect(from).not.toBeNull(); expect(workspace).not.toBeNull();
  await page.mouse.move(from!.x + 15, from!.y + 15);
  await page.mouse.down();
  await page.mouse.move(workspace!.x + workspace!.width * .7, workspace!.y + 180, { steps: 20 });
  await page.mouse.up();
  const saved = await savedProject(page);
  expect(saved.scenes[0].objects[0].code.blocks.blocks.length).toBeGreaterThan(0);
  expect(saved.scenes[0].objects[0].code.variables.some((v: any) => v.name === '점수')).toBe(true);
});
