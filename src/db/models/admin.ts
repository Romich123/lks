import { Column, createTable } from "@/lib/createTable"
import { database } from ".."
import { Users } from "./user"

export const Admins = createTable(database, "admins", {
    id: Column.primaryKey(),

    userId: Column.foreignKey(Users.id),
})
