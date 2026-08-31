import { firstWeekFirstDay } from "@/constants";
import { JSDOM } from "jsdom"
import { writeFileSync } from "node:fs"

export type ConsultingData = {
    weekIndex: number
    weekDayIndex: number
    room: string

    type: string

    timeStart: readonly [number, number]
    timeEnd: readonly [number, number]

    lessonStart: number
    lessonEnd: number

    teacher: string
}

export type LessonData = {
    weekIndex: number
    weekDayIndex: number
    room: string
    teacher: string | undefined
    type: string | undefined
    name: string
    groups: string
    lessonIndex: number
}

export type Schedule = {
    lessons: { [classRoom: string]: LessonData[] }[][]
    consults: { [classRoom: string]: ConsultingData[] }[][]
}

export type ScheduleFetchingUpdate =
    | {
          type: "FailedFetch"
          group: string
          weekIndex: number
          reason?: any
      }
    | {
          type: "NewBatchStarted"
          progress: number
          maxProgress: number
      }
    | {
          type: "Lesson"
          lesson: LessonData
      }
    | {
          type: "Consult"
          consult: ConsultingData
      }
    | {
          type: "Intersection"
          weekIndex: number
          weekDayIndex: number
          room: string
          lessonIndex: number
          teacherA: string
          teacherB: string
      }

function getWeekInfo(lessonDate: Date): { weekIndex: number; weekDayIndex: number } {
    const lesson = new Date(lessonDate)
    const scheduleStart = new Date(firstWeekFirstDay)

    lesson.setHours(0, 0, 0, 0)
    scheduleStart.setHours(0, 0, 0, 0)

    const daysDiff = Math.floor((lesson.getTime() - scheduleStart.getTime()) / (24 * 60 * 60 * 1000))

    const weekDayIndex = (lesson.getDay() + 6) % 7

    const weekIndex = Math.floor(daysDiff / 7) + 1

    return { weekIndex, weekDayIndex }
}

function timeToLessonIndex(time: readonly [number, number]) {
    if (time[0] === 0 && time[1] === 0) {
        return 6
    }

    switch (true) {
        case time[0] < 10 || (time[0] === 10 && time[1] === 0):
            return 0
        case time[0] < 11 || (time[0] === 11 && time[1] <= 45):
            return 1
        case time[0] < 13 || (time[0] === 13 && time[1] <= 30):
            return 2
        case time[0] < 15 || (time[0] === 15 && time[1] <= 30):
            return 3
        case time[0] < 17 || (time[0] === 17 && time[1] <= 15):
            return 4
        case time[0] < 20 || (time[0] === 20 && time[1] <= 45):
            return 5
        case time[0] < 22 || (time[0] === 22 && time[1] <= 30):
            return 6
    }

    throw new Error()
}

function compareTimeStart(a: { timeStart: readonly [number, number] }, b: { timeStart: readonly [number, number] }) {
    return a.timeStart[0] - b.timeStart[0] || a.timeStart[1] - b.timeStart[1]
}

