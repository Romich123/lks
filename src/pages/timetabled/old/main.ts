import "./style.css"
import template from "./resultTemplate.html?raw"

const weekDays = [
    "Понедельник Неч.",
    "Вторник Неч.",
    "Среда Неч.",
    "Четверг Неч.",
    "Пятница Неч.",
    "Суббота Неч.",
    "Воскресенье Неч.",
    "Понедельник Чет.",
    "Вторник Чет.",
    "Среда Чет.",
    "Четверг Чет.",
    "Пятница Чет.",
    "Суббота Чет.",
    "Воскресенье Чет.",
]
const shortsWeekDays = ["Пн Н", "Вт Н", "Ср Н", "Чт Н", "Пт Н", "Сб Н", "Вс Н", "Пн Ч", "Вт Ч", "Ср Ч", "Чт Ч", "Пт Ч", "Сб Ч", "Вс Ч"]

const headRow = document.querySelector("#head-row")!
const tableBody = document.querySelector("#table-body")!

const startHour = 8
const endHour = 20 // non-inclusive

const splitHoursIn = 4
const subHourStep = 60 / splitHoursIn

const subHourParts = Array.from({ length: splitHoursIn }, (_, i) => i * (60 / splitHoursIn))

if (!headRow || !tableBody) {
    throw new Error()
}

const dialogModal = document.querySelector("#myDialog") as HTMLDialogElement

if (!dialogModal) {
    throw new Error()
}
declare global {
    interface Window {
        assignInfoSubmit: () => void
    }
}

async function requestAssignmentInfo(): Promise<{ info: string; callTo: string }> {
    dialogModal.showModal()

    const form = dialogModal.querySelector("form")

    if (!form) {
        throw new Error()
    }

    return new Promise((res) => {
        const onSubmit = (e: SubmitEvent) => {
            e.preventDefault()
            const form = dialogModal.querySelector("form")!
            const formData = new FormData(form)

            dialogModal.close()
            form.removeEventListener("submit", onSubmit)

            res({ info: (formData.get("info") ?? "") + "", callTo: (formData.get("callTo") ?? "") + "" })
        }

        form.addEventListener("submit", onSubmit)
    })
}

const tooltip = document.createElement("div")
tooltip.style.pointerEvents = "none"
tooltip.style.position = "absolute"
tooltip.id = "tooltip"

document.body.appendChild(tooltip)

window.addEventListener("mousemove", (e) => {
    const target = e.target as HTMLDivElement

    if (!target?.dataset?.tooltip) {
        tooltip.style.display = "none"
        return
    }

    const rect = tooltip.getBoundingClientRect()
    const maxLeft = window.innerWidth - rect.width
    const maxTop = window.innerHeight - rect.height

    tooltip.style.display = "block"
    tooltip.style.left = `${Math.min(e.clientX, maxLeft)}px`
    tooltip.style.top = `${Math.min(e.clientY, maxTop)}px`
    tooltip.innerText = target.dataset.tooltip
})

// first column

for (let hour = startHour; hour < endHour; hour++) {
    const colHead = document.createElement("th")

    colHead.innerText = `${(hour + "").padStart(2, "0")}:00`
    headRow.appendChild(colHead)
}

const partKey = (dayIndex: number, hour: number, minute: number) => `${dayIndex}:${hour}:${minute}`
const parts = new Map<string, HTMLDivElement>()

let firstClicked: { dayIndex: number; hour: number; minute: number } | null = null

function doBetween(dayIndex1: number, hour1: number, minute1: number, dayIndex2: number, hour2: number, minute2: number, f: (p: HTMLDivElement) => void) {
    if (dayIndex1 > dayIndex2) {
        ;[dayIndex1, dayIndex2] = [dayIndex2, dayIndex1]
    }

    if (hour1 * 60 + minute1 > hour2 * 60 + minute2) {
        ;[hour1, hour2, minute1, minute2] = [hour2, hour1, minute2, minute1]
    }

    for (let dayIndex = dayIndex1; dayIndex <= dayIndex2; dayIndex++) {
        for (let time = hour1 * 60 + minute1; time <= hour2 * 60 + minute2; time += subHourStep) {
            const hour = Math.floor(time / 60)
            const minute = time % 60
            const part = parts.get(partKey(dayIndex, hour, minute))

            if (!part) {
                throw new Error()
            }

            f(part)
        }
    }
}

