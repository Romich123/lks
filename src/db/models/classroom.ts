import { Column, createTable, ReadyBlueprintToInstance, Table } from "@/lib/createTable"
import { database } from ".."

export const Classrooms = Table.jsonTags(database, "classrooms", {
    id: Column.primaryKey(),

    building: { type: "TEXT" },
    name: { type: "TEXT" },
    floor: { type: "INTEGER" },

    peopleCapacity: { type: "INTEGER" },

    type: { type: "TEXT", enum: ["МА", "ТК", "ПА"] as const },
})

export type BaseClassroom = ReadyBlueprintToInstance<typeof Classrooms>
export type Classroom = BaseClassroom & { [k: string]: any }
