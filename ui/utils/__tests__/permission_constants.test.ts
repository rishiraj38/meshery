import { describe, expect, it, afterEach } from 'vitest';
import { Keys } from '@meshery/schemas/permissions';
import { Keys as ReExportedKeys } from '../permission_constants';
import CAN, { ability } from '../can';

describe('permission_constants re-export and CASL capability tests', () => {
  afterEach(() => {
    // Reset ability to avoid leaking state into other test files
    ability.update([]);
  });

  it('should re-export Keys correctly', () => {
    expect(ReExportedKeys).toBe(Keys);
    expect(ReExportedKeys.AccountManagementViewProfile).toBeDefined();
  });

  it('should verify CASL CAN capability with active abilities', () => {
    // Initialize ability with specific permissions using direct schema Keys
    ability.update([
      {
        action: Keys.AccountManagementViewProfile.id,
        subject: 'view profile',
      },
    ]);

    // Check CAN check with schema Keys
    expect(
      CAN(Keys.AccountManagementViewProfile.id, Keys.AccountManagementViewProfile.function),
    ).toBe(true);

    // Check CAN check with a key the user doesn't have
    expect(
      CAN(Keys.AccountManagementEditAccount.id, Keys.AccountManagementEditAccount.function),
    ).toBe(false);
  });
});
