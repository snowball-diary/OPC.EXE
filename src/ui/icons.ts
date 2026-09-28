// 像素图标库（S6 自原型「一人公司物语-增强版.html」移植 + 修正 + 扩充）
// 全代码像素路线：零图片资产。8×8 字符画，drawIcon 到 canvas。
//
// 调色板字符：k 黑 / w 白 / y 金 / g 绿 / r 红 / b 青 / o 橙 / p 紫 / s 灰紫 / f 粉
// （原型 heart 用了 'pink' 三字符导致 PAL['i']/PAL['n'] 落白，S6 修正为单字符 'f'）
export const PAL: Record<string, string> = {
  k: '#1a1c2c',
  w: '#f4f4f4',
  y: '#f6c453',
  g: '#7bf1a8',
  r: '#ff6b6b',
  b: '#4ecdc4',
  o: '#c8823c',
  p: '#b8a9ff',
  s: '#8a87a8',
  f: '#ff8fab'
};

/** 8×8 字符画；'.' = 透明 */
export const ICONS: Record<string, string[]> = {
  coin: ['..kkkk..', '.kyyyyk.', 'kywwyyyk', 'kywyyyyk', 'kyyyyyyk', 'kyyyyyyk', '.kyyyyk.', '..kkkk..'],
  bolt: ['...kk...', '..kyyk..', '.kyyyk..', 'kyyyyyyk', '...kyyk.', '..kyyk..', '..kyk...', '..kk....'],
  hammer: ['.kkkkk..', 'kooooook', 'kooooook', 'kkkkookk', '....ok..', '....ok..', '....ok..', '....kk..'],
  mega: ['kk......', 'kykk....', 'kyyykk..', 'kyyyyyyk', 'kyyykk..', 'kykk....', 'kk..kk..', '.....kk.'],
  box: ['..kkkk..', '.koook..', 'kkookokk', 'kooooook', 'kookkook', 'kooooook', 'kooooook', '.kkkkkk.'],
  gear: ['.kk..kk.', '.kkkkkk.', 'kkkkkkkk', 'kkk..kkk', 'kkk..kkk', 'kkkkkkkk', '.kkkkkk.', '.kk..kk.'],
  book: ['.kk..kk.', 'kwwkkwwk', 'kwwkkwwk', 'kwkkkkwk', 'kwwkkwwk', 'kwwkkwwk', 'kwkkkkwk', '.kkkkkk.'],
  cup: ['........', 'kkkkkk..', 'kwwwwwkk', 'kwwwwwwk', 'kwwwwwkk', 'kwwwwk..', 'kwwwwk..', 'kkkkkk..'],
  star: ['...kk...', '..kyyk..', '..kyyk..', 'kkyyyykk', 'kyyyyyyk', '.kyyyyk.', '.kykkyk.', '.kk..kk.'],
  users: ['..kk.kk.', '.kwkkwk.', '.kwkkwk.', '..kk.kk.', '.kkkkkk.', 'kwwkkwkk', 'kwwkkwwk', 'kkkkkkkk'],
  cal: ['.kk..kk.', 'kkkkkkkk', 'kyyyyyyk', 'kkkkkkkk', 'kwwkkwwk', 'kwwkkwwk', 'kwwkkwkk', 'kkkkkkkk'],
  wrench: ['.kk..kk.', 'kwwkkwkk', 'kwwkkwwk', '.kkkkkk.', '...kk...', '...kk...', '..kkk...', '..kkk...'],
  flag: ['kk......', 'kykkkk..', 'kyyyyyk.', 'kyyykk..', 'kykk....', 'kk......', 'kk......', 'kk......'],
  note: ['...kk...', '...kyk..', '...kyk..', '...kyk..', '...kyk..', '.kkkyk..', 'kyyyyk..', '.kkkk...'],
  msg: ['kkkkkkkk', 'kwwwwwwk', 'kwkkkwkk', 'kwwwwwwk', 'kwkwwkwk', 'kwwwwwwk', 'kkkkkkkk', '..kk....'],
  code: ['........', '.kk..kk.', '..kwkw..', '.kwwwwwk', 'kwkwkwkk', '.kwwwwwk', '..kwkw..', '.kk..kk.'],
  pen: ['.....kk.', '....kyk.', '...kyyk.', '..kyyk..', '.kwyk...', '.kwk....', 'kwk.....', 'kk......'],
  heart: ['.kk..kk.', 'kffkkffk', 'kffffffk', 'kffffffk', '.kffffk.', '..kffk..', '...kk...', '........'],
  // ---- S6 新增 ----
  news: ['kkkkkkkk', 'kyyyyyyk', 'kwwwwwwk', 'kwsswssk', 'kwwwwwwk', 'kwssswsk', 'kwwwwwwk', 'kkkkkkkk'],
  snd: ['...kk...', '..kwk..b', '.kwwk.b.', 'kwwwkb.b', 'kwwwkb.b', '.kwwk.b.', '..kwk..b', '...kk...'],
  mute: ['...kk...', '..kwkr.r', '.kwwk.r.', 'kwwwkr.r', 'kwwwk.r.', '.kwwkr.r', '..kwk...', '...kk...'],
  bot: ['...y....', '...k....', '.kkkkkk.', '.kbwbwk.', '.kwwwwk.', '.kwsswk.', '.kkkkkk.', '.k.kk.k.'],
  moon: ['..kkk...', '.kwwsk..', 'kwsskk..', 'kwskk...', 'kwskk...', 'kwsskk..', '.kwwsk..', '..kkk...']
};

