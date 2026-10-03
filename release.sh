#!/usr/bin/env bash
# 呼风唤雨 一键发版脚本
# 用法: ./release.sh <版本号> <提交信息> [更新日志文件]
#   - 更新日志文件为可选的 markdown 正文（不含 "### vX（日期）" 标题，脚本自动生成标题）；
#     提供时会被插入 README.md 的「## 更新日志」之后，并附进 GitHub Release 正文。
# 流程: 改版本号 → 写 README → 提交 → 打 tag → git archive 打包 → 推送(自动重试) → 建 Release → 传资产 → 删本地 zip
set -euo pipefail
cd "$(dirname "$0")"

if [ $# -lt 2 ]; then
  echo "用法: $0 <版本号> <提交信息> [更新日志文件]" >&2
  exit 1
fi
VER="$1"; MSG="$2"; CHANGELOG_FILE="${3:-}"
TODAY=$(date +%Y-%m-%d)
ZIP="../hufenghuanyu-v${VER}.zip"

# 1. 版本号
sed -i "s/\"version\":\"[^\"]*\"}/\"version\":\"${VER}\"}/" info.json
echo "[1/8] info.json -> ${VER}"

# 2. README 更新日志
if [ -n "$CHANGELOG_FILE" ] && [ -f "$CHANGELOG_FILE" ]; then
  node -e "
    const fs = require('fs');
    const readme = fs.readFileSync('README.md', 'utf8');
    const body = fs.readFileSync('${CHANGELOG_FILE}', 'utf8').trim();
    const section = \`### v${VER}（${TODAY}）\n\n\${body}\n\n\`;
    const anchor = '## 更新日志\n';
    const idx = readme.indexOf(anchor);
    if (idx < 0) { console.error('README 缺少「## 更新日志」'); process.exit(1); }
    fs.writeFileSync('README.md', readme.slice(0, idx + anchor.length) + '\n' + section + readme.slice(idx + anchor.length).replace(/^\n+/, ''));
  "
  echo "[2/8] README 已插入 v${VER} 日志"
else
  echo "[2/8] 无更新日志文件，跳过 README"
fi

# 3. 提交 + tag
git add -A -- . ":(exclude)_changelog.tmp"
git commit -m "${MSG}" || echo "（无改动，跳过提交）"
git tag -f "v${VER}" >/dev/null
echo "[3/8] 已提交并打 tag v${VER}"

# 4. 打包
git archive --format=zip -o "$ZIP" "v${VER}"
SHA=$(sha256sum "$ZIP" | cut -d' ' -f1)
echo "[4/8] 已打包 ${ZIP} (sha256 ${SHA:0:8}…)"

# 5. 推送（自动重试，最长约 10 分钟）
echo "[5/8] 推送中…"
OK=0
for i in $(seq 1 12); do
  echo "--- 第 $i 次尝试 ---"
  if git push origin main 2>&1 && git push origin "v${VER}" 2>&1; then OK=1; break; fi
  sleep 45
done
[ "$OK" = 1 ] || { echo "推送失败，已放弃（tag 与提交留在本地，可稍后手动 git push）"; exit 1; }

# 6. 建 Release（正文用 node 生成 JSON，规避 Git Bash 中文/反引号问题）
RELEASE_BODY_FILE="${CHANGELOG_FILE}"
[ -n "$RELEASE_BODY_FILE" ] && [ -f "$RELEASE_BODY_FILE" ] || { printf 'v%s（%s）\n\nsha256: %s\n' "$VER" "$TODAY" "$SHA" > "_rel_body.tmp"; RELEASE_BODY_FILE="_rel_body.tmp"; }
node -e "
  const fs = require('fs');
  const body = fs.readFileSync('${RELEASE_BODY_FILE}', 'utf8').trim()
    + \`\\n\\n**安装**：下载 hufenghuanyu-v${VER}.zip，在无名杀「扩展」页导入（勿解压）。\\n\\nsha256: ${SHA}\\n\`;
  fs.writeFileSync('_rel_payload.json', JSON.stringify({tag_name: 'v${VER}', name: 'v${VER}', body}));
"
RELEASE_ID=$(curl -s -H "Authorization: token $(printf 'protocol=https\nhost=github.com\n' | git credential fill | grep '^password=' | cut -d= -f2-)" \
  -H "Accept: application/vnd.github+json" \
  --data-binary @_rel_payload.json \
  https://api.github.com/repos/shibaiderman096/noname-extension-hufenghuanyu/releases \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.id||'FAIL:'+(j.message||s.slice(0,200)))})")
rm -f _rel_payload.json _rel_body.tmp _changelog.tmp
[ "$RELEASE_ID" != "${RELEASE_ID#FAIL:}" ] && { echo "建 Release 失败: $RELEASE_ID"; exit 1; }
echo "[6/8] Release 已创建 (id=${RELEASE_ID})"

# 7. 上传资产（重试 3 次）
echo "[7/8] 上传资产…"
ASSET_OK=0
for i in 1 2 3; do
  STATE=$(curl -s -H "Authorization: token $(printf 'protocol=https\nhost=github.com\n' | git credential fill | grep '^password=' | cut -d= -f2-)" \
    -H "Content-Type: application/zip" \
    --data-binary @"$ZIP" \
    "https://uploads.github.com/repos/shibaiderman096/noname-extension-hufenghuanyu/releases/${RELEASE_ID}/assets?name=hufenghuanyu-v${VER}.zip" \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.state||'FAIL:'+(j.message||''))})")
  if [ "$STATE" = "uploaded" ]; then ASSET_OK=1; break; fi
  sleep 20
done
[ "$ASSET_OK" = 1 ] || { echo "资产上传失败，Release 页面可手动补传：${ZIP}"; exit 1; }
echo "资产上传成功"

# 8. 清理本地 zip
rm -f "$ZIP"
echo "[8/8] 完成 ✔  https://github.com/shibaiderman096/noname-extension-hufenghuanyu/releases/tag/v${VER}"
