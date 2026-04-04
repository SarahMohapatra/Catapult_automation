import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const resetPasswordTool = tool(
  async ({ userId, newPassword }) => {
    await new Promise((r) => setTimeout(r, 600));
    return JSON.stringify({
      success: true,
      userId,
      action: "password_reset",
      message: `Password for user ${userId} has been reset successfully. Temporary password: ${newPassword}. User will be prompted to change on next login.`,
      timestamp: new Date().toISOString(),
    });
  },
  {
    name: "reset_password",
    description:
      "Resets the password for a given user account. Use this when a user is locked out or has forgotten their password.",
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
    const userId = `USR-${Math.floor(Math.random() * 90000) + 10000}`;
    return JSON.stringify({
      success: true,
      userId,
      action: "account_created",
      message: `Account created for ${name} (${email}). Role: ${role}. Department: ${department}. Welcome email sent. User ID: ${userId}.`,
      timestamp: new Date().toISOString(),
    });
  },
  {
    name: "create_account",
    description:
      "Creates a new user account in the system. Use when onboarding a new employee or contractor.",
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
    return JSON.stringify({
      success: true,
      action: "access_granted",
      message: `${accessLevel} access to ${resource} granted for user ${userId}. Changes propagate within 5 minutes.`,
      timestamp: new Date().toISOString(),
    });
  },
  {
    name: "grant_access",
    description:
      "Grants a user access to a specific resource, system, or repository.",
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
    return JSON.stringify({
      success: true,
      action: "mfa_configured",
      message: `MFA configured for user ${userId} using ${method}. QR code enrollment link sent to registered email. Valid for 24 hours.`,
      timestamp: new Date().toISOString(),
    });
  },
  {
    name: "setup_mfa",
    description: "Sets up or resets multi-factor authentication for a user.",
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