function highlightBetween(dayIndex1: number, hour1: number, minute1: number, dayIndex2: number, hour2: number, minute2: number) {
    doBetween(dayIndex1, hour1, minute1, dayIndex2, hour2, minute2, (p) => p.classList.add("cell-highlight"))
}

type Assignment = {
    startHour: number
    startMinute: number
    endHour: number
    endMinute: number

    who: string
    contact: string
}

const schedule: Assignment[][] = weekDays.map(() => [])
const floatingKey = (dayIndex: number, ass: Assignment) => `${dayIndex}:${ass.startHour}:${ass.startMinute}-${ass.endHour}:${ass.endMinute}`
const floatingAssignments = new Map<string, HTMLDivElement>()

function createFloating(dayIndex: number, ass: Assignment) {
    const element = document.createElement("div")
    element.classList.add("floating-assignment")
    element.innerText = `${ass.who}\n${ass.contact}`
    element.dataset.tooltip = `${shortsWeekDays[dayIndex]} ${(ass.startHour + "").padStart(2, "0")}:${(ass.startMinute + "").padStart(2, "0")}-${(ass.endHour + "").padStart(2, "0")}:${(ass.endMinute + "").padStart(2, "0")}\n${ass.who}\n${ass.contact}`

    const left = parts.get(partKey(dayIndex, ass.startHour, ass.startMinute))
    const right = parts.get(partKey(dayIndex, ass.endHour, ass.endMinute))

    if (!left || !right) {
        throw new Error()
    }

    function resize() {
        const lRect = left!.getBoundingClientRect()
        const rRect = right!.getBoundingClientRect()

        element.style.top = `${lRect.top}px`
        element.style.height = `${lRect.height}px`
        element.style.left = `${lRect.left}px`
        element.style.width = `${rRect.left - lRect.left}px`
    }
    resize()

    window.addEventListener("resize", resize)

    element.addEventListener("contextmenu", (e) => {
        e.stopPropagation()
        e.preventDefault()

        const day = schedule[dayIndex]

        const assIndex = day.indexOf(ass)

        if (assIndex !== -1) {
            day.splice(assIndex, 1)
        }

        updateFloatingAssignments()
    })

    document.body.appendChild(element)

    floatingAssignments.set(floatingKey(dayIndex, ass), element)
}

function updateFloatingAssignments() {
    for (const key of floatingAssignments.keys()) {
        const floating = floatingAssignments.get(key)
        floatingAssignments.delete(key)

        floating?.parentNode?.removeChild?.(floating)
    }

    for (let dayIndex = 0; dayIndex < schedule.length; dayIndex++) {
        const day = schedule[dayIndex]

        for (const ass of day) {
            createFloating(dayIndex, ass)
        }
    }
}

function changeFirst(a: Assignment, b: Assignment): Assignment | null {
    const aStart = a.startHour * 60 + a.startMinute
    const aEnd = a.endHour * 60 + a.endMinute
    const bStart = b.startHour * 60 + b.startMinute
    const bEnd = b.endHour * 60 + b.endMinute

    if (aStart >= bStart && aEnd <= bEnd) {
        return null
    }

    if (bStart > aStart) {
        const aEndTime = Math.min(bStart, aEnd)

        return {
            ...a,
            endHour: Math.floor(aEndTime / 60),
            endMinute: aEndTime % 60,
        }
    }

    const aStartTime = Math.max(aStart, bEnd)

    return {
        ...a,
        startHour: Math.floor(aStartTime / 60),
        startMinute: aStartTime % 60,
    }
}

