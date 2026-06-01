import { Classrooms } from "@/db/models/classroom"
import { Equipment } from "@/db/models/equipment"
import { Lessons } from "@/db/models/lesson"
import { Teachers } from "@/db/models/teacher"
import { ResponseErrors } from "./errors"
import { RouteHandler, loginHandler, recheckHandler, requiresAdmin } from "./auth"
import { Schedule } from "@/lib/nstuParsing"
import { schedulePath, timeTablePath } from ".."
import { readFile, writeFile } from "node:fs/promises"

type TimetableAssignment = {
    startHour: number
    startMinute: number
    endHour: number
    endMinute: number
    who: string
    contact: string
}

type Timetable = {
    schedule: TimetableAssignment[][]
    startWeek: number
}

function isTimetableAssignment(value: unknown): value is TimetableAssignment {
    if (typeof value !== "object" || value === null) return false

    const assignment = value as Partial<TimetableAssignment>
    return (
        Number.isSafeInteger(assignment.startHour) &&
        Number.isSafeInteger(assignment.startMinute) &&
        Number.isSafeInteger(assignment.endHour) &&
        Number.isSafeInteger(assignment.endMinute) &&
        typeof assignment.who === "string" &&
        typeof assignment.contact === "string"
    )
}

function isTimetable(value: unknown): value is Timetable {
    if (typeof value !== "object" || value === null) return false

    const timetable = value as Partial<Timetable>
    return Number.isSafeInteger(timetable.startWeek) && Array.isArray(timetable.schedule) && timetable.schedule.every((day) => Array.isArray(day) && day.every(isTimetableAssignment))
}