export async function* fetchNSTUGroupWeek(group: string, weekIndex: number, neededRooms: string[]): AsyncGenerator<ScheduleFetchingUpdate, LessonData[], void> {
    if (weekIndex > 18) {
        return []
    }

    try {
        const response = await fetch(`https://nstu.ru/studies/schedule/schedule_classes/schedule?group=${group}&week=${weekIndex}`)

        const pageText = await response.text()
        const dom = new JSDOM(pageText)

        const weekDays = Array.from(dom.window.document.querySelectorAll(".schedule__table-body>.schedule__table-row"))
        const lessons: LessonData[] = []

        for (let weekDayIndex = 0; weekDayIndex < weekDays.length; weekDayIndex++) {
            const day = weekDays[weekDayIndex]!

            const a = day.querySelectorAll(".schedule__table-cell:nth-child(2)").item(0)!
            const outerRows = a.querySelectorAll(":scope>.schedule__table-row")
            const lessonsElements = Array.from(outerRows)

            for (let lessonIndex = 0; lessonIndex < lessonsElements.length; lessonIndex++) {
                const outerLesson = lessonsElements[lessonIndex]!
                const innerRows = Array.from(outerLesson.querySelectorAll(":scope>.schedule__table-cell>.schedule__table-row"))

                for (let subLessonIndex = 0; subLessonIndex < innerRows.length; subLessonIndex++) {
                    const lesson = innerRows[subLessonIndex]!
                    const info = lesson.querySelector(".schedule__table-item")!

                    const teacherInfo = Array.from(info.querySelectorAll(`a[href^="https://ciu.nstu.ru/"]`))
                    const typeInfo = info.querySelector(`.schedule__table-typework`)
                    const roomInfo = info.querySelector(".schedule__table-class")
                    const name = info.childNodes.item(0).textContent?.trim() ?? ""

                    if (!roomInfo) {
                        continue
                    }

                    const room = roomInfo.textContent.trim()

                    if (!neededRooms.includes(room)) {
                        continue
                    }

                    const teacher = teacherInfo.map((teacher) => teacher.textContent.trim()).join(", ")

                    const lessonData: LessonData = {
                        weekIndex,
                        weekDayIndex,
                        room,
                        lessonIndex,
                        teacher,
                        type: typeInfo?.childNodes[typeInfo?.childNodes.length - 1]?.textContent?.trim() ?? undefined,
                        name,
                        groups: group,
                    }

                    yield { type: "Lesson", lesson: lessonData }
                    lessons.push(lessonData)
                }
            }
        }

        return lessons
    } catch (error) {
        yield { type: "FailedFetch", group: group, weekIndex }
        return []
    }
}

export async function fetchNSTUConsult(group: string, neededRooms: string[], maxWeek = 18) {
    const response = await fetch(`https://nstu.ru/studies/schedule/schedule_consult/schedule?group=${group}`)

    const pageText = await response.text()
    const dom = new JSDOM(pageText).window.document

    const dataRows = dom.querySelectorAll(".schedule-consult__table-body>.row")

    let result: { scheduleInfo: string; room: string; teachers: string[] }[] = []
    for (const dataRow of dataRows) {
        const scheduleInfo = dataRow.children.item(0)
        const roomInfo = dataRow.children.item(1)
        const teachers = Array.from(dataRow.querySelectorAll(`a[href^="https://ciu.nstu.ru/"]`)).map((x) => x.textContent)

        result.push({
            scheduleInfo: scheduleInfo?.textContent ?? "",
            room: roomInfo?.textContent ?? "",
            teachers,
        })
    }

    return result
        .filter((x) => neededRooms.some((needed) => x.room.includes(needed.split("-")[1]!)))
        .map((consult) => {
            let resultDates: ConsultingData[] = []

            const schedule = consult.scheduleInfo

            const timeStartInfo = schedule.substring(schedule.length - 14, schedule.length - 9)
            const timeEndInfo = schedule.substring(schedule.length - 5)

            const timeStart = [Number(timeStartInfo.split(":")[0]), Number(timeStartInfo.split(":")[1])] as const
            const timeEnd = [Number(timeEndInfo.split(":")[0]), Number(timeEndInfo.split(":")[1])] as const

            const rooms = consult.room.split(/[\/\,]/)

            if (Number.isSafeInteger(Number(schedule.charAt(0)))) {
                const dates = schedule.split(",")
                dates.pop()

                for (const date of dates) {
                    const [day, month, year] = date.split(".")

                    const dDate = new Date(Number(year) + 2000, Number(month) - 1, Number(day))

                    for (const room of rooms) {
                        const splited = room.split("-")
                        const rightRoom = splited[splited.length - 1]

                        resultDates.push({
                            ...getWeekInfo(dDate),
                            timeStart: timeStart,
                            timeEnd: timeEnd,
                            room: "6-" + rightRoom,
                            type: "Консультация",
                            teacher: consult.teachers.join(","),

                            lessonStart: timeToLessonIndex(timeStart),
                            lessonEnd: timeToLessonIndex(timeEnd),
                        })
                    }
                }
            } else {
                const [weekDay, weekInfo, additional] = schedule.split(",") as [string, string, string]

                const weekDayIndex = {
                    Понедельник: 0,
                    Вторник: 1,
                    Среда: 2,
                    Четверг: 3,
                    Пятница: 4,
                    Суббота: 5,
                }[weekDay]!

                const weekPeriod = Number(weekInfo.match(/\d+/)?.[0] ?? "0") + 1
                const weekStart = Number(additional.match(/\d+/)?.[0] ?? "1")

                for (let weekIndex = weekStart; weekIndex < maxWeek; weekIndex += weekPeriod) {
                    for (const room of rooms) {
                        const splited = room.split("-")
                        const rightRoom = splited[splited.length - 1]

                        resultDates.push({
                            weekIndex: weekIndex,
                            weekDayIndex: weekDayIndex,
                            timeStart: timeStart,
                            timeEnd: timeEnd,
                            room: "6-" + rightRoom,
                            type: "Консультация",
                            teacher: consult.teachers.join(","),

                            lessonStart: timeToLessonIndex(timeStart),
                            lessonEnd: timeToLessonIndex(timeEnd),
                        })
                    }
                }
            }

            return resultDates satisfies ConsultingData[]
        })
        .flat(1) as ConsultingData[]
}

