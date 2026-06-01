import { Column, createTable } from "@/lib/createTable"
import { database } from ".."

export const Teachers = createTable(database, "teachers", {
    id: Column.primaryKey(),

    // for indexing in nstu.ru
    firstId: { type: "TEXT" },
    secondId: { type: "TEXT" },

    fullName: { type: "TEXT" },
})
