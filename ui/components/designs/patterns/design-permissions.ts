import CAN from '@/utils/can';
import { keys } from '@/utils/permission_constants';

type UserLike = { id?: string } | null | undefined;
type DesignLike = { userId?: string } | null | undefined;

/**
 * canEditDesign is the single source of truth for the "can edit this design"
 * gate, shared by the card/grid view (MesheryPatternCard) and the table view
 * (MesheryPatterns) so the two can't drift apart.
 *
 * Model: a user may edit a design if they hold the global EDIT_DESIGN
 * permission, OR they own the design. The truthy `user?.id` guard stops an
 * unauthenticated user (no id) from matching an owner-less design via
 * `undefined === undefined`.
 *
 * Scope: this gates VISIBILITY of the edit affordance. Click-through is
 * additionally gated on CAN(EDIT_DESIGN) at each call site (`disabled={!CAN}`),
 * so an owner without the permission sees the affordance but it stays disabled.
 */
export const canEditDesign = (user: UserLike, design: DesignLike): boolean =>
  CAN(keys.EDIT_DESIGN.action, keys.EDIT_DESIGN.subject) ||
  (!!user?.id && user.id === design?.userId);
