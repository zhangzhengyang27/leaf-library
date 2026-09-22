import type Database from 'better-sqlite3'
import type { Migration } from '.'

/**
 * 001: Leaf 素材库 · 独立版初始化
 *
 * 独立项目从工具箱（electron-tools）拆出，schema 取自共享链 001→017 演进后的
 * **最终累计状态**（photo 全家桶 + 偏好表），一次性建齐：
 * - photo_photos（含 kind/duration_ms/folder_id/source_url/phash/主色/缩略图状态/EXIF/GPS）
 * - tag_tags（软删除 + 活动名部分唯一索引）/ photo_tags
 * - photo_albums + photo_album_items（手动相册）/ photo_smart_albums（规则收藏夹）
 * - photo_folders（文件夹分组，parent_id 预留层级）
 * - photo_embeddings（CLIP 语义向量）
 * - geo_cache（Nominatim 反地理编码缓存）
 * - pref_preferences（偏好/密码锁密文）
 * - meta（迁移版本表，本文件 version = 1）
 */
export const m001_library_init: Migration = {
  version: 1,
  name: 'library_init',
  up(db: Database.Database) {
    // ── 素材主表 ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS photo_photos (
        id              TEXT PRIMARY KEY,
        file_path       TEXT    NOT NULL,
        file_name       TEXT    NOT NULL,
        file_size       INTEGER NOT NULL DEFAULT 0,
        width           INTEGER,
        height          INTEGER,
        mime_type       TEXT,
        taken_at        INTEGER,
        imported_at     INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        hash            TEXT,
        is_favorite     INTEGER NOT NULL DEFAULT 0,
        rating          INTEGER NOT NULL DEFAULT 0,
        description     TEXT,
        camera_model    TEXT,
        lens_model      TEXT,
        iso             INTEGER,
        aperture        REAL,
        shutter         TEXT,
        focal_length    REAL,
        latitude        REAL,
        longitude       REAL,
        deleted_at      INTEGER,
        phash           TEXT,
        color_dominant  TEXT,
        thumb_status    INTEGER NOT NULL DEFAULT 0,
        source          TEXT    NOT NULL DEFAULT 'manual',
        kind            TEXT    NOT NULL DEFAULT 'image',
        duration_ms     INTEGER,
        folder_id       TEXT,
        source_url      TEXT
      )
    `)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_photo_photos_imported_at_desc ON photo_photos(imported_at DESC)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_photo_photos_taken_at_desc    ON photo_photos(taken_at DESC)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_photo_photos_hash            ON photo_photos(hash)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_photo_photos_favorite        ON photo_photos(is_favorite)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_photo_photos_thumb_status    ON photo_photos(thumb_status)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_photo_photos_kind            ON photo_photos(kind)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_photo_photos_folder          ON photo_photos(folder_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_photo_photos_source_url      ON photo_photos(source_url)`)

    // ── 标签字典（软删除 + 活动名唯一） ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS tag_tags (
        id          TEXT PRIMARY KEY,
        name        TEXT    NOT NULL,
        color       TEXT,
        icon        TEXT,
        parent_id   TEXT,
        description TEXT,
        usage_count INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        deleted_at  INTEGER
      )
    `)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tag_tags_name   ON tag_tags(name)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tag_tags_parent ON tag_tags(parent_id)`)
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_tags_unique_name_active
      ON tag_tags(name) WHERE deleted_at IS NULL
    `)

    // ── 素材 ↔ 标签 ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS photo_tags (
        photo_id   TEXT    NOT NULL,
        tag_id     TEXT    NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (photo_id, tag_id)
      )
    `)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_photo_tags_tag ON photo_tags(tag_id)`)

    // ── 手动相册 ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS photo_albums (
        id          TEXT PRIMARY KEY,
        name        TEXT    NOT NULL,
        cover_id    TEXT,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0
      )
    `)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_photo_albums_sort ON photo_albums(sort_order)`)
    db.exec(`
      CREATE TABLE IF NOT EXISTS photo_album_items (
        album_id   TEXT    NOT NULL,
        photo_id   TEXT    NOT NULL,
        added_at   INTEGER NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (album_id, photo_id)
      )
    `)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_photo_album_items_album ON photo_album_items(album_id, sort_order)`)

    // ── 智能收藏夹（条件即相册） ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS photo_smart_albums (
        id         TEXT PRIMARY KEY,
        name       TEXT    NOT NULL,
        rules_json TEXT    NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      )
    `)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_photo_smart_albums_sort ON photo_smart_albums(sort_order)`)

    // ── 文件夹分组（层级预留） ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS photo_folders (
        id         TEXT PRIMARY KEY,
        name       TEXT    NOT NULL,
        parent_id  TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_photo_folders_parent ON photo_folders(parent_id, sort_order)`)

    // ── CLIP 语义向量 ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS photo_embeddings (
        photo_id     TEXT    PRIMARY KEY,
        model        TEXT    NOT NULL,
        dim          INTEGER NOT NULL,
        embedding    BLOB    NOT NULL,
        created_at   INTEGER NOT NULL
      )
    `)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_photo_embeddings_model ON photo_embeddings(model, dim)`)

    // ── 反地理编码缓存 ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS geo_cache (
        key          TEXT PRIMARY KEY,
        city         TEXT,
        display_name TEXT,
        cached_at    INTEGER NOT NULL
      )
    `)

    // ── 偏好（含密码锁密文） ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS pref_preferences (
        key        TEXT PRIMARY KEY,
        value      TEXT    NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)
  }
}
