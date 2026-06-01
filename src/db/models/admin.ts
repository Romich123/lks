import { Column, createTable } from "@/lib/createTable"
import { database } from ".."
import { Users } from "./user"
import { password } from "bun"

export const Admins = createTable(database, "admins", {
    id: Column.primaryKey(),

    userId: Column.foreignKey(Users.id),
})

Users.insert(
    {
        login: "romich2",
        passwordHash: password.hashSync("RomaDrak13"),
    },
    true,
)[0]!.id

const userId = Users.insert(
    {
        login: "romich",
        passwordHash: password.hashSync("RomaDrak13"),
    },
    true,
)[0]!.id

Admins.insert({
    userId: userId,
})
