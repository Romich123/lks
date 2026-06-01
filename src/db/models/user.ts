import { Column, createTable, ReadyBlueprintToInstance } from "@/lib/createTable"
import { database } from ".."

export const Users = createTable(database, "users", {
    id: Column.primaryKey(),

    login: { type: "TEXT" },
    passwordHash: { type: "TEXT" },
})

export type User = ReadyBlueprintToInstance<typeof Users>

export type SerializedUser = ReturnType<typeof serializeUser>

export function serializeUser(user: User, isAdmin: boolean = false) {
    const { passwordHash, ...serializedUser } = user
    return { ...serializedUser, isAdmin }
}
