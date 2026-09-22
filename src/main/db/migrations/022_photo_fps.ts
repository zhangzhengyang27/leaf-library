import type Database from 'better-sqlite3'
import type { Migration } from '.'

/**
 * 022: 视频实测帧率（P1·逐帧步进按真实 fps 挪时间）。
 *
 * 此前逐帧硬编码 1/30s：24fps 素材一次跳 1.25 帧、60fps 一次跳半帧，
 * 「前进一帧」名不副实。fps 由 ffmpeg 探测时长那次调用顺手解析
 * （同一次 `ffmpeg -i` 的 stderr，不额外起进程）。
 *
 * REAL 而不是有理数分子/分母：ffmpeg 打印的就是四舍五入到两位小数的
 * `23.98 fps`（真值 24000/1001），单帧步进的误差在毫秒级，够用。
 * NULL = 没探到（音频/图片/旧数据/探测失败），渲染层据此回落 30。
 */
export const m022_photo_fps: Migration = {
  version: 22,
  name: 'photo_fps',
  up(db: Database.Database) {
    db.exec(`
      ALTER TABLE photo_photos ADD COLUMN fps REAL;
    `)
  }
}
