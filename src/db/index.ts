import Database from "better-sqlite3"

export const database = new Database("lks.fb.sqlite")
database.pragma("foreign_keys = ON")
