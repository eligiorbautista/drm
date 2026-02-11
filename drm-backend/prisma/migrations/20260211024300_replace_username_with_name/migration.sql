/*
  Warnings:

  - You are about to drop the column `username` on the `users` table. All the data in that column will be lost.
*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN IF EXISTS "username",
ADD COLUMN IF NOT EXISTS "name" TEXT;
