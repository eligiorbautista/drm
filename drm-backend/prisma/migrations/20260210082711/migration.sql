/*
  Warnings:

  - You are about to drop the column `userId` on the `broadcast_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `license_requests` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `settings` table. All the data in the column will be lost.
  - The `valueType` column on the `settings` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `audit_logs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `sessions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `users` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[key]` on the table `settings` will be added. If there are existing duplicate values, this will fail.
  - Made the column `category` on table `settings` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_userId_fkey";

-- DropForeignKey
ALTER TABLE "broadcast_sessions" DROP CONSTRAINT "broadcast_sessions_userId_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_userId_fkey";

-- DropForeignKey
ALTER TABLE "settings" DROP CONSTRAINT "settings_userId_fkey";

-- DropIndex
DROP INDEX "broadcast_sessions_userId_idx";

-- DropIndex
DROP INDEX "license_requests_userId_idx";

-- DropIndex
DROP INDEX "settings_userId_category_key_key";

-- DropIndex
DROP INDEX "settings_userId_key_key";

-- AlterTable
ALTER TABLE "broadcast_sessions" DROP COLUMN "userId";

-- AlterTable
ALTER TABLE "license_requests" DROP COLUMN "userId";

-- AlterTable
ALTER TABLE "settings" DROP COLUMN "userId",
DROP COLUMN "valueType",
ADD COLUMN     "valueType" TEXT NOT NULL DEFAULT 'STRING',
ALTER COLUMN "category" SET NOT NULL,
ALTER COLUMN "category" SET DEFAULT 'general';

-- DropTable
DROP TABLE "audit_logs";

-- DropTable
DROP TABLE "sessions";

-- DropTable
DROP TABLE "users";

-- DropEnum
DROP TYPE "AuditAction";

-- DropEnum
DROP TYPE "Role";

-- DropEnum
DROP TYPE "ValueType";

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");
