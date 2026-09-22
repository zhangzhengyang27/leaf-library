/**
 * 拉三份音频真素材做基准（不入库：二进制进 git 会让仓库从几 MB 涨到 4MB+）。
 *
 *   LEAF_AUDIO_DIR=/tmp/leaf-audio-fixtures 时，ffmpegAudio 的测试会额外跑这三份；
 *   没有它们测试照常绿（合成轨已经锁死算法行为），真素材只是把"我对合成信号 optimism"
 *   压回去的那一层。
 *
 * 来源都是 Wikimedia Commons（文件名里就写着速度，正好当 ground truth）：
 *   50BPMclicktrack.ogg            点击轨，14.5s
 *   Sound_Classic_Metronome_96.ogg 节拍器，19.5s
 *   John Philip Sousa - The Thunderer (1889).ogg  美国海军陆战队军乐队实录，2:48
 *                                                     （quick-time march 惯例 120 步/分）
 * 许可见各文件页；这里只用于本地回归测试。
 */
set -euo pipefail
OUT="${1:-/tmp/leaf-audio-fixtures}"
mkdir -p "$OUT"
base=https://upload.wikimedia.org/wikipedia/commons
fetch() { # path  name
  [ -s "$OUT/$2" ] && { echo "已有 $2"; return; }
  curl -sSL --retry 2 -o "$OUT/$2" "$base/$1" -H 'User-Agent: leaf-dev/1.0'
  echo "取得 $2"
}
fetch /c/c3/50BPMclicktrack.ogg 50bpm-click.ogg
fetch /c/c6/Sound_Classic_Metronome_96.ogg metronome-96.ogg
fetch /8/8d/John_Philip_Sousa_-_The_Thunderer_%281889%29.ogg thunderer-march.ogg
ls -la "$OUT"
