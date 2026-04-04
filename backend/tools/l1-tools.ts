import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

const CONFIG_FILE = path.join(process.cwd(), "demo/config.json");

function readConfig(): any {
  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
}

function writeConfig(config: any): void {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function findUser(
  config: any,
  userId: string
): { id: string; user: any } | null {
  if (config.users?.[userId]) {
    return { id: userId, user: config.users[userId] };
  }
  for (const [id, user] of Object.entries(config.users || {})) {
    if ((user as any).email === userId) {
      return { id, user };
    }
  }
  return null;
}

export const resetPasswordTool = tool(
  async ({ userId, newPassword }) => {
    await new Promise((r) => setTimeout(r, 600));
    try {
      const config = readConfig();
      const found = findUser(config, userId);
      if (!found) {
        return JSON.stringify({
          success: false,
          error: `User ${userId} not found in config`,
        });
      }

      const previouslyLocked = found.user.locked;
      config.users[found.id].locked = false;
      config.users[found.id].passwordHash = `hash_reset_${Date.now()}`;
      writeConfig(config);

      return JSON.stringify({
        success: true,
        userId: found.id,
        action: "password_reset",
        configModified: true,
        previouslyLocked,
        message: `Password for user ${found.id} (${found.user.name}) has been reset successfully. Account unlocked. Temporary password: ${newPassword}. User will be prompted to change on next login.`,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return JSON.stringify({ success: false, error: err.message });
    }
  },
  {
    name: "reset_password",
    description:
      "Resets the password for a given user account and unlocks it in config.json. Use this when a user is locked out or has forgotten their password.",
    schema: z.object({
      userId: z.string().describe("The unique ID or email of the user"),
      newPassword: z
        .string()
        .describe(
          "A temporary password to assign. Should be 12+ chars with mixed case and numbers."
        ),
    }),
  }
);

export const createAccountTool = tool(
  async ({ name, email, role, department }) => {
    await new Promise((r) => setTimeout(r, 800));
    try {
      const config = readConfig();
      const userId = `USR-${Math.floor(Math.random() * 90000) + 10000}`;

      if (!config.users) config.users = {};
      config.users[userId] = {
        name,
        email,
        locked: false,
        passwordHash: `hash_new_${Date.now()}`,
        mfaEnabled: false,
        mfaMethod: null,
        role,
        department,
        accessGrants: [],
      };
      writeConfig(config);

      return JSON.stringify({
        success: true,
        userId,
        action: "account_created",
        configModified: true,
        message: `Account created for ${name} (${email}). Role: ${role}. Department: ${department}. Welcome email sent. User ID: ${userId}. User record added to config.json.`,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return JSON.stringify({ success: false, error: err.message });
    }
  },
  {
    name: "create_account",
    description:
      "Creates a new user account in the system and writes the record to config.json. Use when onboarding a new employee or contractor.",
    schema: z.object({
      name: z.string().describe("Full name of the new user"),
      email: z.string().describe("Work email address"),
      role: z
        .string()
        .describe("Job role e.g. Engineer, Manager, Analyst, Contractor"),
      department: z.string().describe("Department name"),
    }),
  }
);

export const grantAccessTool = tool(
  async ({ userId, resource, accessLevel }) => {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const config = readConfig();
      const found = findUser(config, userId);
      if (!found) {
        return JSON.stringify({
          success: false,
          error: `User ${userId} not found in config`,
        });
      }

      if (!Array.isArray(config.users[found.id].accessGrants)) {
        config.users[found.id].accessGrants = [];
      }

      config.users[found.id].accessGrants.push({
        resource,
        level: accessLevel,
        grantedAt: new Date().toISOString(),
      });
      writeConfig(config);

      return JSON.stringify({
        success: true,
        action: "access_granted",
        configModified: true,
        message: `${accessLevel} access to ${resource} granted for user ${found.id} (${found.user.name}). Access record added to config.json. Changes propagate within 5 minutes.`,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return JSON.stringify({ success: false, error: err.message });
    }
  },
  {
    name: "grant_access",
    description:
      "Grants a user access to a specific resource, system, or repository. Updates the user's access grants in config.json.",
    schema: z.object({
      userId: z.string().describe("User ID or email"),
      resource: z
        .string()
        .describe("Name of the resource, system, or repo to grant access to"),
      accessLevel: z
        .enum(["read", "write", "admin"])
        .describe("Access level to grant"),
    }),
  }
);

export const setupMfaTool = tool(
  async ({ userId, method }) => {
    await new Promise((r) => setTimeout(r, 700));
    try {
      const config = readConfig();
      const found = findUser(config, userId);
      if (!found) {
        return JSON.stringify({
          success: false,
          error: `User ${userId} not found in config`,
        });
      }

      config.users[found.id].mfaEnabled = true;
      config.users[found.id].mfaMethod = method;
      writeConfig(config);

      return JSON.stringify({
        success: true,
        action: "mfa_configured",
        configModified: true,
        message: `MFA configured for user ${found.id} (${found.user.name}) using ${method}. Config.json updated. QR code enrollment link sent to registered email. Valid for 24 hours.`,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return JSON.stringify({ success: false, error: err.message });
    }
  },
  {
    name: "setup_mfa",
    description:
      "Sets up or resets multi-factor authentication for a user. Updates the user's MFA settings in config.json.",
    schema: z.object({
      userId: z.string().describe("User ID or email"),
      method: z
        .enum(["authenticator_app", "sms", "email"])
        .describe("MFA method to configure"),
    }),
  }
);

export const l1Tools = [
  resetPasswordTool,
  createAccountTool,
  grantAccessTool,
  setupMfaTool,
];
