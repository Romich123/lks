import { LessonData, Schedule } from "./parsing"

const lessonTimesFull = [
    { start: "8:30", end: "10:00" },
    { start: "10:15", end: "11:45" },
    { start: "12:00", end: "13:30" },
    { start: "14:00", end: "15:30" },
    { start: "15:45", end: "17:15" },
    { start: "17:30", end: "19:00" },
]

const lessonTimes = ["8:30-10:00", "10:15-11:45", "12:00-13:30", "14:00-15:30", "15:45-17:15", "17:30-19:00"]
const firstEverDate = new Date(2026, 1, 9)
const weekDays = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"]

function getSignatureTableHead(dateOffset: number) {
    const date = new Date(+firstEverDate + dateOffset * 24 * 60 * 60 * 1000)
    let upRow = `<th class="bf" style="break-before: page;">Дата</th>`
    let bottomRow = `<th>${date.getDate()}.${(date.getMonth() + 1 + "").padStart(2, "0")}.${date.getFullYear()}</th>`

    for (let lessonIndex in lessonTimes) {
        upRow += `<th class="rbb lbb bf" colspan="2">${lessonTimes[lessonIndex]}</th>`
        bottomRow += `<th class="lbb bbb bf">Взятие</th><th class="rbb bbb bf">Сдача</th>`
    }

    return `<tr>${upRow}</tr><tr>${bottomRow}</tr>`
}

const breaksAfter = ["6-603", "6-706", "6-812"]

function transformTeacher(teacher: string | undefined) {
    if (!teacher) {
        return teacher
    }

    return teacher
        .split(", ")
        .map((x) =>
            x
                .split(" ")
                .map((part, index) => {
                    if (index === 0 || part.length < 3) {
                        return part
                    }

                    return part.charAt(0) + "."
                })
                .join(" "),
        )
        .join(", ")
}

const boldBorders = "3px solid black"
const styles = `<style>
                :root {line-height:1;}
                * {box-sizing:border-box;}
                body {margin:0;}
                table {
                    border-collapse: collapse;
                }
                table td, table th {
                    border: 1px solid black;
                    text-align: center;
                }
                .lh2 {
                    height: 2em;
                    vertical-align: top;
                }
                .w {
                    color: #999;
                }
                .b {
                    font-weight: bold;
                }
                .bl {
                    color: black;
                }

                .lbb {
                    border-left: ${boldBorders};
                }
                .rbb {
                    border-right: ${boldBorders};
                }
                .bbb {
                    border-bottom: ${boldBorders};
                }
                .tbb {
                    border-top: ${boldBorders};
                }
                .p {
                    height: auto;
                }
                .ar {
                    text-align: right;
                }
                .bf {
                    background-color: #CCC;
                }
                .k {
                    display: flex;
                    justify-content: space-between;
                    padding: 0 0.2em;
                }
            </style>`

export function generateSignaturePage(schedule: Schedule, weekIndex: number, weekDayIndex: number, rooms: string[]) {
    const tableHead = getSignatureTableHead((weekIndex - 1) * 7 + weekDayIndex)

    let rows = ``

    const afterRows: { top: string; bottom: string }[] = []

    for (let roomIndex = 0; roomIndex < rooms.length; roomIndex++) {
        const room = rooms[roomIndex]

        let upRow = `<td rowspan="2" class="rbb b bf" style="font-size: 30px;">${room.split("-")[1]}</td>`
        let botRow = ``

        const lessons = schedule.lessons[weekIndex]?.[weekDayIndex]?.[room]
        const consults = schedule.consults[weekIndex]?.[weekDayIndex]?.[room]

        for (let lessonIndex = 0; lessonIndex < lessonTimes.length; lessonIndex++) {
            const lesson = lessons?.[lessonIndex]
            const consult = consults?.[lessonIndex]

            const lessonStart = lessonTimesFull[lessonIndex].start

            if (!lesson && !consult) {
                upRow += `<td colspan="2" class="rbb lbb rbb w bf lh2">ФИО</td>`
                botRow += `<td class="lbb bbb w p bf">${lessonStart}<br>Подпись</td>`
                botRow += `<td class="rbb bbb w p bf">${lessonTimesFull[lessonIndex].end}<br>Подпись</td>`

                continue
            }

            if (lesson) {
                const teacher = transformTeacher(lesson.teacher)!

                botRow += `<td class="lbb bbb w p">${lessonStart}<br>Подпись</td>`

                let span = 1

                let goingOutside = false
                while (teacher && lessons?.[lessonIndex + 1]?.teacher === teacher) {
                    if (lessonTimes.length <= lessonIndex + 1) {
                        goingOutside = true
                        break
                    }
                    span++
                    lessonIndex++
                    botRow += `<td class="bbb">&mdash;</td><td class="bbb">&mdash;</td>`
                }

                upRow += `<td colspan="${span * 2}" class="rbb lbb rbb b lh2">
                            <span>${teacher}</span>
                        </td>`

                if (goingOutside) {
                    botRow += `<td class="bbb">&mdash;</td>`
                } else {
                    botRow += `<td class="rbb bbb w p">${lessonTimesFull[lessonIndex].end}<br>Подпись</td>`
                }
                continue
            }

            if (!lesson) {
                const teacher = transformTeacher(consult.teacher)!

                function formatTime(time: readonly [number, number]) {
                    return `${(time[0] + "").padStart(2, "0")}:${(time[1] + "").padStart(2, "0")}`
                }

                botRow += `<td class="lbb bbb w p">${formatTime(consult.timeStart)}<br>Подпись</td>`

                let span = 1

                let goingOutside = false
                while (teacher && consults?.[lessonIndex + 1]?.teacher === teacher && !lessons?.[lessonIndex + 1]) {
                    if (lessonTimes.length <= lessonIndex + 1) {
                        goingOutside = true
                        break
                    }
                    span++
                    lessonIndex++
                    botRow += `<td class="bbb">&mdash;</td><td class="bbb">&mdash;</td>`
                }

                upRow += `<td colspan="${span * 2}" class="rbb lbb rbb b lh2">
                            <div class="k">
                                <span>${teacher}</span>
                                <span>K</span>
                            </div>
                        </td>`

                if (goingOutside) {
                    botRow += `<td class="bbb">&mdash;</td>`
                } else {
                    botRow += `<td class="rbb bbb w p">${formatTime(consult.timeEnd)}<br>Подпись</td>`
                }
                continue
            }
        }

        rows += `<tr>${upRow}</tr><tr>${botRow}</tr>`
        if (breaksAfter.includes(room)) {
            rows += tableHead
        }

        const lastLesson = (lessons ?? [])[lessons?.length ?? 0]

        if (roomIndex % 4 === 0) {
            afterRows.push({ top: "", bottom: "" })
        }
        const row = afterRows[afterRows.length - 1]
        row.top += `<td rowspan="2" class="b bf" style="font-size: 30px; height: 2.4em;">${room.split("-")[1]}</td><td colspan="2" class="b">${lastLesson?.teacher ?? "ФИО"}</td>`
        row.bottom += `<td class="w p" colspan="2">Подпись</td>`
    }

    return `<!DOCTYPE html>
    <html>
        <head>
            <title>Неделя ${weekIndex} ${weekDays[weekDayIndex]}</title>
            ${styles}
            <!-- ${new Date().toString()} -->
        </head>
        <body>
            <table width="100%">
                ${tableHead}
                ${rows}
                ${afterRows.map((row) => `<tr>${row.top}</tr><tr>${row.bottom}</tr>`).join("")}
            </table>
        </body>
    </html>`
}

