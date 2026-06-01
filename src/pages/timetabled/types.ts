export type TimetableAssignment = {
    startHour: number
    startMinute: number
    endHour: number
    endMinute: number
    who: string
    contact: string
}

export type Timetable = {
    schedule: TimetableAssignment[][]
    startWeek: number
}

export const dayNames = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"]
export const parityNames = ["Неч.", "Чет."]

export const startHour = 8
export const endHour = 20
export const partsPerHour = 4
export const minutesPerPart = 60 / partsPerHour
export const totalParts = (endHour - startHour) * partsPerHour

export function createEmptyTimetable(): Timetable {
    return {
        schedule: Array.from({ length: 14 }, () => []),
        startWeek: 0,
    }
}

export function normalizeTimetable(value: Partial<Timetable> | null | undefined): Timetable {
    const fallback = createEmptyTimetable()
    const source = value?.schedule
    const startWeek = value?.startWeek

    if (!Array.isArray(source)) {
        return fallback
    }

    return {
        startWeek: Number.isSafeInteger(startWeek) ? startWeek! : 0,
        schedule: Array.from({ length: 14 }, (_, index) => (Array.isArray(source[index]) ? source[index]! : [])),
    }
}

export function getISOWeekNumber(date: Date) {
    const d = new Date(date.valueOf())
    const dayNr = (d.getDay() + 6) % 7
    d.setDate(d.getDate() - dayNr + 3)
    const jan4 = new Date(d.getFullYear(), 0, 4)
    const dayDiff = (d.getTime() - jan4.getTime()) / 86400000
    return 1 + Math.ceil(dayDiff / 7)
}

export function getCurrentStudyWeek(startWeek: number, date = new Date()) {
    return getISOWeekNumber(date) - startWeek
}

export function getDayIndexForDate(startWeek: number, date = new Date()) {
    const week = getCurrentStudyWeek(startWeek, date)
    const dayOfWeek = (date.getDay() + 6) % 7
    return week % 2 ? dayOfWeek : dayOfWeek + 7
}

export function formatTime(hour: number, minute: number) {
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

export function assignmentStart(assignment: TimetableAssignment) {
    return assignment.startHour * 60 + assignment.startMinute
}

export function assignmentEnd(assignment: TimetableAssignment) {
    return assignment.endHour * 60 + assignment.endMinute
}

export function findCurrentAssignment(timetable: Timetable, date = new Date()) {
    const day = timetable.schedule[getDayIndexForDate(timetable.startWeek, date)] ?? []
    const currentTime = date.getHours() * 60 + date.getMinutes()

    return day.find((assignment) => assignmentStart(assignment) <= currentTime && currentTime <= assignmentEnd(assignment)) ?? null
}
