package inbox

const (
	// DBFilename is the SQLite database storing WhatsApp inbox state
	// (chats + messages observed by the launcher).
	DBFilename = "conversations.db"

	sqliteDriver = "sqlite"

	sqlCreateSchema = `
CREATE TABLE IF NOT EXISTS wa_chats (
	jid              TEXT PRIMARY KEY,
	push_name        TEXT,
	display_name     TEXT,
	avatar_url       TEXT,
	avatar_id        TEXT,
	last_message_ts  INTEGER NOT NULL DEFAULT 0,
	last_preview     TEXT,
	last_direction   TEXT,
	paused           INTEGER NOT NULL DEFAULT 0,
	unread_count     INTEGER NOT NULL DEFAULT 0,
	updated_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wa_chats_last_message_ts
	ON wa_chats(last_message_ts DESC);

CREATE TABLE IF NOT EXISTS wa_messages (
	id           INTEGER PRIMARY KEY AUTOINCREMENT,
	message_id   TEXT,
	chat_jid     TEXT NOT NULL,
	sender_jid   TEXT,
	direction    TEXT NOT NULL,
	source       TEXT NOT NULL,
	content      TEXT NOT NULL,
	ts           INTEGER NOT NULL,
	delivered    INTEGER NOT NULL DEFAULT 0,
	error        TEXT,
	FOREIGN KEY (chat_jid) REFERENCES wa_chats(jid)
);

CREATE INDEX IF NOT EXISTS idx_wa_messages_chat_ts
	ON wa_messages(chat_jid, ts DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_messages_chat_message_id
	ON wa_messages(chat_jid, message_id)
	WHERE message_id IS NOT NULL AND message_id <> '';
`

	sqlUpsertChat = `
INSERT INTO wa_chats (jid, push_name, display_name, last_message_ts, last_preview, last_direction, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(jid) DO UPDATE SET
	push_name       = COALESCE(NULLIF(excluded.push_name, ''), wa_chats.push_name),
	display_name    = COALESCE(NULLIF(excluded.display_name, ''), wa_chats.display_name),
	last_message_ts = CASE WHEN excluded.last_message_ts > wa_chats.last_message_ts
	                       THEN excluded.last_message_ts ELSE wa_chats.last_message_ts END,
	last_preview    = CASE WHEN excluded.last_message_ts > wa_chats.last_message_ts
	                       THEN excluded.last_preview ELSE wa_chats.last_preview END,
	last_direction  = CASE WHEN excluded.last_message_ts > wa_chats.last_message_ts
	                       THEN excluded.last_direction ELSE wa_chats.last_direction END,
	updated_at      = excluded.updated_at
;`

	sqlInsertMessage = `
INSERT OR IGNORE INTO wa_messages (message_id, chat_jid, sender_jid, direction, source, content, ts, delivered, error)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`

	sqlIncrementUnread = `
UPDATE wa_chats SET unread_count = unread_count + 1 WHERE jid = ?;`

	sqlResetUnread = `
UPDATE wa_chats SET unread_count = 0 WHERE jid = ?;`

	sqlSetPaused = `
UPDATE wa_chats SET paused = ?, updated_at = ? WHERE jid = ?;`

	sqlSetAvatar = `
UPDATE wa_chats SET avatar_url = ?, avatar_id = ?, updated_at = ? WHERE jid = ?;`

	sqlListChats = `
SELECT jid, push_name, display_name, avatar_url, avatar_id, last_message_ts,
       last_preview, last_direction, paused, unread_count, updated_at
FROM wa_chats
ORDER BY last_message_ts DESC, updated_at DESC
LIMIT ?;`

	sqlGetChat = `
SELECT jid, push_name, display_name, avatar_url, avatar_id, last_message_ts,
       last_preview, last_direction, paused, unread_count, updated_at
FROM wa_chats WHERE jid = ?;`

	sqlIsPaused = `
SELECT paused FROM wa_chats WHERE jid = ?;`

	sqlListMessages = `
SELECT id, message_id, chat_jid, sender_jid, direction, source, content, ts, delivered, error
FROM wa_messages
WHERE chat_jid = ?
ORDER BY ts DESC, id DESC
LIMIT ?;`
)
