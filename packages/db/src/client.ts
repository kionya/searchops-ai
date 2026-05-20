import { PrismaClient } from "@prisma/client";

export type SearchOpsPrismaClient = PrismaClient;

export function createSearchOpsPrismaClient(): SearchOpsPrismaClient {
  return new PrismaClient();
}
