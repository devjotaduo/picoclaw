package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

var ErrAdminNotFound = errors.New("admin not found")

type Admin struct {
	ID         int64
	Email      string
	BcryptHash string
	CreatedAt  time.Time
	LastLogin  *time.Time
}

type AdminStore struct{ DB *DB }

func (s *AdminStore) Create(ctx context.Context, email, bcryptHash string) (*Admin, error) {
	const q = `
		INSERT INTO admins (email, bcrypt_hash)
		VALUES ($1, $2)
		ON CONFLICT (email) DO UPDATE SET bcrypt_hash = excluded.bcrypt_hash
		RETURNING id, email, bcrypt_hash, created_at, last_login`
	var a Admin
	if err := s.DB.Pool.QueryRow(ctx, q, email, bcryptHash).
		Scan(&a.ID, &a.Email, &a.BcryptHash, &a.CreatedAt, &a.LastLogin); err != nil {
		return nil, err
	}
	return &a, nil
}

func (s *AdminStore) GetByEmail(ctx context.Context, email string) (*Admin, error) {
	const q = `SELECT id, email, bcrypt_hash, created_at, last_login FROM admins WHERE email = $1`
	var a Admin
	if err := s.DB.Pool.QueryRow(ctx, q, email).
		Scan(&a.ID, &a.Email, &a.BcryptHash, &a.CreatedAt, &a.LastLogin); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAdminNotFound
		}
		return nil, err
	}
	return &a, nil
}

func (s *AdminStore) GetByID(ctx context.Context, id int64) (*Admin, error) {
	const q = `SELECT id, email, bcrypt_hash, created_at, last_login FROM admins WHERE id = $1`
	var a Admin
	if err := s.DB.Pool.QueryRow(ctx, q, id).
		Scan(&a.ID, &a.Email, &a.BcryptHash, &a.CreatedAt, &a.LastLogin); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAdminNotFound
		}
		return nil, err
	}
	return &a, nil
}

func (s *AdminStore) MarkLogin(ctx context.Context, id int64) error {
	const q = `UPDATE admins SET last_login = now() WHERE id = $1`
	_, err := s.DB.Pool.Exec(ctx, q, id)
	return err
}