function assignBetween(dayIndex1: number, hour1: number, minute1: number, dayIndex2: number, hour2: number, minute2: number) {
    if (dayIndex1 > dayIndex2) {
        ;[dayIndex1, dayIndex2] = [dayIndex2, dayIndex1]
    }

    if (hour1 * 60 + minute1 > hour2 * 60 + minute2) {
        ;[hour1, hour2, minute1, minute2] = [hour2, hour1, minute2, minute1]
    }

    requestAssignmentInfo().then(({ info, callTo }) => {
        const assignmentTemplate: Assignment = { startHour: hour1, startMinute: minute1, endHour: hour2, endMinute: minute2, who: info, contact: callTo }

        for (let dayIndex = dayIndex1; dayIndex <= dayIndex2; dayIndex++) {
            let assignments = schedule[dayIndex]

            for (let i = 0; i < assignments.length; i++) {
                // @ts-ignore
                assignments[i] = changeFirst(assignments[i], assignmentTemplate)
            }

            assignments.push(assignmentTemplate)
            schedule[dayIndex] = assignments.filter(Boolean)
        }

        updateFloatingAssignments()
    })
}

for (let dayIndex = 0; dayIndex < weekDays.length; dayIndex++) {
    const dayRow = document.createElement("tr")

    const weekDayLabel = document.createElement("th")
    weekDayLabel.innerText = weekDays[dayIndex]

    dayRow.appendChild(weekDayLabel)

    for (let hour = startHour; hour < endHour; hour++) {
        const hourCell = document.createElement("td")

        const partsWrapper = document.createElement("div")
        partsWrapper.classList.add("parts-wrapper")

        for (const subHourMinute of subHourParts) {
            const subPart = document.createElement("div")
            parts.set(partKey(dayIndex, hour, subHourMinute), subPart)

            subPart.addEventListener("click", () => {
                if (!firstClicked) {
                    tableBody.classList.add("add-mode")
                    firstClicked = { dayIndex, hour, minute: subHourMinute }
                    return
                }
                document.querySelectorAll(".cell-highlight").forEach((d) => d.classList.remove("cell-highlight"))

                assignBetween(firstClicked.dayIndex, firstClicked.hour, firstClicked.minute, dayIndex, hour, subHourMinute)
                firstClicked = null
                tableBody.classList.remove("add-mode")
            })

            subPart.addEventListener("mousemove", () => {
                if (!firstClicked) {
                    return
                }
                document.querySelectorAll(".cell-highlight").forEach((d) => d.classList.remove("cell-highlight"))
                highlightBetween(firstClicked.dayIndex, firstClicked.hour, firstClicked.minute, dayIndex, hour, subHourMinute)
            })

            subPart.classList.add("cell-part")
            subPart.dataset.tooltip = `${shortsWeekDays[dayIndex]} ${(hour + "").padStart(2, "0")}:${(subHourMinute + "").padStart(2, "0")}`

            partsWrapper.appendChild(subPart)
        }

        hourCell.appendChild(partsWrapper)
        dayRow.appendChild(hourCell)
    }

    tableBody.appendChild(dayRow)
}

const exportButton = document.querySelector("#export-button") as HTMLButtonElement
const clearButton = document.querySelector("#clear-button") as HTMLButtonElement

if (!exportButton || !clearButton) {
    throw new Error()
}

exportButton.addEventListener("click", () => {
    const data = {
        schedule: schedule,
        startWeek: 0,
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data))
    const dlAnchorElem = document.createElement("a")
    dlAnchorElem.setAttribute("href", dataStr)
    dlAnchorElem.setAttribute("download", "schedule.json")
    dlAnchorElem.click()

    const pageResult = template.replace("// @schedule-insert", "schedule = " + JSON.stringify(data))

    dlAnchorElem.setAttribute("href", "data:text/html;charset=utf-8," + encodeURIComponent(pageResult))
    dlAnchorElem.setAttribute("download", "schedule.html")
    dlAnchorElem.click()
})

clearButton.addEventListener("click", () => {
    schedule.forEach((_, i) => {
        schedule[i] = []
    })
    updateFloatingAssignments()
})
