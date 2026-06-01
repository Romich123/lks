import { Column, createTable, Table } from "@/lib/createTable"
import { database } from ".."
import { Classrooms } from "./classroom"

export const Equipment = Table.jsonTags(database, "equipment", {
    id: Column.primaryKey(),

    currentClassroom: Column.foreignKey(Classrooms.id, true),

    name: { type: "TEXT" },
    identifier: { type: "TEXT" },
})

export type Equipment = {
    id: number
    currentClassroom: number | null
    name: string
    identifier: string
    [k: string]: any
}
