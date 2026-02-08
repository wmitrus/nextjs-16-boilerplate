'use server';

import { z } from 'zod';

import { createSecureAction } from '@/security/actions/secure-action';

const updateSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  notificationsEnabled: z.boolean(),
  marketingConsent: z.boolean(),
});

/**
 * Example of a Secure Server Action.
 * Demonstrates: Zod validation, Auth requirement, Mutation Logging, and Replay Protection.
 */
export const updateSecuritySettings = createSecureAction({
  schema: updateSettingsSchema,
  role: 'user', // Available to any authenticated user
  handler: async ({ context }) => {
    // In a real app, you would save to the database here
    // e.g., await db.user.update({ where: { id: context.user.id }, data: input });

    return {
      message: 'Settings updated successfully',
      updatedAt: new Date().toISOString(),
      user: context.user?.id,
    };
  },
});