/** UI 各模块引用到的 icon key（tests/s6.test.ts 校验完整性） */
export const REQUIRED_ICON_KEYS: string[] = [
  'coin', 'bolt', 'heart', 'cal', 'gear', 'users', 'star', 'note', 'msg', 'flag',
  'book', 'code', 'pen', 'mega', 'hammer', 'box', 'cup', 'wrench', 'news', 'snd', 'mute', 'bot', 'moon'
];

/** 完整性自检：返回问题清单（空数组 = 全部合法），供单测与开发期断言 */
export function iconIssues(): string[] {
  const problems: string[] = [];
  const palette = new Set(Object.keys(PAL));
  for (const [key, rows] of Object.entries(ICONS)) {
    if (rows.length !== 8) problems.push(`${key}: 行数 ${rows.length} ≠ 8`);
    rows.forEach((row, i) => {
      if (row.length !== 8) problems.push(`${key}[${i}]: 列数 ${row.length} ≠ 8`);
      for (const ch of row) {
        if (ch !== '.' && !palette.has(ch)) problems.push(`${key}[${i}]: 未知字符 '${ch}'`);
      }
    });
  }
  for (const key of REQUIRED_ICON_KEYS) {
    if (!(key in ICONS)) problems.push(`REQUIRED '${key}' 无像素数据`);
  }
  return problems;
}

/** 把 icon 画到 canvas（canvas 需带 data-icon 或显式传 key） */
export function drawIcon(cv: HTMLCanvasElement, key?: string): void {
  const k = key ?? cv.dataset.icon;
  const rows = k ? ICONS[k] : undefined;
  if (!rows) return;
  cv.width = 8;
  cv.height = 8;
  const c = cv.getContext('2d');
  if (!c) return;
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch !== '.') {
        c.fillStyle = PAL[ch] ?? '#fff';
        c.fillRect(x, y, 1, 1);
      }
    });
  });
}

/** 扫描 root 下所有 canvas[data-icon] 并绘制 */
export function renderIcons(root: ParentNode): void {
  root.querySelectorAll<HTMLCanvasElement>('canvas[data-icon]').forEach(cv => drawIcon(cv));
}

/** 生成 icon canvas 的 HTML 片段（随后调 renderIcons(container) 上色） */
export function iconHtml(key: string, cls = 'icon'): string {
  return `<canvas class="${cls}" data-icon="${key}"></canvas>`;
}
