// 从 CHANGELOG.md 生成 changelog.js（extension.js 的「更新日志」面板用）
// release.sh 每次发版会自动调用；手动更新 CHANGELOG.md 后也可单独 node _gen_changelog.cjs
const fs = require('fs');
const SRC = 'CHANGELOG.md';
const src = fs.readFileSync(SRC, 'utf8');
const lines = src.split('\n');
// 版本小节以 "## vX.Y.Z" 开头，其之前的内容（文件说明）不进面板
const start = lines.findIndex(line => /^##\s+v/.test(line));
if (start < 0) throw new Error(`${SRC} 缺少版本小节（## vX.Y.Z）`);
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let html = '<div class="new_style" style="font-size:14px;line-height:1.6">';
let inList = false;
for (const raw of lines.slice(start)) {
  const line = raw.trim();
  if (!line || line === '---') continue;
  if (line.startsWith('## ')) {
    if (inList) { html += '</ul>'; inList = false; }
    html += '<h3 style="margin:8px 0 4px;color:#e8c46a">' + esc(line.slice(3)) + '</h3>';
  } else if (line.startsWith('### ')) {
    if (inList) { html += '</ul>'; inList = false; }
    html += '<h4 style="margin:6px 0 2px;color:#e8c46a">' + esc(line.slice(4)) + '</h4>';
  } else if (line.startsWith('- ')) {
    if (!inList) { html += '<ul style="margin:2px 0 6px 18px;padding:0">'; inList = true; }
    html += '<li>' + esc(line.slice(2)).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') + '</li>';
  } else {
    if (inList) { html += '</ul>'; inList = false; }
    html += '<p>' + esc(line).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') + '</p>';
  }
}
if (inList) html += '</ul>';
html += '</div>';
// 最新一版小节（扩展入口页面展示）：加粗标题 + 每条一行，<br> 分隔
const latestLines = [];
let started = false;
for (const raw of lines.slice(start)) {
  const line = raw.trim();
  if (!line || line === '---') continue;
  if (line.startsWith('## ')) {
    if (started) break;
    started = true;
    latestLines.push('<b style="color:#e8c46a">' + esc(line.slice(3)) + '</b>');
  } else if (started && line.startsWith('- ')) {
    latestLines.push('· ' + esc(line.slice(2)).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'));
  } else if (started && line.startsWith('**')) {
    latestLines.push('<b>' + esc(line.replace(/\*\*/g, '')) + '</b>');
  }
}
const latestHtml = latestLines.join('<br>');
fs.writeFileSync('changelog.js',
  'const changelog = ' + JSON.stringify(html) + ';\n' +
  'const changelogLatest = ' + JSON.stringify(latestHtml) + ';\n' +
  'export { changelog, changelogLatest };\n');
console.log('changelog.js generated, len', html.length, '| latest len', latestHtml.length);