export function generateAfterEndPage(schedule: Schedule, weekIndex: number, weekDayIndex: number, rooms: string[]) {
    return `<!DOCTYPE html>
    <html>
        <head>
            <title>Неделя ${weekIndex} ${weekDays[weekDayIndex]}</title>
            ${styles}
            <!-- ${new Date().toString()} -->
        </head>
        <body>
        </body>
    </html>`
}

export function generateSignaturePages(schedule: Schedule, rooms: string[]) {
    const result: string[][] = []
    for (let weekIndex = 0; weekIndex < schedule.lessons.length; weekIndex++) {
        const week = schedule.lessons[weekIndex]

        for (let weekDayIndex = 0; weekDayIndex < weekDays.length; weekDayIndex++) {
            const day = week?.[weekDayIndex]

            if (!day) {
                continue
            }

            result[weekIndex] ??= []
            result[weekIndex][weekDayIndex] = generateSignaturePage(schedule, weekIndex, weekDayIndex, rooms)
        }
    }

    return result
}

function getClothingTableHead() {
    let upRow = `<th>Дата</th>`

    for (let lessonIndex in lessonTimes) {
        upRow += `<th class="rbb lbb">${lessonTimes[lessonIndex]}</th>`
    }

    return `<thead><tr>${upRow}</tr></thead>`
}

const clothingTableHead = getClothingTableHead()

export function generateClothingPage(schedule: Schedule, weekIndex: number, weekDayIndex: number, rooms: string[], breakAfterRoom?: string) {
    const tableHead = clothingTableHead

    const boldBorders = "3px solid black"

    let rows = ``

    for (let roomIndex = 0; roomIndex < rooms.length; roomIndex++) {
        const room = rooms[roomIndex]

        let upRow = `<td class="rbb b">${room.split("-")[1]}</td>`

        const lessons = schedule.lessons[weekIndex]?.[weekDayIndex]?.[room]

        for (let lessonIndex = 0; lessonIndex < lessonTimes.length; lessonIndex++) {
            const teacher = lessons?.[lessonIndex] ?? ""
            const isEmpty = !teacher

            if (isEmpty) {
                upRow += `<td class="rbb lbb rbb w">ФИО</td>`
                continue
            }

            upRow += `<td class="rbb lbb rbb ${isEmpty ? "w" : "b"}">${teacher || "ФИО"}</td>`
        }

        if (breakAfterRoom === room) {
            rows += `<tr style="page-break-after: always;">${upRow}</tr>`
        } else {
            rows += `<tr>${upRow}</tr>`
        }
    }

    return `<!DOCTYPE html>
    <html>
        <head>
            <title>Неделя ${weekIndex} ${weekDays[weekDayIndex]}</title>
            ${styles}
            <!-- ${new Date().toString()} -->
        </head>
        <body>
            <table>
                ${tableHead}
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </body>
    </html>`
}

export function generateClothingPages(schedule: Schedule, rooms: string[], breakAfterRoom?: string) {
    const result: string[][] = []

    for (let weekIndex = 0; weekIndex < schedule.lessons.length; weekIndex++) {
        const week = schedule.lessons[weekIndex]
        for (let weekDayIndex = 0; weekDayIndex < weekDays.length; weekDayIndex++) {
            const day = week?.[weekDayIndex]

            if (!day) {
                continue
            }

            result[weekIndex] ??= []
            result[weekIndex].push(generateClothingPage(schedule, weekIndex, weekDayIndex, rooms, breakAfterRoom))
        }
    }

    return result
}
