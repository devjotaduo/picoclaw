package tenant

import "github.com/sipeed/picoclaw/internal/saas/auth"

// passwordGen is indirected through this file so lifecycle.go does not need
// the auth package directly.
var passwordGen = auth.GeneratePassword