export async function fetchNSTUExams(group: string, neededRooms: string[]) {
    const response = await fetch(`https://nstu.ru/studies/schedule/schedule_session/schedule?group=${group}`)

    const pageText = await response.text()
    const dom = new JSDOM(pageText).window.document

    const table = dom.querySelector(".schedule__session")

    if (!table) {
        console.log(group, "no table")
        return []
    }

    const rows = table.querySelectorAll(".schedule__session-body>.schedule__session-row")

    const result: ConsultingData[] = []

    for (const dayRow of rows) {
        const [dateStr, monthStr, yearStr] = dayRow.querySelector(".schedule__session-day")!.textContent.split(".")

        const dDate = new Date(Number(yearStr) + 2000, Number(monthStr) - 1, Number(dateStr))

        const weekInfo = getWeekInfo(dDate)

        if (weekInfo.weekDayIndex < 0 || weekInfo.weekIndex < 1) {
            continue
        }
        for (const row of dayRow.querySelectorAll(":scope>.schedule__session-cell>.schedule__session-row")) {
            const classInfo = row.querySelector(".schedule__session-class")!.textContent.trim()

            if (!neededRooms.includes(classInfo)) {
                continue
            }

            const timeInfo = row.querySelector(".schedule__session-time")!.textContent.trim()
            const typeInfo = row.querySelector(".schedule__session-label")!.textContent.trim()

            const time = timeInfo.split(":").map(Number) as [number, number]
            const timeEnd = [time[0] + 2, time[1]] as const

            const teacherInfo = Array.from(row.querySelectorAll(`a[href^="https://ciu.nstu.ru/"]`))

            result.push({
                ...weekInfo,
                room: classInfo,
                teacher: Array.from(new Set(teacherInfo.map((x) => x.textContent.trim()))).join(", "),
                type: typeInfo as any,
                timeStart: time,
                timeEnd: timeEnd,
                lessonStart: timeToLessonIndex(time),
                lessonEnd: timeToLessonIndex(time) + 1,
            })
        }
    }

    return result
}

