import type { Role } from '../app/admin/types';
export function canSeeMenu(role: Role | null, itemRoles: Role[]) {
if (!role) return false; return itemRoles.includes(role);
}