export const apiRoutes = {
    "/api/login": {
        POST: loginHandler,
    },

    "/api/authCheck": recheckHandler,

    "/api/lessons/getAll": () => Response.json(Lessons.getAll({ include: [Teachers, Classrooms] })),
    "/api/teachers/getAll": () => Response.json(Teachers.getAll()),
    "/api/classrooms/getAll": () => {
        const classrooms = Classrooms.getAll()
        const equipment = Equipment.getAll()
        const equipmentCountByClassroom = new Map<number, number>()

        equipment.forEach((item) => {
            if (item.currentClassroom === null) return
            equipmentCountByClassroom.set(item.currentClassroom, (equipmentCountByClassroom.get(item.currentClassroom) ?? 0) + 1)
        })

        return Response.json({
            keys: Classrooms.getAllTagKeys(),
            classrooms: classrooms.map((classroom) => ({
                ...classroom,
                equipmentCount: equipmentCountByClassroom.get(classroom.id) ?? 0,
            })),
        })
    },
    "/api/equipment/getAll": () => Response.json({ keys: Equipment.getAllTagKeys(), equipment: Equipment.getAll() }),
    "/api/equipment/delete/:id": {
        DELETE: requiresAdmin((req) => {
            const id = Number(req.params.id)

            if (typeof id !== "number") {
                return Response.json({ success: false, error: ResponseErrors.wrongType("id", "number") }, { status: 400 })
            }

            try {
                Equipment.deleteAllBy("id", id)
                return Response.json({ success: true, id: id })
            } catch {
                return Response.json({ success: false, error: ResponseErrors.internal() }, { status: 500 })
            }
        }),
    },
    "/api/equipment/create": {
        POST: requiresAdmin(async (req) => {
            const body = Equipment.softlyTypeInstance(await req.json(), ["id"])

            if (body && Equipment.verifyInstance(body, ["id"])) {
                const [equipment, error] = Equipment.insert(body, true)

                if (error) {
                    return Response.json({ success: false, errorStr: error, error: ResponseErrors.internal() }, { status: 500 })
                }

                return Response.json({ success: true, equipment })
            }

            return Response.json({ success: false, error: ResponseErrors.wrongType("request body", "json object") }, { status: 400 })
        }),
    },
    "/api/equipment/edit": {
        PUT: requiresAdmin(async (req) => {
            const body = Equipment.softlyTypeInstance(await req.json())

            if (body && Equipment.verifyInstance(body)) {
                const [equipment, error] = Equipment.update(body, true)

                if (error) {
                    return Response.json({ success: false, errorStr: error, error: ResponseErrors.internal() }, { status: 500 })
                }

                return Response.json({ success: true, equipment })
            }

            return Response.json({ success: false, error: ResponseErrors.wrongType("request body", "json object") }, { status: 400 })
        }),
    },
    "/api/classrooms/delete/:id": {
        DELETE: requiresAdmin((req) => {
            const id = Number(req.params.id)

            if (typeof id !== "number") {
                return Response.json({ success: false, error: ResponseErrors.wrongType("id", "number") }, { status: 400 })
            }

            try {
                Classrooms.deleteAllBy("id", id)
                return Response.json({ success: true, id: id })
            } catch {
                return Response.json({ success: false, error: ResponseErrors.internal() }, { status: 500 })
            }
        }),
    },
    "/api/classrooms/create": {
        POST: requiresAdmin(async (req) => {
            const body = Classrooms.softlyTypeInstance(await req.json(), ["id"])

            if (body && Classrooms.verifyInstance(body, ["id"])) {
                const [classroom, error] = Classrooms.insert(body, true)

                if (error) {
                    return Response.json({ success: false, errorStr: error, error: ResponseErrors.internal() }, { status: 500 })
                }

                return Response.json({ success: true, classroom })
            }

            return Response.json({ success: false, error: ResponseErrors.wrongType("request body", "json object") }, { status: 400 })
        }),
    },
    "/api/classrooms/edit": {
        PUT: requiresAdmin(async (req) => {
            const body = Classrooms.softlyTypeInstance(await req.json())

            if (body && Classrooms.verifyInstance(body)) {
                const [classroom, error] = Classrooms.update(body, true)

                if (error) {
                    return Response.json({ success: false, errorStr: error, error: ResponseErrors.internal() }, { status: 500 })
                }

                return Response.json({ success: true, classroom })
            }

            return Response.json({ success: false, error: ResponseErrors.wrongType("request body", "json object") }, { status: 400 })
        }),
    },
    "/api/schedule": {
        GET: async () => {
            try {
                return new Response(await readFile(schedulePath, "utf8"), {
                    headers: {
                        "Content-Type": "application/json",
                    },
                })
            } catch {
                return Response.json({ lessons: [], consults: [] })
            }
        },
        PUT: requiresAdmin(async (req) => {
            try {
                const body = (await req.json()) as Partial<Schedule>

                if (!body || !Array.isArray(body.lessons) || !Array.isArray(body.consults)) {
                    return Response.json({ success: false, error: ResponseErrors.wrongType("request body", "Schedule") }, { status: 400 })
                }

                await writeFile(schedulePath, JSON.stringify(body))
                return Response.json({ success: true })
            } catch (e) {
                console.error(e)
                return Response.json({ success: false, error: ResponseErrors.internal() }, { status: 500 })
            }
        }),
    },
    "/api/timetable": {
        GET: async () => {
            try {
                return new Response(await readFile(timeTablePath, "utf8"), {
                    headers: {
                        "Content-Type": "application/json",
                    },
                })
            } catch {
                return Response.json({ schedule: Array.from({ length: 14 }, () => []), startWeek: 0 } satisfies Timetable)
            }
        },
        PUT: requiresAdmin(async (req) => {
            try {
                const body = await req.json()

                if (!isTimetable(body)) {
                    return Response.json({ success: false, error: ResponseErrors.wrongType("request body", "Timetable") }, { status: 400 })
                }

                await writeFile(timeTablePath, JSON.stringify(body))
                return Response.json({ success: true })
            } catch (e) {
                console.error(e)
                return Response.json({ success: false, error: ResponseErrors.internal() }, { status: 500 })
            }
        }),
    },
} satisfies Record<string, RouteHandler | Record<string, RouteHandler>>
