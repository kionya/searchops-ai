import { PrismaClient } from "./generated/prisma/index.js";

export type SearchOpsPrismaClient = PrismaClient;

export function createSearchOpsPrismaClient(): SearchOpsPrismaClient {
  return new PrismaClient();
}
