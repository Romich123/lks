import { Column, createTable } from "@/lib/createTable"
import { database } from ".."
import { Teachers } from "./teacher"
import { Classrooms } from "./classroom"

export const Lessons = createTable(database, "lessons", {
    id: Column.primaryKey(),

    teacherId: Column.foreignKey(Teachers.id),
    classroomId: Column.foreignKey(Classrooms.id),

    // starts from 1
    week: { type: "INTEGER" },
    // starts from 0
    weekDay: { type: "INTEGER" },
    // 0 => first lesson, 1 => second etc.
    lesson: { type: "INTEGER" },
})
