package dashboardauth

const (
	// DBFilename is the SQLite database file stored under the PicoClaw home directory.
	DBFilename = "launcher-auth.db"

	sqliteDriver = "sqlite"
	// bcryptCost is deliberately high enough to slow brute-force attempts.
	bcryptCost = 12

	sqlCreateTable = `
		CREATE TABLE IF NOT EXISTS dashboard_credentials (
			id          INTEGER PRIMARY KEY CHECK (id = 1),
			owner_email TEXT    NOT NULL DEFAULT '',
			bcrypt_hash TEXT    NOT NULL
		)`

	sqlAddOwnerEmailColumn = `ALTER TABLE dashboard_credentials ADD COLUMN owner_email TEXT NOT NULL DEFAULT ''`

	sqlCountCredentials = `SELECT COUNT(*) FROM dashboard_credentials WHERE id = 1`

	sqlUpsertHash = `
		INSERT INTO dashboard_credentials (id, bcrypt_hash) VALUES (1, ?)
		ON CONFLICT(id) DO UPDATE SET bcrypt_hash = excluded.bcrypt_hash`

	sqlUpsertCredentials = `
		INSERT INTO dashboard_credentials (id, owner_email, bcrypt_hash) VALUES (1, ?, ?)
		ON CONFLICT(id) DO UPDATE SET owner_email = excluded.owner_email, bcrypt_hash = excluded.bcrypt_hash`

	sqlSelectCredentials = `SELECT owner_email, bcrypt_hash FROM dashboard_credentials WHERE id = 1`
	sqlSelectHash        = `SELECT bcrypt_hash FROM dashboard_credentials WHERE id = 1`
)
