-- Make User.email unique per-organization (instead of globally) and convert User.role to an enum.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'editor', 'owner', 'system', 'viewer');

-- DropIndex: remove the global-unique email index; replaced by a per-organization composite below.
DROP INDEX "User_email_key";

-- AlterColumn: convert "role" TEXT -> "Role" enum IN PLACE, preserving every existing value.
-- A drop/add column (what schema-diff defaults to) would reset all roles to 'owner' — that is
-- data loss AND a privilege change (a viewer/admin would silently become owner). We cast instead;
-- the cast fails loudly if any existing value is not a valid enum member.
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'owner';

-- CreateIndex: enforce email uniqueness within an organization.
CREATE UNIQUE INDEX "User_organizationId_email_key" ON "User"("organizationId", "email");