export async function* fetchNSTUSchedule(
    groups: string[],
    rooms: string[],
    weeks: number[],
    maxWeek: number = 18,
    fetchOptions: Partial<{ batchSize: number; batchDelay: number }> = {},
): AsyncGenerator<ScheduleFetchingUpdate, Schedule, void> {
    const batchSize = fetchOptions.batchSize ?? 100
    const batchDelay = fetchOptions.batchDelay ?? 100

    const result: Schedule = { lessons: [], consults: [] }

    const tasks: { group: string; weekIndex: number }[] = []

    for (const weekIndex of weeks) {
        for (const group of groups) {
            tasks.push({ group, weekIndex })
        }
    }

    for (let i = 0; i < tasks.length; i += batchSize) {
        const batch = tasks.slice(i, i + batchSize)
        yield { type: "NewBatchStarted", progress: Math.min(tasks.length, i + batchSize), maxProgress: tasks.length + groups.length }

        for (const task of batch) {
            const { weekIndex } = task
            result.lessons[weekIndex] ??= []
            if (Number.isNaN(weekIndex)) {
                throw new Error()
            }

            if (weekIndex > 18) {
                continue
            }

            const weekResult = fetchNSTUGroupWeek(task.group, task.weekIndex, rooms)

            let update
            while (!(update = await weekResult.next()).done) {}

            for (const lesson of update.value) {
                const { weekDayIndex, room, lessonIndex, teacher } = lesson
                result.lessons[weekIndex][weekDayIndex] ??= {}
                result.lessons[weekIndex][weekDayIndex][room] ??= []

                if (result.lessons[weekIndex][weekDayIndex][room][lessonIndex] && result.lessons[weekIndex][weekDayIndex][room][lessonIndex].teacher !== teacher) {
                    yield {
                        type: "Intersection",
                        weekIndex,
                        weekDayIndex,
                        room,
                        lessonIndex,
                        teacherA: result.lessons[weekIndex][weekDayIndex][room][lessonIndex].teacher ?? "",
                        teacherB: teacher ?? "",
                    }
                }
                result.lessons[weekIndex][weekDayIndex][room][lessonIndex] = lesson

                yield { type: "Lesson", lesson: lesson }
            }
        }

        await new Promise((resolve) => setTimeout(resolve, batchDelay))
    }

    const consultingData: ConsultingData[] = []
    const examsData: ConsultingData[] = []

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
        const group = groups[groupIndex]!

        yield { type: "NewBatchStarted", progress: tasks.length + groupIndex + 1, maxProgress: tasks.length + groups.length }

        consultingData.push(...(await fetchNSTUConsult(group, rooms, maxWeek)))
        examsData.push(...(await fetchNSTUExams(group, rooms)))
    }

    for (const consult of consultingData) {
        const { weekIndex, weekDayIndex, room, lessonStart, lessonEnd } = consult
        result.consults[weekIndex] ??= []
        result.consults[weekIndex][weekDayIndex] ??= {}
        result.consults[weekIndex][weekDayIndex][room] ??= []

        for (let i = lessonStart; i <= lessonEnd; i++) {
            result.consults[weekIndex][weekDayIndex][room][i] = consult
        }

        yield { type: "Consult", consult }
    }

    // Exams are more important than consults. Later exams should also win
    // overlapping lesson slots because they start inside the next lesson.
    for (const consult of examsData.sort(compareTimeStart)) {
        const { weekIndex, weekDayIndex, room, lessonStart, lessonEnd } = consult
        result.consults[weekIndex] ??= []
        result.consults[weekIndex][weekDayIndex] ??= {}
        result.consults[weekIndex][weekDayIndex][room] ??= []

        for (let i = lessonStart; i <= lessonEnd; i++) {
            result.consults[weekIndex][weekDayIndex][room][i] = consult
        }

        yield { type: "Consult", consult }
    }

    return result
}

export async function fetchNSTUFacultyGroups(facultyId: string) {
    const classesSite = new JSDOM(await (await fetch(`https://nstu.ru/studies/schedule/schedule_classes`)).text()).window.document
    const sessionSite = new JSDOM(await (await fetch(`https://nstu.ru/studies/schedule/schedule_session`)).text()).window.document

    const facultyClass = classesSite.querySelector(`.schedule__faculty.js-schedule-faculty[data-id="${facultyId}"]`)
    const facultySession = sessionSite.querySelector(`.schedule__faculty.js-schedule-faculty[data-id="${facultyId}"]`)

    const result = new Set<string>()

    if (facultyClass) {
        ;(
            Array.from(facultyClass.querySelectorAll("a.schedule__faculty-groups__item"))
                .map((el) => el.textContent)
                .filter(Boolean) as string[]
        ).forEach((val) => result.add(val))
    }

    if (facultySession) {
        ;(
            Array.from(facultySession.querySelectorAll("a.schedule__faculty-groups__item"))
                .map((el) => el.textContent)
                .filter(Boolean) as string[]
        ).forEach((val) => result.add(val))
    }

    return Array.from(result)
}
