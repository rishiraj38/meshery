/**
 * Constants for Identity & Access Management Keys
 *
 * All UUIDs and subject strings are resolved dynamically at runtime from
 * the schemas package. Do not hardcode UUIDs here.
 */

import { Keys } from '@meshery/schemas/permissions';

export type { PermissionKey } from '@meshery/schemas/permissions';

type UiPermissionKey = { action: string; subject: string };
type UiPermissionKeyMap = Record<keyof typeof Keys, UiPermissionKey>;

// Map the Keys to the action/subject shape for the UI
export const keys: UiPermissionKeyMap = Object.fromEntries(
  Object.entries(Keys).map(([name, keyObj]) => [
    name,
    {
      action: keyObj.id,
      subject: keyObj.function,
    },
  ]),
) as UiPermissionKeyMap;
