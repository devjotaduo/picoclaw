package gatewayauth

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	HeaderTenant    = "X-Picoclaw-Gateway-Tenant"
	HeaderUserID    = "X-Picoclaw-Gateway-User"
	HeaderUserEmail = "X-Picoclaw-Gateway-Email"
	HeaderRole      = "X-Picoclaw-Gateway-Role"
	HeaderTimestamp = "X-Picoclaw-Gateway-Timestamp"
	HeaderSignature = "X-Picoclaw-Gateway-Signature"
)

type Claims struct {
	TenantID  string
	UserID    string
	UserEmail string
	Role      string
}

func Sign(secret, method, requestURI, tenantID, userID, userEmail, role string, ts int64) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(strings.ToUpper(method)))
	_, _ = mac.Write([]byte("\n"))
	_, _ = mac.Write([]byte(requestURI))
	_, _ = mac.Write([]byte("\n"))
	_, _ = mac.Write([]byte(tenantID))
	_, _ = mac.Write([]byte("\n"))
	_, _ = mac.Write([]byte(userID))
	_, _ = mac.Write([]byte("\n"))
	_, _ = mac.Write([]byte(userEmail))
	_, _ = mac.Write([]byte("\n"))
	_, _ = mac.Write([]byte(role))
	_, _ = mac.Write([]byte("\n"))
	_, _ = mac.Write([]byte(strconv.FormatInt(ts, 10)))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func AnnotateRequest(r *http.Request, secret string, claims Claims, now time.Time) {
	ts := now.Unix()
	r.Header.Del(HeaderTenant)
	r.Header.Del(HeaderUserID)
	r.Header.Del(HeaderUserEmail)
	r.Header.Del(HeaderRole)
	r.Header.Del(HeaderTimestamp)
	r.Header.Del(HeaderSignature)
	r.Header.Set(HeaderTenant, claims.TenantID)
	r.Header.Set(HeaderUserID, claims.UserID)
	r.Header.Set(HeaderUserEmail, claims.UserEmail)
	r.Header.Set(HeaderRole, claims.Role)
	r.Header.Set(HeaderTimestamp, strconv.FormatInt(ts, 10))
	r.Header.Set(HeaderSignature, Sign(secret, r.Method, r.URL.RequestURI(), claims.TenantID, claims.UserID, claims.UserEmail, claims.Role, ts))
}

func VerifyRequest(r *http.Request, secret string, maxSkew time.Duration, now time.Time) (Claims, error) {
	if strings.TrimSpace(secret) == "" {
		return Claims{}, fmt.Errorf("trusted gateway secret is empty")
	}
	tsRaw := r.Header.Get(HeaderTimestamp)
	ts, err := strconv.ParseInt(tsRaw, 10, 64)
	if err != nil {
		return Claims{}, fmt.Errorf("invalid gateway timestamp")
	}
	t := time.Unix(ts, 0)
	if t.Before(now.Add(-maxSkew)) || t.After(now.Add(maxSkew)) {
		return Claims{}, fmt.Errorf("gateway timestamp outside allowed skew")
	}
	claims := Claims{
		TenantID:  r.Header.Get(HeaderTenant),
		UserID:    r.Header.Get(HeaderUserID),
		UserEmail: r.Header.Get(HeaderUserEmail),
		Role:      r.Header.Get(HeaderRole),
	}
	want := Sign(secret, r.Method, r.URL.RequestURI(), claims.TenantID, claims.UserID, claims.UserEmail, claims.Role, ts)
	got := r.Header.Get(HeaderSignature)
	if subtle.ConstantTimeCompare([]byte(got), []byte(want)) != 1 {
		return Claims{}, fmt.Errorf("invalid gateway signature")
	}
	if claims.TenantID == "" || claims.UserID == "" || claims.Role == "" {
		return Claims{}, fmt.Errorf("missing gateway claims")
	}
	return claims, nil
}
