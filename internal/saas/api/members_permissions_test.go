package api

import (
	"testing"

	"github.com/sipeed/picoclaw/internal/saas/store"
)

func TestCanAssignTenantRole(t *testing.T) {
	if canAssignTenantRole(store.RoleTenantAdmin, store.RoleTenantOwner) {
		t.Fatal("tenant_admin must not assign tenant_owner role")
	}
	if !canAssignTenantRole(store.RoleTenantOwner, store.RoleTenantOwner) {
		t.Fatal("tenant_owner should assign tenant_owner role")
	}
	if !canAssignTenantRole(store.RoleTenantAdmin, store.RoleOperator) {
		t.Fatal("tenant_admin should assign non-owner roles")
	}
}

func TestCanChangeMemberRole(t *testing.T) {
	if canChangeMemberRole(store.RoleTenantAdmin, store.RoleTenantOwner, store.RoleTenantAdmin) {
		t.Fatal("tenant_admin must not demote tenant_owner")
	}
	if canChangeMemberRole(store.RoleTenantOwner, store.RoleTenantOwner, store.RoleTenantAdmin) {
		t.Fatal("tenant_owner demotion flow is blocked by API to prevent accidental owner loss")
	}
	if !canChangeMemberRole(store.RoleTenantAdmin, store.RoleOperator, store.RoleViewer) {
		t.Fatal("tenant_admin should change non-owner roles")
	}
	if !canChangeMemberRole(store.RoleTenantOwner, store.RoleTenantOwner, store.RoleTenantOwner) {
		t.Fatal("owner should keep existing owner role unchanged")
	}
}

func TestCanRemoveMember(t *testing.T) {
	if canRemoveMember(store.RoleTenantAdmin, store.RoleTenantOwner) {
		t.Fatal("tenant_admin must not remove tenant_owner")
	}
	if !canRemoveMember(store.RoleTenantOwner, store.RoleTenantOwner) {
		t.Fatal("tenant_owner should remove another tenant_owner (unless last owner)")
	}
	if !canRemoveMember(store.RoleTenantAdmin, store.RoleOperator) {
		t.Fatal("tenant_admin should remove non-owner roles")
	}
}

func TestOwnerCount(t *testing.T) {
	members := []store.TenantMembership{
		{UserID: 1, Role: store.RoleTenantOwner},
		{UserID: 2, Role: store.RoleTenantAdmin},
		{UserID: 3, Role: store.RoleTenantOwner},
	}
	if got := ownerCount(members); got != 2 {
		t.Fatalf("ownerCount() = %d, want 2", got)
	}
}
