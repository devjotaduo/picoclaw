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

CREATE TABLE IF NOT EXISTS wa_contact_profiles (
	chat_jid        TEXT PRIMARY KEY,
	phone           TEXT,
	push_name       TEXT,
	display_name    TEXT,
	name            TEXT,
	city            TEXT,
	company         TEXT,
	interest        TEXT,
	preferences     TEXT,
	summary         TEXT,
	lead_stage      TEXT NOT NULL DEFAULT 'novo',
	lead_score      INTEGER NOT NULL DEFAULT 0,
	priority        TEXT NOT NULL DEFAULT 'low',
	intent          TEXT,
	consent_status  TEXT NOT NULL DEFAULT 'unknown',
	tags_json       TEXT NOT NULL DEFAULT '[]',
	assigned_to     TEXT,
	next_action     TEXT,
	follow_up_at    INTEGER NOT NULL DEFAULT 0,
	follow_up_reason TEXT,
	created_at      INTEGER NOT NULL,
	updated_at      INTEGER NOT NULL,
	FOREIGN KEY (chat_jid) REFERENCES wa_chats(jid)
);

CREATE INDEX IF NOT EXISTS idx_wa_contact_profiles_updated
	ON wa_contact_profiles(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_contact_profiles_stage
	ON wa_contact_profiles(lead_stage, updated_at DESC);

CREATE TABLE IF NOT EXISTS wa_conversation_insights (
	chat_jid              TEXT PRIMARY KEY,
	intent                TEXT,
	priority              TEXT NOT NULL DEFAULT 'low',
	lead_stage            TEXT NOT NULL DEFAULT 'novo',
	needs_handoff         INTEGER NOT NULL DEFAULT 0,
	unanswered            INTEGER NOT NULL DEFAULT 0,
	target_sector         TEXT,
	summary               TEXT,
	next_action           TEXT,
	collected_fields_json TEXT NOT NULL DEFAULT '{}',
	missing_fields_json   TEXT NOT NULL DEFAULT '[]',
	products_json         TEXT NOT NULL DEFAULT '[]',
	last_message_ts        INTEGER NOT NULL DEFAULT 0,
	updated_at            INTEGER NOT NULL,
	FOREIGN KEY (chat_jid) REFERENCES wa_chats(jid)
);

CREATE INDEX IF NOT EXISTS idx_wa_conversation_insights_intent
	ON wa_conversation_insights(intent, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_conversation_insights_priority
	ON wa_conversation_insights(priority, updated_at DESC);

CREATE TABLE IF NOT EXISTS wa_product_mentions (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	chat_jid    TEXT NOT NULL,
	product     TEXT NOT NULL,
	quantity    TEXT,
	price_text  TEXT,
	objection   TEXT,
	ts          INTEGER NOT NULL,
	created_at  INTEGER NOT NULL,
	FOREIGN KEY (chat_jid) REFERENCES wa_chats(jid)
);

CREATE INDEX IF NOT EXISTS idx_wa_product_mentions_product
	ON wa_product_mentions(product, ts DESC);

CREATE INDEX IF NOT EXISTS idx_wa_product_mentions_chat_ts
	ON wa_product_mentions(chat_jid, ts DESC);

CREATE TABLE IF NOT EXISTS wa_internal_notes (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	chat_jid   TEXT NOT NULL,
	content    TEXT NOT NULL,
	author     TEXT NOT NULL,
	ts         INTEGER NOT NULL,
	FOREIGN KEY (chat_jid) REFERENCES wa_chats(jid)
);

CREATE INDEX IF NOT EXISTS idx_wa_internal_notes_chat_ts
	ON wa_internal_notes(chat_jid, ts DESC);

INSERT OR IGNORE INTO wa_contact_profiles (
	chat_jid, push_name, display_name, created_at, updated_at
)
SELECT jid, push_name, display_name,
	CASE WHEN last_message_ts > 0 THEN last_message_ts ELSE updated_at END,
	updated_at
FROM wa_chats;

INSERT OR IGNORE INTO wa_conversation_insights (
	chat_jid, last_message_ts, updated_at
)
SELECT jid, last_message_ts, updated_at
FROM wa_chats;
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

	// Marks a chat as unread on the dashboard. The contact sees no change —
	// this is dashboard-local state, used by the operator to "snooze" a chat
	// they read but want to revisit. We set to MAX(1, unread_count) so a
	// chat with real unread bumps doesn't get clobbered.
	sqlMarkChatUnread = `
UPDATE wa_chats SET unread_count = MAX(1, unread_count) WHERE jid = ?;`

	sqlInsertInternalNote = `
INSERT INTO wa_internal_notes (chat_jid, content, author, ts)
VALUES (?, ?, ?, ?);`

	sqlListInternalNotes = `
SELECT id, chat_jid, content, author, ts
FROM wa_internal_notes
WHERE chat_jid = ?
ORDER BY ts DESC, id DESC
LIMIT ?;`

	sqlDeleteInternalNote = `
DELETE FROM wa_internal_notes WHERE id = ? AND chat_jid = ?;`

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

	sqlUpsertContactProfileBasic = `
INSERT INTO wa_contact_profiles (
	chat_jid, phone, push_name, display_name, created_at, updated_at
)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(chat_jid) DO UPDATE SET
	phone        = COALESCE(NULLIF(excluded.phone, ''), wa_contact_profiles.phone),
	push_name    = COALESCE(NULLIF(excluded.push_name, ''), wa_contact_profiles.push_name),
	display_name = COALESCE(NULLIF(excluded.display_name, ''), wa_contact_profiles.display_name),
	updated_at   = excluded.updated_at
;`

	sqlGetContactProfile = `
SELECT chat_jid, phone, push_name, display_name, name, city, company, interest,
       preferences, summary, lead_stage, lead_score, priority, intent,
       consent_status, tags_json, assigned_to, next_action, follow_up_at,
       follow_up_reason, created_at, updated_at
FROM wa_contact_profiles
WHERE chat_jid = ?;`

	sqlUpsertContactProfileManual = `
INSERT INTO wa_contact_profiles (
	chat_jid, phone, push_name, display_name, name, city, company, interest,
	preferences, summary, lead_stage, lead_score, priority, intent,
	consent_status, tags_json, assigned_to, next_action, follow_up_at,
	follow_up_reason, created_at, updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(chat_jid) DO UPDATE SET
	phone            = excluded.phone,
	push_name        = excluded.push_name,
	display_name     = excluded.display_name,
	name             = excluded.name,
	city             = excluded.city,
	company          = excluded.company,
	interest         = excluded.interest,
	preferences      = excluded.preferences,
	summary          = excluded.summary,
	lead_stage       = excluded.lead_stage,
	lead_score       = excluded.lead_score,
	priority         = excluded.priority,
	intent           = excluded.intent,
	consent_status   = excluded.consent_status,
	tags_json        = excluded.tags_json,
	assigned_to      = excluded.assigned_to,
	next_action      = excluded.next_action,
	follow_up_at     = excluded.follow_up_at,
	follow_up_reason = excluded.follow_up_reason,
	updated_at       = excluded.updated_at
;`

	sqlApplyContactProfileExtraction = `
UPDATE wa_contact_profiles SET
	name           = COALESCE(NULLIF(?, ''), name),
	city           = COALESCE(NULLIF(?, ''), city),
	company        = COALESCE(NULLIF(?, ''), company),
	interest       = COALESCE(NULLIF(?, ''), interest),
	preferences    = COALESCE(NULLIF(?, ''), preferences),
	summary        = COALESCE(NULLIF(?, ''), summary),
	lead_stage     = CASE WHEN ? <> '' THEN ? ELSE lead_stage END,
	lead_score     = MAX(lead_score, ?),
	priority       = CASE
		WHEN ? = 'high' OR priority = 'high' THEN 'high'
		WHEN ? = 'medium' OR priority = 'medium' THEN 'medium'
		WHEN ? <> '' THEN ?
		ELSE priority
	END,
	intent         = COALESCE(NULLIF(?, ''), intent),
	consent_status = CASE WHEN ? <> '' THEN ? ELSE consent_status END,
	tags_json      = CASE WHEN ? <> '[]' THEN ? ELSE tags_json END,
	next_action    = COALESCE(NULLIF(?, ''), next_action),
	updated_at     = ?
WHERE chat_jid = ?;`

	sqlGetConversationInsight = `
SELECT chat_jid, intent, priority, lead_stage, needs_handoff, unanswered,
       target_sector, summary, next_action, collected_fields_json,
       missing_fields_json, products_json, last_message_ts, updated_at
FROM wa_conversation_insights
WHERE chat_jid = ?;`

	sqlUpsertConversationInsight = `
INSERT INTO wa_conversation_insights (
	chat_jid, intent, priority, lead_stage, needs_handoff, unanswered,
	target_sector, summary, next_action, collected_fields_json,
	missing_fields_json, products_json, last_message_ts, updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(chat_jid) DO UPDATE SET
	intent                = COALESCE(NULLIF(excluded.intent, ''), wa_conversation_insights.intent),
	priority              = CASE
		WHEN excluded.priority = 'high' OR wa_conversation_insights.priority = 'high' THEN 'high'
		WHEN excluded.priority = 'medium' OR wa_conversation_insights.priority = 'medium' THEN 'medium'
		ELSE COALESCE(NULLIF(excluded.priority, ''), wa_conversation_insights.priority)
	END,
	lead_stage            = COALESCE(NULLIF(excluded.lead_stage, ''), wa_conversation_insights.lead_stage),
	needs_handoff         = CASE WHEN excluded.needs_handoff = 1 THEN 1 ELSE wa_conversation_insights.needs_handoff END,
	unanswered            = excluded.unanswered,
	target_sector         = COALESCE(NULLIF(excluded.target_sector, ''), wa_conversation_insights.target_sector),
	summary               = COALESCE(NULLIF(excluded.summary, ''), wa_conversation_insights.summary),
	next_action           = COALESCE(NULLIF(excluded.next_action, ''), wa_conversation_insights.next_action),
	collected_fields_json = CASE WHEN excluded.collected_fields_json <> '{}' THEN excluded.collected_fields_json ELSE wa_conversation_insights.collected_fields_json END,
	missing_fields_json   = CASE WHEN excluded.missing_fields_json <> '[]' THEN excluded.missing_fields_json ELSE wa_conversation_insights.missing_fields_json END,
	products_json         = CASE WHEN excluded.products_json <> '[]' THEN excluded.products_json ELSE wa_conversation_insights.products_json END,
	last_message_ts        = CASE WHEN excluded.last_message_ts > wa_conversation_insights.last_message_ts THEN excluded.last_message_ts ELSE wa_conversation_insights.last_message_ts END,
	updated_at            = excluded.updated_at
;`

	sqlInsertProductMention = `
INSERT INTO wa_product_mentions (chat_jid, product, quantity, price_text, objection, ts, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?);`
)
