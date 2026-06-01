import { Database } from "bun:sqlite"

export const database = new Database("lks.fb.sqlite", { strict: true, create: true })
